"""Phase 1B.5: Frozen Validation-Threshold Held-Out Test Evaluation.

Evaluates MiniAcousticCNN (Epoch-8 checkpoint) on the 300-sample held-out TEST set
using the frozen validation-derived threshold of exactly 0.93.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path
from typing import Any, Dict

import numpy as np
import torch
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from torch.utils.data import DataLoader

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.neural_prototype.dataset import ASVSpoof2021BenchmarkDataset
from ai.neural_prototype.model import MiniAcousticCNN

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("neural_prototype.frozen_eval")

CHECKPOINT_PATH = PROJECT_ROOT / "ai/neural_prototype/checkpoints/best_mini_acoustic_cnn.pt"
OUTPUT_REPORT_PATH = PROJECT_ROOT / "ai/neural_prototype/results/frozen_threshold_test_report.json"
FROZEN_THRESHOLD = 0.93

RF_BASELINE = {
    "model_name": "RandomForest Baseline",
    "accuracy": 0.6433,
    "precision": 0.7792,
    "recall": 0.4000,
    "f1": 0.5286,
    "fpr": 0.1133,
    "fnr": 0.6000,
    "roc_auc": 0.8106,
    "eer": 0.2700,
    "latency_ms": 0.590,
}


def run_frozen_threshold_evaluation() -> Dict[str, Any]:
    logger.info("=" * 60)
    logger.info("VOXSHIELD PHASE 1B.5 — FROZEN THRESHOLD TEST")
    logger.info("=" * 60)
    logger.info("Frozen validation threshold: %.2f", FROZEN_THRESHOLD)

    if not CHECKPOINT_PATH.exists():
        raise FileNotFoundError(f"Checkpoint not found: {CHECKPOINT_PATH}")

    device = torch.device("cpu")
    ckpt = torch.load(CHECKPOINT_PATH, map_location=device)
    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    logger.info("Loading 300 held-out test samples...")
    test_ds = ASVSpoof2021BenchmarkDataset(split="test", repo_root=str(PROJECT_ROOT), preload_to_memory=True)
    test_loader = DataLoader(test_ds, batch_size=32, shuffle=False)
    assert len(test_ds) == 300, f"Expected 300 test samples, got {len(test_ds)}"

    all_targets = []
    all_scores = []
    all_audio_ids = []

    t0 = time.perf_counter()
    with torch.no_grad():
        for features, labels, audio_ids in test_loader:
            features = features.to(device)
            logits = model(features)
            probs = torch.softmax(logits, dim=-1)[:, 1]

            all_targets.extend(labels.cpu().tolist())
            all_scores.extend(probs.cpu().tolist())
            all_audio_ids.extend(audio_ids)

    total_eval_time = time.perf_counter() - t0
    latency_per_sample_ms = (total_eval_time / len(test_ds)) * 1000.0

    y_true = np.array(all_targets)
    y_scores = np.array(all_scores)

    # Ranking/discrimination metrics (threshold-independent)
    roc_auc = float(roc_auc_score(y_true, y_scores))
    fpr_arr, tpr_arr, thresh_arr = roc_curve(y_true, y_scores, pos_label=1)
    fnr_arr = 1.0 - tpr_arr
    eer_idx = int(np.nanargmin(np.abs(fpr_arr - fnr_arr)))
    test_eer = float((fpr_arr[eer_idx] + fnr_arr[eer_idx]) / 2.0)
    test_eer_thresh = float(thresh_arr[eer_idx])

    # Operating-point metrics at frozen threshold 0.93
    y_pred = (y_scores >= FROZEN_THRESHOLD).astype(int)
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])

    acc = float(accuracy_score(y_true, y_pred))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0

    # Delta comparison against Random Forest baseline
    delta = {
        "accuracy": round(acc - RF_BASELINE["accuracy"], 4),
        "precision": round(prec - RF_BASELINE["precision"], 4),
        "recall": round(rec - RF_BASELINE["recall"], 4),
        "f1": round(f1 - RF_BASELINE["f1"], 4),
        "fpr": round(fpr - RF_BASELINE["fpr"], 4),
        "fnr": round(fnr - RF_BASELINE["fnr"], 4),
        "roc_auc": round(roc_auc - RF_BASELINE["roc_auc"], 4),
        "eer": round(test_eer - RF_BASELINE["eer"], 4),
        "latency_ms": round(latency_per_sample_ms - RF_BASELINE["latency_ms"], 4),
    }

    report = {
        "title": "Phase 1B.5 Frozen Validation-Threshold Held-Out Test Evaluation",
        "frozen_validation_threshold": FROZEN_THRESHOLD,
        "checkpoint_file": str(CHECKPOINT_PATH),
        "checkpoint_epoch": ckpt.get("epoch", 8),
        "test_sample_count": len(y_true),
        "class_distribution": {
            "bonafide": int(np.sum(y_true == 0)),
            "spoof": int(np.sum(y_true == 1)),
        },
        "confusion_matrix": {
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "tp": tp,
        },
        "ranking_discrimination_metrics": {
            "roc_auc": round(roc_auc, 4),
            "eer": round(test_eer, 4),
            "eer_threshold": round(test_eer_thresh, 4),
        },
        "operating_point_metrics_at_frozen_threshold": {
            "threshold": FROZEN_THRESHOLD,
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "fpr": round(fpr, 4),
            "fnr": round(fnr, 4),
            "abs_diff_fpr_fnr": round(abs(fpr - fnr), 4),
        },
        "inference_latency_ms_per_sample": round(latency_per_sample_ms, 3),
        "rf_baseline_comparison": {
            "rf_baseline": RF_BASELINE,
            "mini_acoustic_cnn_at_0_93": {
                "accuracy": round(acc, 4),
                "precision": round(prec, 4),
                "recall": round(rec, 4),
                "f1": round(f1, 4),
                "fpr": round(fpr, 4),
                "fnr": round(fnr, 4),
                "roc_auc": round(roc_auc, 4),
                "eer": round(test_eer, 4),
                "latency_ms": round(latency_per_sample_ms, 3),
            },
            "delta_cnn_minus_rf": delta,
        },
        "methodology_assertions": {
            "threshold_selection_split": "validation_only",
            "test_set_used_only_for_final_held_out_evaluation": True,
            "no_retraining_performed": True,
            "no_checkpoint_modification_performed": True,
            "no_threshold_adjustment_performed": True,
        },
    }

    OUTPUT_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info("Saved frozen threshold report to %s\n", OUTPUT_REPORT_PATH)

    # Print exact terminal summary
    print("=" * 60)
    print("VOXSHIELD PHASE 1B.5 — FROZEN THRESHOLD TEST")
    print("=" * 60)
    print(f"Frozen validation threshold: {FROZEN_THRESHOLD:.2f}")
    print(f"Test samples: {len(y_true)}")
    print(f"Test ROC-AUC: {roc_auc:.4f}")
    print(f"Test EER: {test_eer:.4f}")
    print(f"Test Accuracy: {acc:.4f}")
    print(f"Test Precision: {prec:.4f}")
    print(f"Test Recall: {rec:.4f}")
    print(f"Test F1: {f1:.4f}")
    print(f"Test FPR: {fpr:.4f}")
    print(f"Test FNR: {fnr:.4f}")
    print(f"Inference latency: {latency_per_sample_ms:.3f} ms/sample")
    print("=" * 60)
    print("CNN vs RF:")
    print(f"  Accuracy:  {acc:.4f} vs {RF_BASELINE['accuracy']:.4f} (Delta: {delta['accuracy']:+.4f})")
    print(f"  Precision: {prec:.4f} vs {RF_BASELINE['precision']:.4f} (Delta: {delta['precision']:+.4f})")
    print(f"  Recall:    {rec:.4f} vs {RF_BASELINE['recall']:.4f} (Delta: {delta['recall']:+.4f})")
    print(f"  F1:        {f1:.4f} vs {RF_BASELINE['f1']:.4f} (Delta: {delta['f1']:+.4f})")
    print(f"  FPR:       {fpr:.4f} vs {RF_BASELINE['fpr']:.4f} (Delta: {delta['fpr']:+.4f})")
    print(f"  FNR:       {fnr:.4f} vs {RF_BASELINE['fnr']:.4f} (Delta: {delta['fnr']:+.4f})")
    print(f"  ROC-AUC:   {roc_auc:.4f} vs {RF_BASELINE['roc_auc']:.4f} (Delta: {delta['roc_auc']:+.4f})")
    print(f"  EER:       {test_eer:.4f} vs {RF_BASELINE['eer']:.4f} (Delta: {delta['eer']:+.4f})")
    print(f"  Latency:   {latency_per_sample_ms:.3f} ms vs {RF_BASELINE['latency_ms']:.3f} ms (Delta: {delta['latency_ms']:+.3f} ms)")
    print("=" * 60)
    print("Threshold was selected from validation data only.")
    print("Test set was used only for final held-out evaluation.")
    print("No retraining performed.")
    print("No checkpoint modification performed.")
    print("No threshold adjustment performed.")
    print("=" * 60)

    return report


if __name__ == "__main__":
    run_frozen_threshold_evaluation()
