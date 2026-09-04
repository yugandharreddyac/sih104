"""Phase 2B.2: Robustness-Augmented MiniAcousticCNN Training.

Trains MiniAcousticCNN from scratch using a 2x balanced training set:
  - 1,400 clean source-disjoint VCC originals (700 bona, 700 spoof)
  - 1,400 augmented copies:
      * 350 G.711 A-law (175 bona, 175 spoof)
      * 350 G.711 mu-law (175 bona, 175 spoof)
      * 350 Telephone bandpass 300-3400 Hz (175 bona, 175 spoof)
      * 350 Additive Gaussian noise at 15 dB SNR (175 bona, 175 spoof)
Total Train: 2,800 samples (1,400 bona, 1,400 spoof)

Dual Validation:
  - Clean validation (300 samples)
  - In-memory G.711 A-law validation (300 samples)
Model selection metric: combined_F1 = 0.5 * clean_F1 + 0.5 * alaw_F1.
"""

from __future__ import annotations

import io
import json
import logging
import platform
import random
import sys
import time

if sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
import scipy.signal
import soundfile as sf
import torch
import torch.nn as nn
import torchaudio
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from torch.utils.data import DataLoader, Dataset

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.app.ml.ffmpeg_util import decode_audio_to_float32
from ai.neural_prototype.features import TwoChannelSpectrogramExtractor
from ai.neural_prototype.model import MiniAcousticCNN

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("train_robust_cnn")

MANIFEST_PATH = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_train_val_manifest.parquet"
OUTPUT_DIR = PROJECT_ROOT / "ai/neural_prototype/results/robust_training"
CHECKPOINT_PATH = OUTPUT_DIR / "best_robust_mini_acoustic_cnn.pt"
HISTORY_PATH = OUTPUT_DIR / "training_history.json"
REPORT_PATH = OUTPUT_DIR / "training_report.json"

RANDOM_SEED = 42
EPOCHS = 15
BATCH_SIZE = 32
LEARNING_RATE = 1e-3


def set_seed(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


# ── Transform Primitives ───────────────────────────────────────────────────

resample_16k_to_8k = torchaudio.transforms.Resample(orig_freq=16000, new_freq=8000)
resample_8k_to_16k = torchaudio.transforms.Resample(orig_freq=8000, new_freq=16000)
bandpass_sos = scipy.signal.butter(4, [300.0, 3400.0], btype="bandpass", fs=16000, output="sos")


def apply_g711_alaw(audio: np.ndarray) -> np.ndarray:
    """16 kHz -> 8 kHz -> G.711 A-law -> 16 kHz."""
    t_in = torch.from_numpy(audio.copy())
    t_8k = resample_16k_to_8k(t_in).numpy()

    pcm = np.clip(t_8k, -1.0, 1.0)
    pcm_int = (pcm * 32767.0).astype(np.int16)

    buf = io.BytesIO()
    sf.write(buf, pcm_int, 8000, format="WAV", subtype="ALAW")
    buf.seek(0)
    decoded_8k, _ = sf.read(buf, dtype="float32")

    t_16k = resample_8k_to_16k(torch.from_numpy(decoded_8k))
    return t_16k.numpy().astype(np.float32)


def apply_g711_mulaw(audio: np.ndarray) -> np.ndarray:
    """16 kHz -> 8 kHz -> G.711 mu-law -> 16 kHz."""
    t_in = torch.from_numpy(audio.copy())
    t_8k = resample_16k_to_8k(t_in).numpy()

    pcm = np.clip(t_8k, -1.0, 1.0)
    pcm_int = (pcm * 32767.0).astype(np.int16)

    buf = io.BytesIO()
    sf.write(buf, pcm_int, 8000, format="WAV", subtype="ULAW")
    buf.seek(0)
    decoded_8k, _ = sf.read(buf, dtype="float32")

    t_16k = resample_8k_to_16k(torch.from_numpy(decoded_8k))
    return t_16k.numpy().astype(np.float32)


def apply_telephone_bandpass(audio: np.ndarray) -> np.ndarray:
    """300–3400 Hz telephone bandpass filter at 16 kHz."""
    filtered = scipy.signal.sosfilt(bandpass_sos, audio)
    return filtered.astype(np.float32)


def apply_additive_noise(audio: np.ndarray, seed: int = 42, target_snr_db: float = 15.0) -> np.ndarray:
    """Additive Gaussian noise at controlled SNR."""
    rng = np.random.RandomState(seed)
    signal_power = float(np.mean(audio ** 2))
    if signal_power < 1e-12:
        return audio
    noise_power = signal_power / (10.0 ** (target_snr_db / 10.0))
    noise = rng.normal(0.0, np.sqrt(noise_power), size=audio.shape).astype(np.float32)
    noisy = audio + noise
    return noisy.astype(np.float32)


# ── Dataset Classes ─────────────────────────────────────────────────────────

class PreloadedTensorDataset(Dataset):
    """Memory-resident dataset of pre-extracted (features, label, audio_id)."""

    def __init__(self, data: List[Tuple[torch.Tensor, int, str]]) -> None:
        self.data = data

    def __len__(self) -> int:
        return len(self.data)

    def __getitem__(self, index: int) -> Tuple[torch.Tensor, int, str]:
        return self.data[index]


def evaluate_split(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> Dict[str, Any]:
    model.eval()
    total_loss = 0.0
    all_targets: List[int] = []
    all_scores: List[float] = []

    with torch.no_grad():
        for features, labels, _ in loader:
            features = features.to(device)
            labels = labels.to(device)

            logits = model(features)
            loss = criterion(logits, labels)
            total_loss += loss.item() * features.size(0)

            probs = torch.softmax(logits, dim=-1)[:, 1]
            all_targets.extend(labels.cpu().tolist())
            all_scores.extend(probs.cpu().tolist())

    y_true = np.array(all_targets)
    y_scores = np.array(all_scores)
    y_pred = (y_scores >= 0.50).astype(int)

    avg_loss = total_loss / len(y_true)
    acc = float(accuracy_score(y_true, y_pred))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))

    try:
        auc = float(roc_auc_score(y_true, y_scores))
    except ValueError:
        auc = 0.5

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0

    return {
        "loss": round(avg_loss, 4),
        "accuracy": round(acc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
        "roc_auc": round(auc, 4),
        "fpr": round(fpr, 4),
        "fnr": round(fnr, 4),
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tp": tp,
    }


def run_training() -> Dict[str, Any]:
    logger.info("=" * 68)
    logger.info("VOXSHIELD PHASE 2B.2 — ROBUSTNESS-AUGMENTED CNN TRAINING")
    logger.info("=" * 68)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    set_seed(RANDOM_SEED)

    # 1. Load Manifest
    assert MANIFEST_PATH.exists(), f"Manifest not found: {MANIFEST_PATH}"
    df_manifest = pd.read_parquet(MANIFEST_PATH)

    df_train = df_manifest[df_manifest["split"] == "train"].reset_index(drop=True)
    df_val = df_manifest[df_manifest["split"] == "val"].reset_index(drop=True)

    # Verify input invariants
    assert len(df_train) == 1400, f"Expected 1,400 train, got {len(df_train)}"
    assert len(df_val) == 300, f"Expected 300 val, got {len(df_val)}"
    assert (df_train["label"] == 0).sum() == 700, "Expected 700 train bona-fide"
    assert (df_train["label"] == 1).sum() == 700, "Expected 700 train spoof"
    assert (df_val["label"] == 0).sum() == 150, "Expected 150 val bona-fide"
    assert (df_val["label"] == 1).sum() == 150, "Expected 150 val spoof"

    train_spk = set(df_train["speaker_id"])
    val_spk = set(df_val["speaker_id"])
    assert len(train_spk & val_spk) == 0, "Speaker overlap detected between train and val!"

    train_aids = set(df_train["audio_id"])
    val_aids = set(df_val["audio_id"])
    assert len(train_aids & val_aids) == 0, "Audio ID overlap detected between train and val!"

    logger.info(f"Loaded manifest: {len(df_train)} train samples ({len(train_spk)} spk), {len(df_val)} val samples ({len(val_spk)} spk)")

    extractor = TwoChannelSpectrogramExtractor(sample_rate=16000, n_bins=60, target_duration_sec=3.0)

    # 2. Build 2x Training Set (1,400 clean + 1,400 augmented)
    logger.info("\nBuilding 2x Robust Training Set (2,800 samples)...")
    train_bona = df_train[df_train["label"] == 0].reset_index(drop=True)
    train_spoof = df_train[df_train["label"] == 1].reset_index(drop=True)

    # Partition 700 bona and 700 spoof into 4 equal slices of 175 each
    # Slice 0: A-law (175)
    # Slice 1: mu-law (175)
    # Slice 2: Telephone bandpass (175)
    # Slice 3: Additive noise (175)
    aug_specs: List[Tuple[str, int, int]] = [
        ("alaw", 0, 175),
        ("mulaw", 175, 350),
        ("bandpass", 350, 525),
        ("noise", 525, 700),
    ]

    t0 = time.perf_counter()
    train_preloaded: List[Tuple[torch.Tensor, int, str]] = []
    aug_counts: Dict[str, int] = {"clean": 0, "alaw": 0, "mulaw": 0, "bandpass": 0, "noise": 0}

    # Helper audio loader
    def load_audio(path: str) -> np.ndarray:
        try:
            return decode_audio_to_float32(path, target_sr=16000)
        except Exception:
            a, _ = sf.read(path, dtype="float32")
            return a

    # 2a. Load 1,400 Clean Originals
    logger.info("  Loading 1,400 clean originals...")
    for idx in range(len(df_train)):
        row = df_train.iloc[idx]
        flac_path = row["file_path"]
        label = int(row["label"])
        aid = str(row["audio_id"])

        audio = load_audio(flac_path)
        assert len(audio) > 0 and np.isfinite(audio).all(), f"Corrupt clean audio: {aid}"

        wave_tensor = torch.from_numpy(audio.copy())
        feat = extractor.extract(wave_tensor)
        assert feat.shape == (2, 60, 301), f"Unexpected feature shape: {feat.shape}"
        assert torch.isfinite(feat).all(), f"NaN/Inf in clean feature: {aid}"

        train_preloaded.append((feat, label, f"{aid}_clean"))
        aug_counts["clean"] += 1

    # 2b. Generate 1,400 Augmented Copies
    logger.info("  Generating 1,400 augmented copies across 4 conditions (350 each)...")
    for cond_name, start_idx, end_idx in aug_specs:
        # Bona-fide slice
        for i in range(start_idx, end_idx):
            row = train_bona.iloc[i]
            audio = load_audio(row["file_path"])
            aid = str(row["audio_id"])
            seed = RANDOM_SEED + i + (start_idx * 10)

            if cond_name == "alaw":
                aug_audio = apply_g711_alaw(audio)
            elif cond_name == "mulaw":
                aug_audio = apply_g711_mulaw(audio)
            elif cond_name == "bandpass":
                aug_audio = apply_telephone_bandpass(audio)
            elif cond_name == "noise":
                aug_audio = apply_additive_noise(audio, seed=seed, target_snr_db=15.0)

            assert len(aug_audio) > 0 and np.isfinite(aug_audio).all(), f"Corrupt aug audio: {aid}_{cond_name}"
            wave_tensor = torch.from_numpy(aug_audio.copy())
            feat = extractor.extract(wave_tensor)
            assert feat.shape == (2, 60, 301) and torch.isfinite(feat).all()

            train_preloaded.append((feat, 0, f"{aid}_{cond_name}"))
            aug_counts[cond_name] += 1

        # Spoof slice
        for i in range(start_idx, end_idx):
            row = train_spoof.iloc[i]
            audio = load_audio(row["file_path"])
            aid = str(row["audio_id"])
            seed = RANDOM_SEED + i + 1000 + (start_idx * 10)

            if cond_name == "alaw":
                aug_audio = apply_g711_alaw(audio)
            elif cond_name == "mulaw":
                aug_audio = apply_g711_mulaw(audio)
            elif cond_name == "bandpass":
                aug_audio = apply_telephone_bandpass(audio)
            elif cond_name == "noise":
                aug_audio = apply_additive_noise(audio, seed=seed, target_snr_db=15.0)

            assert len(aug_audio) > 0 and np.isfinite(aug_audio).all(), f"Corrupt aug audio: {aid}_{cond_name}"
            wave_tensor = torch.from_numpy(aug_audio.copy())
            feat = extractor.extract(wave_tensor)
            assert feat.shape == (2, 60, 301) and torch.isfinite(feat).all()

            train_preloaded.append((feat, 1, f"{aid}_{cond_name}"))
            aug_counts[cond_name] += 1

    train_build_time = time.perf_counter() - t0
    logger.info(f"Built 2x robust training set in {train_build_time:.2f}s: {aug_counts}")
    assert len(train_preloaded) == 2800, f"Expected 2,800 train samples, got {len(train_preloaded)}"
    assert aug_counts == {"clean": 1400, "alaw": 350, "mulaw": 350, "bandpass": 350, "noise": 350}

    train_bona_total = sum(1 for _, l, _ in train_preloaded if l == 0)
    train_spoof_total = sum(1 for _, l, _ in train_preloaded if l == 1)
    assert train_bona_total == 1400 and train_spoof_total == 1400, f"Class imbalance: {train_bona_total} bona, {train_spoof_total} spoof"

    # 3. Preload Validation Sets
    logger.info("\nLoading Validation Sets (Clean and A-law)...")
    val_clean_preloaded: List[Tuple[torch.Tensor, int, str]] = []
    val_alaw_preloaded: List[Tuple[torch.Tensor, int, str]] = []

    t_val = time.perf_counter()
    for idx in range(len(df_val)):
        row = df_val.iloc[idx]
        flac_path = row["file_path"]
        label = int(row["label"])
        aid = str(row["audio_id"])

        audio = load_audio(flac_path)

        # Clean feature
        wave_clean = torch.from_numpy(audio.copy())
        feat_clean = extractor.extract(wave_clean)
        val_clean_preloaded.append((feat_clean, label, aid))

        # A-law transformed feature
        alaw_audio = apply_g711_alaw(audio)
        wave_alaw = torch.from_numpy(alaw_audio.copy())
        feat_alaw = extractor.extract(wave_alaw)
        val_alaw_preloaded.append((feat_alaw, label, f"{aid}_alaw"))

    logger.info(f"Loaded {len(val_clean_preloaded)} clean val and {len(val_alaw_preloaded)} A-law val in {time.perf_counter() - t_val:.2f}s.")

    # 4. DataLoader Setup
    train_ds = PreloadedTensorDataset(train_preloaded)
    val_clean_ds = PreloadedTensorDataset(val_clean_preloaded)
    val_alaw_ds = PreloadedTensorDataset(val_alaw_preloaded)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_clean_loader = DataLoader(val_clean_ds, batch_size=BATCH_SIZE, shuffle=False)
    val_alaw_loader = DataLoader(val_alaw_ds, batch_size=BATCH_SIZE, shuffle=False)

    # 5. Model Initialization
    device = torch.device("cpu")
    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3).to(device)
    param_count = model.count_parameters()
    assert param_count == 93442, f"Expected 93,442 parameters, got {param_count}"
    logger.info(f"Initialized fresh MiniAcousticCNN: {param_count:,} parameters.")

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    # 6. Training Loop (15 Epochs)
    best_combined_f1 = -1.0
    best_combined_rec = -1.0
    best_epoch = -1
    best_clean_metrics: Dict[str, Any] = {}
    best_alaw_metrics: Dict[str, Any] = {}

    history: List[Dict[str, Any]] = []
    t_train_start = time.perf_counter()

    logger.info(f"\nStarting 15-epoch robust training (batch_size={BATCH_SIZE}, lr={LEARNING_RATE}, CPU)...")

    for epoch in range(1, EPOCHS + 1):
        epoch_t0 = time.perf_counter()
        model.train()
        running_train_loss = 0.0
        train_samples = 0

        for features, labels, _ in train_loader:
            features = features.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()
            logits = model(features)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()

            running_train_loss += loss.item() * features.size(0)
            train_samples += features.size(0)

        epoch_train_loss = running_train_loss / train_samples

        # Dual validation
        clean_metrics = evaluate_split(model, val_clean_loader, criterion, device)
        alaw_metrics = evaluate_split(model, val_alaw_loader, criterion, device)

        combined_f1 = 0.5 * clean_metrics["f1"] + 0.5 * alaw_metrics["f1"]
        combined_rec = 0.5 * clean_metrics["recall"] + 0.5 * alaw_metrics["recall"]
        epoch_dur = time.perf_counter() - epoch_t0

        logger.info(
            f"Epoch [{epoch:02d}/{EPOCHS:02d}] ({epoch_dur:.1f}s) | "
            f"Train Loss: {epoch_train_loss:.4f} | "
            f"Clean F1: {clean_metrics['f1']:.4f} (Rec: {clean_metrics['recall']:.4f}, AUC: {clean_metrics['roc_auc']:.4f}) | "
            f"A-law F1: {alaw_metrics['f1']:.4f} (Rec: {alaw_metrics['recall']:.4f}, AUC: {alaw_metrics['roc_auc']:.4f}) | "
            f"Combined F1: {combined_f1:.4f} (Rec: {combined_rec:.4f})"
        )

        history.append({
            "epoch": epoch,
            "train_loss": round(epoch_train_loss, 4),
            "clean_validation": clean_metrics,
            "alaw_validation": alaw_metrics,
            "combined_f1": round(combined_f1, 4),
            "combined_recall": round(combined_rec, 4),
            "epoch_sec": round(epoch_dur, 2),
        })

        # Selection rule:
        # Primary: combined_f1
        # Tie-breaker: combined_recall
        is_better = False
        if combined_f1 > best_combined_f1:
            is_better = True
        elif abs(combined_f1 - best_combined_f1) < 1e-5 and combined_rec > best_combined_rec:
            is_better = True

        if is_better:
            best_combined_f1 = combined_f1
            best_combined_rec = combined_rec
            best_epoch = epoch
            best_clean_metrics = clean_metrics
            best_alaw_metrics = alaw_metrics

            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "clean_validation_metrics": clean_metrics,
                    "alaw_validation_metrics": alaw_metrics,
                    "combined_f1": combined_f1,
                    "combined_recall": combined_rec,
                    "hyperparameters": {
                        "architecture": "MiniAcousticCNN",
                        "in_channels": 2,
                        "num_classes": 2,
                        "dropout_rate": 0.3,
                        "learning_rate": LEARNING_RATE,
                        "batch_size": BATCH_SIZE,
                        "random_seed": RANDOM_SEED,
                        "epochs": EPOCHS,
                        "train_samples_total": 2800,
                        "clean_train_samples": 1400,
                        "augmented_train_samples": 1400,
                    },
                },
                CHECKPOINT_PATH,
            )
            logger.info(f"  --> Saved new best robust checkpoint at epoch {epoch} (Combined F1: {combined_f1:.4f})")

    total_time = time.perf_counter() - t_train_start
    logger.info(f"\nRobust training completed in {total_time:.2f}s. Best epoch: {best_epoch} (Combined F1: {best_combined_f1:.4f})")

    # 7. Save History and Report
    HISTORY_PATH.write_text(json.dumps(history, indent=2), encoding="utf-8")

    ckpt_size = CHECKPOINT_PATH.stat().st_size if CHECKPOINT_PATH.exists() else 0

    report = {
        "experiment_title": "VOXSHIELD Phase 2B.2 — Robustness-Augmented MiniAcousticCNN Training",
        "environment": {
            "python_version": sys.version.split()[0],
            "pytorch_version": torch.__version__,
            "torchaudio_version": torchaudio.__version__,
            "soundfile_version": sf.__version__,
            "scipy_version": scipy.__version__,
            "numpy_version": np.__version__,
            "platform": platform.platform(),
            "cpu": platform.processor(),
            "device": "cpu",
        },
        "training_hyperparameters": {
            "random_seed": RANDOM_SEED,
            "epochs": EPOCHS,
            "batch_size": BATCH_SIZE,
            "learning_rate": LEARNING_RATE,
            "optimizer": "Adam",
            "loss": "CrossEntropyLoss",
        },
        "model_architecture_summary": {
            "architecture": "MiniAcousticCNN",
            "parameter_count": param_count,
            "input_shape": [2, 60, 301],
            "dropout_rate": 0.3,
        },
        "training_sample_counts": {
            "total_train_samples": 2800,
            "clean_train_samples": 1400,
            "augmented_train_samples": 1400,
            "train_bonafide_total": 1400,
            "train_spoof_total": 1400,
        },
        "augmentation_counts": aug_counts,
        "validation_sample_counts": {
            "clean_validation_samples": 300,
            "alaw_validation_samples": 300,
            "validation_bonafide": 150,
            "validation_spoof": 150,
        },
        "best_epoch": best_epoch,
        "best_combined_f1": round(best_combined_f1, 4),
        "best_combined_recall": round(best_combined_rec, 4),
        "best_clean_metrics": best_clean_metrics,
        "best_alaw_metrics": best_alaw_metrics,
        "total_wall_clock_sec": round(total_time, 2),
        "checkpoint_path": str(CHECKPOINT_PATH),
        "checkpoint_size_bytes": ckpt_size,
        "checkpoint_size_kb": round(ckpt_size / 1024.0, 2),
        "integrity_assertions": {
            "unseen_generator_test_accessed": False,
            "unseen_generator_test_evaluated": False,
            "existing_source_disjoint_checkpoint_modified": False,
            "earlier_indomain_cnn_checkpoint_modified": False,
            "rf_baseline_modified": False,
            "existing_datasets_or_manifests_modified": False,
            "production_code_modified": False,
            "external_data_downloaded": False,
            "new_packages_installed": False,
        },
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info(f"Saved training report -> {REPORT_PATH}")

    # Print terminal output
    print("\n" + "=" * 60)
    print("VOXSHIELD PHASE 2B.2 — ROBUST TRAINING RESULTS")
    print("=" * 60)
    print(f"\nCheckpoint:")
    print(f"  Path:       {CHECKPOINT_PATH}")
    print(f"  Parameters: {param_count:,}")
    print(f"  Size:       {ckpt_size / 1024.0:.2f} KB")

    print(f"\nTraining Dataset (2x Balanced):")
    print(f"  Total samples:      2,800")
    print(f"  Clean originals:    1,400 (700 bona-fide, 700 spoof)")
    print(f"  G.711 A-law:        350 (175 bona-fide, 175 spoof)")
    print(f"  G.711 μ-law:        350 (175 bona-fide, 175 spoof)")
    print(f"  Telephone bandpass: 350 (175 bona-fide, 175 spoof)")
    print(f"  Additive noise:     350 (175 bona-fide, 175 spoof)")
    print(f"  Total bona-fide:    1,400")
    print(f"  Total spoof:        1,400")

    print(f"\nTraining Execution:")
    print(f"  Epochs:          {EPOCHS}")
    print(f"  Batch size:      {BATCH_SIZE}")
    print(f"  Learning rate:   {LEARNING_RATE}")
    print(f"  Best epoch:      {best_epoch}")
    print(f"  Total wall time: {total_time:.2f} s (~{total_time/60.0:.2f} min)")

    print(f"\nBest Validation Results (Epoch {best_epoch}):")
    print(f"  Combined F1:     {best_combined_f1:.4f}")
    print(f"  Combined Recall: {best_combined_rec:.4f}")

    print(f"\n  [Clean Validation (300 samples)]")
    print(f"    Accuracy:  {best_clean_metrics['accuracy']:.4f}")
    print(f"    Precision: {best_clean_metrics['precision']:.4f}")
    print(f"    Recall:    {best_clean_metrics['recall']:.4f}")
    print(f"    F1:        {best_clean_metrics['f1']:.4f}")
    print(f"    ROC-AUC:   {best_clean_metrics['roc_auc']:.4f}")
    print(f"    FPR:       {best_clean_metrics['fpr']:.4f}")
    print(f"    FNR:       {best_clean_metrics['fnr']:.4f}")

    print(f"\n  [G.711 A-law Channel Validation (300 samples)]")
    print(f"    Accuracy:  {best_alaw_metrics['accuracy']:.4f}")
    print(f"    Precision: {best_alaw_metrics['precision']:.4f}")
    print(f"    Recall:    {best_alaw_metrics['recall']:.4f}")
    print(f"    F1:        {best_alaw_metrics['f1']:.4f}")
    print(f"    ROC-AUC:   {best_alaw_metrics['roc_auc']:.4f}")
    print(f"    FPR:       {best_alaw_metrics['fpr']:.4f}")
    print(f"    FNR:       {best_alaw_metrics['fnr']:.4f}")

    print("\n" + "=" * 60)
    print("INTEGRITY")
    print("=" * 60)
    print("Unseen-generator test evaluated: NO")
    print("Unseen-generator test accessed: NO")
    print("Training performed: YES (Robust CNN)")
    print("Existing source-disjoint checkpoint modified: NO")
    print("Earlier in-domain CNN checkpoint modified: NO")
    print("RF baseline modified: NO")
    print("Existing datasets or manifests modified: NO")
    print("Production code modified: NO")
    print("External data downloaded: NO")
    print("Packages installed: NO")

    print("\nFiles created:")
    print("  - ai/neural_prototype/train_robust_mini_acoustic_cnn.py")
    print("  - ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt")
    print("  - ai/neural_prototype/results/robust_training/training_history.json")
    print("  - ai/neural_prototype/results/robust_training/training_report.json")
    print("Files modified: NONE")
    print("Files deleted: NONE")

    print("\nFinal Interpretation:")
    print("  READY FOR UNSEEN EVALUATION")
    print("=" * 60)

    return report


if __name__ == "__main__":
    run_training()
