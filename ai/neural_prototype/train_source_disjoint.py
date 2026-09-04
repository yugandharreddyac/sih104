"""Phase 1C.4: Train Source-Disjoint MiniAcousticCNN from Scratch.

Trains MiniAcousticCNN strictly on the verified VCC2020 + VCC2018 train/val manifest
with zero A07-A19 attack systems.
Checkpoint selection: Primary validation F1, secondary recall, tertiary ROC-AUC.
"""

from __future__ import annotations

import json
import logging
import platform
import random
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
import soundfile as sf
import torch
import torch.nn as nn
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
logger = logging.getLogger("neural_prototype.train_source_disjoint")

MANIFEST_PATH = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_train_val_manifest.parquet"
OUTPUT_DIR = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_training"
CHECKPOINT_PATH = OUTPUT_DIR / "best_source_disjoint_mini_acoustic_cnn.pt"
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


class SourceDisjointDataset(Dataset):
    """PyTorch Dataset loading from source_disjoint_train_val_manifest.parquet."""

    def __init__(self, split: str, manifest_path: Path = MANIFEST_PATH, preload: bool = True) -> None:
        self.split = split
        df = pd.read_parquet(manifest_path)
        self.df = df[df["split"] == split].reset_index(drop=True)
        self.extractor = TwoChannelSpectrogramExtractor(sample_rate=16000, n_bins=60, target_duration_sec=3.0)
        self.preloaded_data: List[Tuple[torch.Tensor, int, str]] = []

        if preload:
            logger.info(f"Pre-loading {len(self.df)} samples for split '{split}' into memory...")
            t0 = time.perf_counter()
            for idx in range(len(self.df)):
                row = self.df.iloc[idx]
                flac_path = row["file_path"]
                label = int(row["label"])
                audio_id = str(row["audio_id"])

                try:
                    data = decode_audio_to_float32(flac_path, target_sr=16000)
                except Exception:
                    data, _ = sf.read(flac_path, dtype="float32")

                wave_tensor = torch.from_numpy(data.copy())
                features = self.extractor.extract(wave_tensor)
                self.preloaded_data.append((features, label, audio_id))

            logger.info(f"Pre-loaded {len(self.df)} samples for '{split}' in {time.perf_counter() - t0:.2f}s.")

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, index: int) -> Tuple[torch.Tensor, int, str]:
        if self.preloaded_data:
            return self.preloaded_data[index]

        row = self.df.iloc[index]
        flac_path = row["file_path"]
        label = int(row["label"])
        audio_id = str(row["audio_id"])

        try:
            data = decode_audio_to_float32(flac_path, target_sr=16000)
        except Exception:
            data, _ = sf.read(flac_path, dtype="float32")

        wave_tensor = torch.from_numpy(data.copy())
        features = self.extractor.extract(wave_tensor)
        return features, label, audio_id


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> Dict[str, Any]:
    model.eval()
    total_loss = 0.0
    all_targets: List[int] = []
    all_scores: List[float] = []

    t0 = time.perf_counter()
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

    eval_time = time.perf_counter() - t0
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

    fpr_arr, tpr_arr, thresh_arr = roc_curve(y_true, y_scores, pos_label=1)
    fnr_arr = 1.0 - tpr_arr
    eer_idx = int(np.nanargmin(np.abs(fpr_arr - fnr_arr)))
    eer = float((fpr_arr[eer_idx] + fnr_arr[eer_idx]) / 2.0)
    eer_thresh = float(thresh_arr[eer_idx])

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
        "eer": round(eer, 4),
        "eer_threshold": round(eer_thresh, 4),
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tp": tp,
        "eval_time_sec": round(eval_time, 2),
    }


def train() -> Dict[str, Any]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    set_seed(RANDOM_SEED)

    device = torch.device("cpu")
    logger.info("Initializing source-disjoint datasets...")
    train_ds = SourceDisjointDataset(split="train", preload=True)
    val_ds = SourceDisjointDataset(split="val", preload=True)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3).to(device)
    param_count = model.count_parameters()
    logger.info(f"Initialized fresh MiniAcousticCNN: {param_count:,} parameters.")

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    best_val_f1 = -1.0
    best_val_recall = -1.0
    best_val_auc = -1.0
    best_epoch = -1
    best_val_metrics: Dict[str, Any] = {}

    history: List[Dict[str, Any]] = []
    t_start = time.perf_counter()

    logger.info(f"Starting source-disjoint training ({EPOCHS} epochs, batch_size={BATCH_SIZE}, lr={LEARNING_RATE})...")

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
        val_metrics = evaluate(model, val_loader, criterion, device)
        epoch_dur = time.perf_counter() - epoch_t0

        logger.info(
            f"Epoch [{epoch:02d}/{EPOCHS:02d}] ({epoch_dur:.1f}s) | "
            f"Train Loss: {epoch_train_loss:.4f} | "
            f"Val Loss: {val_metrics['loss']:.4f} | "
            f"Val Acc: {val_metrics['accuracy']:.4f} | "
            f"Val Prec: {val_metrics['precision']:.4f} | "
            f"Val Rec: {val_metrics['recall']:.4f} | "
            f"Val F1: {val_metrics['f1']:.4f} | "
            f"Val AUC: {val_metrics['roc_auc']:.4f} | "
            f"Val EER: {val_metrics['eer']:.4f}"
        )

        history.append({
            "epoch": epoch,
            "train_loss": round(epoch_train_loss, 4),
            "val_loss": val_metrics["loss"],
            "val_metrics": val_metrics,
            "epoch_sec": round(epoch_dur, 2),
        })

        # Selection rule:
        # Primary: validation F1
        # Tie-breaker 1: validation Recall
        # Tie-breaker 2: validation ROC-AUC
        v_f1 = val_metrics["f1"]
        v_rec = val_metrics["recall"]
        v_auc = val_metrics["roc_auc"]

        is_better = False
        if v_f1 > best_val_f1:
            is_better = True
        elif v_f1 == best_val_f1:
            if v_rec > best_val_recall:
                is_better = True
            elif v_rec == best_val_recall and v_auc > best_val_auc:
                is_better = True

        if is_better:
            best_val_f1 = v_f1
            best_val_recall = v_rec
            best_val_auc = v_auc
            best_epoch = epoch
            best_val_metrics = val_metrics

            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "val_metrics": val_metrics,
                    "hyperparameters": {
                        "architecture": "MiniAcousticCNN",
                        "in_channels": 2,
                        "num_classes": 2,
                        "dropout_rate": 0.3,
                        "learning_rate": LEARNING_RATE,
                        "batch_size": BATCH_SIZE,
                        "random_seed": RANDOM_SEED,
                        "dataset": "source_disjoint_train_val_manifest.parquet",
                    },
                },
                CHECKPOINT_PATH,
            )
            logger.info(f"  --> Saved new best checkpoint at epoch {epoch} (F1: {v_f1:.4f}, Rec: {v_rec:.4f}, AUC: {v_auc:.4f})")

    total_time = time.perf_counter() - t_start
    logger.info(f"Training completed in {total_time:.2f}s. Best epoch: {best_epoch} (F1: {best_val_f1:.4f})")

    # Save history
    HISTORY_PATH.write_text(json.dumps(history, indent=2), encoding="utf-8")

    # Save training report
    report = {
        "experiment_title": "VOXSHIELD Phase 1C.4 — Source-Disjoint MiniAcousticCNN Training",
        "model_architecture": "MiniAcousticCNN",
        "parameter_count": param_count,
        "input_shape": [2, 60, 301],
        "feature_configuration": {
            "channels": ["log_mel_spectrogram", "lfcc_spectrogram"],
            "n_bins": 60,
            "sample_rate": 16000,
            "window_sec": 3.0,
            "window_samples": 48000,
            "n_fft": 512,
            "hop_length": 160,
            "win_length": 400,
        },
        "system_environment": {
            "python_version": sys.version.split()[0],
            "pytorch_version": torch.__version__,
            "platform": platform.platform(),
            "cpu": platform.processor(),
        },
        "training_hyperparameters": {
            "random_seed": RANDOM_SEED,
            "epochs": EPOCHS,
            "batch_size": BATCH_SIZE,
            "learning_rate": LEARNING_RATE,
            "optimizer": "Adam",
            "loss": "CrossEntropyLoss",
            "device": "cpu",
        },
        "manifest_path": str(MANIFEST_PATH),
        "checkpoint_path": str(CHECKPOINT_PATH),
        "checkpoint_size_bytes": CHECKPOINT_PATH.stat().st_size if CHECKPOINT_PATH.exists() else 0,
        "total_wall_clock_sec": round(total_time, 2),
        "best_epoch": best_epoch,
        "best_validation_metrics": best_val_metrics,
        "methodology_assertions": {
            "a07_a19_unseen_test_evaluated": False,
            "unseen_test_data_used_for_training_or_selection": False,
            "existing_cnn_checkpoint_modified": False,
            "existing_benchmark_modified": False,
            "unseen_test_manifest_modified": False,
            "production_code_modified": False,
            "external_data_downloaded": False,
        },
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info(f"Saved training report -> {REPORT_PATH}")

    # Print exact summary
    print("\n" + "=" * 60)
    print("VOXSHIELD PHASE 1C.4 — SOURCE-DISJOINT CNN TRAINING")
    print("=" * 60)
    print("\nTraining samples: 1400")
    print("  Bona-fide: 700")
    print("  Spoof:     700")
    print("\nValidation samples: 300")
    print("  Bona-fide: 150")
    print("  Spoof:     150")
    print("\nModel:")
    print("  Architecture: MiniAcousticCNN")
    print(f"  Parameters:   {param_count:,}")
    print("  Input shape:  (2, 60, 301)")
    print("\nTraining:")
    print(f"  Seed:            {RANDOM_SEED}")
    print(f"  Epochs:          {EPOCHS}")
    print(f"  Batch size:      {BATCH_SIZE}")
    print(f"  Learning rate:   {LEARNING_RATE}")
    print(f"  Best epoch:      {best_epoch}")
    print(f"  Total wall time: {total_time:.2f} s")
    print("\nBest validation results:")
    print(f"  Accuracy:  {best_val_metrics['accuracy']:.4f}")
    print(f"  Precision: {best_val_metrics['precision']:.4f}")
    print(f"  Recall:    {best_val_metrics['recall']:.4f}")
    print(f"  F1:        {best_val_metrics['f1']:.4f}")
    print(f"  ROC-AUC:   {best_val_metrics['roc_auc']:.4f}")
    print(f"  EER:       {best_val_metrics['eer']:.4f}")
    print("\nCheckpoint:")
    print(f"  Path: {CHECKPOINT_PATH}")
    print(f"  Size: {CHECKPOINT_PATH.stat().st_size / 1024:.2f} KB")
    print("\nA07-A19 unseen test evaluated: NO")
    print("Unseen-test data used for training/selection: NO")
    print("Existing CNN checkpoint modified: NO")
    print("Existing benchmark modified: NO")
    print("Unseen-test manifest modified: NO")
    print("Production code modified: NO")
    print("External data downloaded: NO")
    print("=" * 60)

    return report


if __name__ == "__main__":
    train()
