"""Phase 1B.3: Operating-Point and Threshold Sensitivity Analysis for MiniAcousticCNN.

Evaluates the already-selected Epoch-8 checkpoint on the 300-sample held-out test set
across multiple decision thresholds to analyze score separation, calibration, and EER.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

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
logger = logging.getLogger("neural_prototype.analyze")

CHECKPOINT_PATH = PROJECT_ROOT / "ai/neural_prototype/checkpoints/best_mini_acoustic_cnn.pt"
OUTPUT_REPORT_PATH = PROJECT_ROOT / "ai/neural_prototype/results/threshold_analysis_report.json"

THRESHOLDS = [
    0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.914,
    0.92, 0.93, 0.94, 0.95, 0.96, 0.97, 0.98
]


def run_threshold_analysis() -> Dict[str, Any]:
    if not CHECKPOINT_PATH.exists():
        raise FileNotFoundError(f"Checkpoint not found at {CHECKPOINT_PATH}")

    device = torch.device("cpu")
    logger.info(f"Loading checkpoint: {CHECKPOINT_PATH}")
    ckpt = torch.load(CHECKPOINT_PATH, map_location=device)

    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    logger.info(f"Checkpoint loaded successfully. Best epoch recorded: {ckpt.get('epoch')}")

    logger.info("Loading held-out test dataset (300 samples)...")
    test_ds = ASVSpoof2021BenchmarkDataset(split="test", repo_root=str(PROJECT_ROOT), preload_to_memory=True)
    test_loader = DataLoader(test_ds, batch_size=32, shuffle=False)
    assert len(test_ds) == 300, f"Expected 300 test samples, got {len(test_ds)}"

    all_targets: List[int] = []
    all_scores: List[float] = []
    all_audio_ids: List[str] = []

    t0 = time.perf_counter()
    with torch.no_grad():
        for features, labels, audio_ids in test_loader:
            features = features.to(device)
            logits = model(features)
            probs = torch.softmax(logits, dim=-1)[:, 1]

            all_targets.extend(labels.cpu().tolist())
            all_scores.extend(probs.cpu().tolist())
            all_audio_ids.extend(audio_ids)

    inference_time = time.perf_counter() - t0
    latency_per_sample_ms = (inference_time / len(test_ds)) * 1000.0

    y_true = np.array(all_targets)
    y_scores = np.array(all_scores)

    # Score distribution summary
    bona_mask = (y_true == 0)
    spoof_mask = (y_true == 1)

    bona_scores = y_scores[bona_mask]
    spoof_scores = y_scores[spoof_mask]

    dist_summary = {
        "bona_fide": {
            "count": int(len(bona_scores)),
            "min": round(float(np.min(bona_scores)), 4),
            "max": round(float(np.max(bona_scores)), 4),
            "mean": round(float(np.mean(bona_scores)), 4),
            "median": round(float(np.median(bona_scores)), 4),
            "std": round(float(np.std(bona_scores)), 4),
            "q25": round(float(np.percentile(bona_scores, 25)), 4),
            "q75": round(float(np.percentile(bona_scores, 75)), 4),
        },
        "spoof": {
            "count": int(len(spoof_scores)),
            "min": round(float(np.min(spoof_scores)), 4),
            "max": round(float(np.max(spoof_scores)), 4),
            "mean": round(float(np.mean(spoof_scores)), 4),
            "median": round(float(np.median(spoof_scores)), 4),
            "std": round(float(np.std(spoof_scores)), 4),
            "q25": round(float(np.percentile(spoof_scores, 25)), 4),
            "q75": round(float(np.percentile(spoof_scores, 75)), 4),
        }
    }

    # EER calculation
    fpr_arr, tpr_arr, thresh_arr = roc_curve(y_true, y_scores, pos_label=1)
    fnr_arr = 1.0 - tpr_arr
    eer_idx = int(np.nanargmin(np.abs(fpr_arr - fnr_arr)))
    eer_val = float((fpr_arr[eer_idx] + fnr_arr[eer_idx]) / 2.0)
    eer_thresh = float(thresh_arr[eer_idx])
    roc_auc = float(roc_auc_score(y_true, y_scores))

    # Evaluate each requested threshold
    threshold_results: List[Dict[str, Any]] = []
    min_diff_fpr_fnr = float("inf")
    best_diff_thresh = None
    max_f1 = -1.0
    best_f1_thresh = None
    fnr_le_10_threshs = []
    fpr_le_20_threshs = []
    both_conditions_threshs = []

    for th in THRESHOLDS:
        y_pred = (y_scores >= th).astype(int)
        cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
        tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])

        acc = float(accuracy_score(y_true, y_pred))
        prec = float(precision_score(y_true, y_pred, zero_division=0))
        rec = float(recall_score(y_true, y_pred, zero_division=0))
        f1 = float(f1_score(y_true, y_pred, zero_division=0))

        fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
        fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0

        diff = abs(fpr - fnr)
        if diff < min_diff_fpr_fnr:
            min_diff_fpr_fnr = diff
            best_diff_thresh = th

        if f1 > max_f1:
            max_f1 = f1
            best_f1_thresh = th

        if fnr <= 0.10:
            fnr_le_10_threshs.append(th)
        if fpr <= 0.20:
            fpr_le_20_threshs.append(th)
        if fnr <= 0.10 and fpr <= 0.20:
            both_conditions_threshs.append(th)

        threshold_results.append({
            "threshold": th,
            "tp": tp,
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "fpr": round(fpr, 4),
            "fnr": round(fnr, 4),
            "abs_diff_fpr_fnr": round(diff, 4),
        })

    analysis_report = {
        "title": "Phase 1B.3 MiniAcousticCNN Threshold & Operating-Point Analysis (TEST-SET ANALYSIS ONLY)",
        "checkpoint_file": str(CHECKPOINT_PATH),
        "selected_epoch": ckpt.get("epoch"),
        "test_sample_count": len(y_true),
        "class_distribution": {"bonafide": int(np.sum(y_true == 0)), "spoof": int(np.sum(y_true == 1))},
        "score_distribution_summary": dist_summary,
        "independent_eer_verification": {
            "eer": round(eer_val, 4),
            "eer_threshold": round(eer_thresh, 4),
            "roc_auc": round(roc_auc, 4),
            "previously_reported_eer": 0.1867,
            "previously_reported_threshold": 0.9140,
            "eer_verified": round(eer_val, 4) == 0.1867,
        },
        "operating_point_discoveries": {
            "min_abs_diff_fpr_fnr_threshold": best_diff_thresh,
            "min_abs_diff_value": round(min_diff_fpr_fnr, 4),
            "highest_f1_threshold": best_f1_thresh,
            "highest_f1_value": round(max_f1, 4),
            "thresholds_with_fnr_le_10_pct": fnr_le_10_threshs,
            "thresholds_with_fpr_le_20_pct": fpr_le_20_threshs,
            "thresholds_meeting_both_conditions": both_conditions_threshs,
        },
        "threshold_evaluations": threshold_results,
        "inference_latency_ms_per_sample": round(latency_per_sample_ms, 3),
    }

    OUTPUT_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_REPORT_PATH.write_text(json.dumps(analysis_report, indent=2), encoding="utf-8")
    logger.info(f"Saved analysis report to {OUTPUT_REPORT_PATH}")

    return analysis_report


if __name__ == "__main__":
    report = run_threshold_analysis()
