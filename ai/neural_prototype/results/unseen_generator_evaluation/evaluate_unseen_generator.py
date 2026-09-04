"""Phase 1C.5: Genuine Unseen-Generator Evaluation.

Evaluates the source-disjoint MiniAcousticCNN (trained exclusively on VCC2020+VCC2018)
against the frozen A07-A19 unseen attack-system test manifest.
Evaluates primary performance at default threshold = 0.50 without test-set tuning.
"""

from __future__ import annotations

import json
import logging
import platform
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List

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

PROJECT_ROOT = Path(__file__).resolve().parents[4]
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
logger = logging.getLogger("neural_prototype.unseen_eval")

CHECKPOINT_PATH = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_training/best_source_disjoint_mini_acoustic_cnn.pt"
TRAIN_VAL_MANIFEST = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_train_val_manifest.parquet"
TEST_MANIFEST = PROJECT_ROOT / "ai/neural_prototype/results/unseen_attack_eval_manifest.parquet"

OUTPUT_DIR = PROJECT_ROOT / "ai/neural_prototype/results/unseen_generator_evaluation"
REPORT_PATH = OUTPUT_DIR / "unseen_generator_evaluation_report.json"
PER_SYSTEM_PATH = OUTPUT_DIR / "per_attack_system_results.json"

DEFAULT_THRESHOLD = 0.50

A_SYSTEMS = [f"A{i:02d}" for i in range(7, 20)]

# Reference baselines for comparison
SOURCE_DISJOINT_VAL = {
    "condition": "Source-Disjoint Validation (VCC In-Domain Val)",
    "accuracy": 0.7833,
    "precision": 0.7852,
    "recall": 0.7800,
    "f1": 0.7826,
    "roc_auc": 0.8828,
    "eer": 0.2200,
    "fpr": 0.2133,
    "fnr": 0.2200,
}

EARLIER_IN_DOMAIN_CNN = {
    "condition": "Earlier In-Domain CNN Held-Out Test (Frozen theta=0.93)",
    "accuracy": 0.7933,
    "precision": 0.8333,
    "recall": 0.7333,
    "f1": 0.7801,
    "roc_auc": 0.8876,
    "eer": 0.1867,
    "fpr": 0.1467,
    "fnr": 0.2667,
}

RF_BASELINE = {
    "condition": "Random Forest Held-Out Test Baseline",
    "accuracy": 0.6433,
    "precision": 0.7792,
    "recall": 0.4000,
    "f1": 0.5286,
    "roc_auc": 0.8106,
    "eer": 0.2700,
    "fpr": 0.1133,
    "fnr": 0.6000,
}


def run_evaluation() -> Dict[str, Any]:
    logger.info("=" * 68)
    logger.info("VOXSHIELD PHASE 1C.5 — GENUINE UNSEEN-GENERATOR EVALUATION")
    logger.info("=" * 68)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Verify files exist
    assert CHECKPOINT_PATH.exists(), f"Checkpoint not found: {CHECKPOINT_PATH}"
    assert TEST_MANIFEST.exists(), f"Test manifest not found: {TEST_MANIFEST}"
    assert TRAIN_VAL_MANIFEST.exists(), f"Train/val manifest not found: {TRAIN_VAL_MANIFEST}"

    # 2. Invariant verification
    logger.info("\n[1/5] Verifying separation invariants between manifests...")
    df_test = pd.read_parquet(TEST_MANIFEST)
    df_train_val = pd.read_parquet(TRAIN_VAL_MANIFEST)

    df_train = df_train_val[df_train_val["split"] == "train"]
    df_val = df_train_val[df_train_val["split"] == "val"]

    train_spk = set(df_train["speaker_id"])
    val_spk = set(df_val["speaker_id"])
    test_spk = set(df_test["speaker_id"])

    train_sys = set(df_train[df_train["label"] == 1]["attack_system"])
    val_sys = set(df_val[df_val["label"] == 1]["attack_system"])
    test_sys = set(df_test[df_test["label"] == 1]["attack_system"])

    att_overlap_train_test = train_sys & test_sys
    spk_overlap_train_test = train_spk & test_spk
    spk_overlap_val_test = val_spk & test_spk

    logger.info(f"  Test samples: {len(df_test)} (Bona: {(df_test['label']==0).sum()}, Spoof: {(df_test['label']==1).sum()})")
    logger.info(f"  Test attack systems: {sorted(list(test_sys))}")
    logger.info(f"  Train/Test attack overlap: {len(att_overlap_train_test)}")
    logger.info(f"  Train/Test speaker overlap: {len(spk_overlap_train_test)}")
    logger.info(f"  Val/Test speaker overlap:   {len(spk_overlap_val_test)}")

    assert len(att_overlap_train_test) == 0, "CRITICAL: Attack system overlap detected!"
    assert len(spk_overlap_train_test) == 0, "CRITICAL: Speaker overlap with train detected!"
    assert len(spk_overlap_val_test) == 0, "CRITICAL: Speaker overlap with val detected!"

    # 3. Load model checkpoint
    logger.info("\n[2/5] Loading trained source-disjoint MiniAcousticCNN...")
    device = torch.device("cpu")
    ckpt = torch.load(CHECKPOINT_PATH, map_location=device)

    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    param_count = model.count_parameters()
    ckpt_epoch = ckpt.get("epoch", 15)
    ckpt_size_bytes = CHECKPOINT_PATH.stat().st_size
    logger.info(f"  Loaded model from Epoch {ckpt_epoch}. Parameters: {param_count:,}. Size: {ckpt_size_bytes/1024:.2f} KB.")

    # 4. Feature extraction & inference
    logger.info("\n[3/5] Running inference on 300 unseen-generator test samples...")
    extractor = TwoChannelSpectrogramExtractor(sample_rate=16000, n_bins=60, target_duration_sec=3.0)

    sample_latencies_ms: List[float] = []
    y_true: List[int] = []
    y_scores: List[float] = []
    audio_ids: List[str] = []
    attack_systems: List[str] = []

    for idx in range(len(df_test)):
        row = df_test.iloc[idx]
        flac_path = row["file_path"]
        label = int(row["label"])
        aid = str(row["audio_id"])
        sys_id = str(row["attack_system"])

        # Decode audio
        t_start = time.perf_counter()
        try:
            audio = decode_audio_to_float32(flac_path, target_sr=16000)
        except Exception:
            audio, _ = sf.read(flac_path, dtype="float32")

        wave_tensor = torch.from_numpy(audio.copy())
        features = extractor.extract(wave_tensor).unsqueeze(0).to(device)  # (1, 2, 60, 301)

        with torch.no_grad():
            logits = model(features)
            prob_spoof = torch.softmax(logits, dim=-1)[0, 1].item()

        t_elapsed = (time.perf_counter() - t_start) * 1000.0  # ms
        sample_latencies_ms.append(t_elapsed)

        y_true.append(label)
        y_scores.append(prob_spoof)
        audio_ids.append(aid)
        attack_systems.append(sys_id)

        if (idx + 1) % 100 == 0:
            logger.info(f"  Inference completed for {idx + 1}/300 samples...")

    y_true_arr = np.array(y_true)
    y_scores_arr = np.array(y_scores)

    # 5. Default threshold (0.50) evaluation
    logger.info("\n[4/5] Computing unseen-test metrics at DEFAULT THRESHOLD = 0.50...")
    y_pred_default = (y_scores_arr >= DEFAULT_THRESHOLD).astype(int)

    acc = float(accuracy_score(y_true_arr, y_pred_default))
    prec = float(precision_score(y_true_arr, y_pred_default, zero_division=0))
    rec = float(recall_score(y_true_arr, y_pred_default, zero_division=0))
    f1 = float(f1_score(y_true_arr, y_pred_default, zero_division=0))
    auc = float(roc_auc_score(y_true_arr, y_scores_arr))

    cm = confusion_matrix(y_true_arr, y_pred_default, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0

    # EER calculation (descriptive)
    fpr_curve, tpr_curve, thresh_curve = roc_curve(y_true_arr, y_scores_arr, pos_label=1)
    fnr_curve = 1.0 - tpr_curve
    eer_idx = int(np.nanargmin(np.abs(fpr_curve - fnr_curve)))
    eer = float((fpr_curve[eer_idx] + fnr_curve[eer_idx]) / 2.0)
    eer_thresh = float(thresh_curve[eer_idx])

    # Latency stats
    mean_lat = float(np.mean(sample_latencies_ms))
    med_lat = float(np.median(sample_latencies_ms))
    p95_lat = float(np.percentile(sample_latencies_ms, 95))

    logger.info(f"  Accuracy:  {acc:.4f}")
    logger.info(f"  Precision: {prec:.4f}")
    logger.info(f"  Recall:    {rec:.4f}")
    logger.info(f"  F1:        {f1:.4f}")
    logger.info(f"  ROC-AUC:   {auc:.4f}")
    logger.info(f"  FPR:       {fpr:.4f}")
    logger.info(f"  FNR:       {fnr:.4f}")
    logger.info(f"  EER:       {eer:.4f} (at threshold {eer_thresh:.4f})")
    logger.info(f"  Latency:   Mean={mean_lat:.2f}ms, Med={med_lat:.2f}ms, P95={p95_lat:.2f}ms")

    # 6. Per-attack-system breakdown (A07 to A19)
    logger.info("\n[5/5] Computing breakdown across all 13 unseen attack systems (A07-A19)...")
    per_sys_results: Dict[str, Dict[str, Any]] = {}
    for s_id in A_SYSTEMS:
        mask = (y_true_arr == 1) & (np.array(attack_systems) == s_id)
        sys_scores = y_scores_arr[mask]
        n_spoof = int(len(sys_scores))
        sys_pred = (sys_scores >= DEFAULT_THRESHOLD).astype(int)
        sys_tp = int(np.sum(sys_pred == 1))
        sys_fn = int(np.sum(sys_pred == 0))
        sys_recall = float(sys_tp / n_spoof) if n_spoof > 0 else 0.0
        sys_mean_score = float(np.mean(sys_scores)) if n_spoof > 0 else 0.0

        per_sys_results[s_id] = {
            "spoof_samples": n_spoof,
            "detected_tp": sys_tp,
            "false_negatives_fn": sys_fn,
            "recall": round(sys_recall, 4),
            "mean_spoof_score": round(sys_mean_score, 4),
        }
        logger.info(f"  {s_id}: N={n_spoof:2d} | Rec={sys_recall:.4f} | FN={sys_fn:2d} | MeanScore={sys_mean_score:.4f}")

    # Save per-system results
    PER_SYSTEM_PATH.write_text(json.dumps(per_sys_results, indent=2), encoding="utf-8")

    # Comprehensive evaluation report
    report = {
        "experiment_title": "VOXSHIELD Phase 1C.5 — Genuine Unseen-Generator Evaluation",
        "model_checkpoint_path": str(CHECKPOINT_PATH),
        "checkpoint_epoch": ckpt_epoch,
        "checkpoint_size_bytes": ckpt_size_bytes,
        "parameter_count": param_count,
        "feature_configuration": {
            "channels": ["log_mel_spectrogram", "lfcc_spectrogram"],
            "n_bins": 60,
            "sample_rate": 16000,
            "target_duration_sec": 3.0,
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
        "test_manifest_path": str(TEST_MANIFEST),
        "test_sample_count": len(df_test),
        "class_counts": {
            "bonafide": int((df_test["label"] == 0).sum()),
            "spoof": int((df_test["label"] == 1).sum()),
        },
        "attack_systems_evaluated": sorted(list(test_sys)),
        "speaker_count": len(test_spk),
        "separation_invariants": {
            "train_test_attack_overlap": len(att_overlap_train_test),
            "train_test_speaker_overlap": len(spk_overlap_train_test),
            "val_test_speaker_overlap": len(spk_overlap_val_test),
            "source_family_train_val": ["vcc2020", "vcc2018"],
            "source_family_test": ["asvspoof"],
            "is_genuine_unseen_attack_system_evaluation": True,
        },
        "default_threshold_metrics": {
            "threshold": DEFAULT_THRESHOLD,
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "roc_auc": round(auc, 4),
            "fpr": round(fpr, 4),
            "fnr": round(fnr, 4),
            "confusion_matrix": {
                "tn": tn,
                "fp": fp,
                "fn": fn,
                "tp": tp,
            },
            "eer": round(eer, 4),
            "eer_threshold": round(eer_thresh, 4),
        },
        "inference_latency_ms": {
            "mean": round(mean_lat, 2),
            "median": round(med_lat, 2),
            "p95": round(p95_lat, 2),
        },
        "per_attack_system_results": per_sys_results,
        "comparative_benchmarks": {
            "source_disjoint_validation": SOURCE_DISJOINT_VAL,
            "earlier_in_domain_cnn_test": EARLIER_IN_DOMAIN_CNN,
            "random_forest_baseline_test": RF_BASELINE,
            "unseen_generator_test_current": {
                "accuracy": round(acc, 4),
                "precision": round(prec, 4),
                "recall": round(rec, 4),
                "f1": round(f1, 4),
                "roc_auc": round(auc, 4),
                "eer": round(eer, 4),
                "fpr": round(fpr, 4),
                "fnr": round(fnr, 4),
            },
        },
        "explicit_limitations": [
            "This experiment evaluates generalization to 13 unseen academic TTS/VC synthesis algorithms from ASVspoof 2019 (A07-A19).",
            "It does NOT establish generalization to modern commercial black-box clone engines (e.g., ElevenLabs, OpenAI Voice, CosyVoice, XTTS-v2).",
            "Performance on real-world telephony channels, compressed audio streams, and unseen languages remains unverified.",
            "Threshold 0.50 was applied blind without test-set calibration or temperature scaling.",
        ],
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info(f"Saved unseen-generator evaluation report -> {REPORT_PATH}")

    # Print exact required terminal summary
    print("\n" + "=" * 60)
    print("VOXSHIELD PHASE 1C.5 — UNSEEN-GENERATOR EVALUATION")
    print("=" * 60)
    print("\nCheckpoint:")
    print(f"  Path:       {CHECKPOINT_PATH}")
    print(f"  Parameters: {param_count:,}")
    print(f"  Size:       {ckpt_size_bytes / 1024:.2f} KB")
    print("\nTest:")
    print(f"  Samples:        {len(df_test)}")
    print(f"  Bona-fide:      {int((df_test['label'] == 0).sum())}")
    print(f"  Spoof:          {int((df_test['label'] == 1).sum())}")
    print(f"  Attack systems: {len(test_sys)}")
    print(f"  Speakers:       {len(test_spk)}")
    print("\nSeparation:")
    print(f"  Train/test attack overlap:       {len(att_overlap_train_test)}")
    print(f"  Train/test speaker overlap:      {len(spk_overlap_train_test)}")
    print(f"  Validation/test speaker overlap: {len(spk_overlap_val_test)}")
    print("\nDEFAULT THRESHOLD = 0.50")
    print("\nUnseen-test results:")
    print(f"  Accuracy:      {acc:.4f}")
    print(f"  Precision:     {prec:.4f}")
    print(f"  Recall:        {rec:.4f}")
    print(f"  F1:            {f1:.4f}")
    print(f"  ROC-AUC:       {auc:.4f}")
    print(f"  FPR:           {fpr:.4f}")
    print(f"  FNR:           {fnr:.4f}")
    print(f"  EER:           {eer:.4f}")
    print(f"  EER threshold: {eer_thresh:.4f}")
    print("\nLatency:")
    print(f"  Mean:   {mean_lat:.2f} ms")
    print(f"  Median: {med_lat:.2f} ms")
    print(f"  P95:    {p95_lat:.2f} ms")
    print("\nPer-attack-system evaluation:")
    for s_id in A_SYSTEMS:
        d = per_sys_results[s_id]
        print(f"  {s_id}: N={d['spoof_samples']:2d}, Recall={d['recall']:.4f}, FN={d['false_negatives_fn']:2d}, MeanScore={d['mean_spoof_score']:.4f}")
    print("\nModel retrained: NO")
    print("Checkpoint modified: NO")
    print("Test manifest modified: NO")
    print("Test labels used for threshold selection: NO")
    print("Production code modified: NO")
    print("External data downloaded: NO")
    print("=" * 60)

    return report


if __name__ == "__main__":
    run_evaluation()
