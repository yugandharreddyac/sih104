"""Training and Evaluation Pipeline for MiniAcousticCNN.

Trains MiniAcousticCNN on the ASVspoof 2021 2,000-sample benchmark:
  - 1,400 training samples
  - 300 validation samples (used strictly for model selection)
  - 300 held-out test samples (evaluated once at the end)

Selection Criterion:
  Primary: Validation Recall (Sensitivity to spoof / minimizing FNR)
  Secondary: Validation F1 Score
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np
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
from torch.utils.data import DataLoader

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.neural_prototype.dataset import ASVSpoof2021BenchmarkDataset
from ai.neural_prototype.model import MiniAcousticCNN

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("neural_prototype.train")

PROTOTYPE_DIR = Path(__file__).resolve().parent
CHECKPOINT_DIR = PROTOTYPE_DIR / "checkpoints"
RESULTS_DIR = PROTOTYPE_DIR / "results"

# Benchmark Baseline Random Forest reference metrics
RF_BASELINE_TEST = {
    "model_name": "RandomForest Baseline",
    "accuracy": 0.6433,
    "precision": 0.7792,
    "recall": 0.4000,
    "f1": 0.5286,
    "roc_auc": 0.8106,
    "fpr": 0.1133,
    "fnr": 0.6000,
    "eer": 0.2700,
    "min_dcf": 0.9533,
}


def compute_eer(y_true: np.ndarray, y_scores: np.ndarray) -> Tuple[float, float]:
    """Computes Equal Error Rate (EER) and the decision threshold."""
    try:
        fpr, tpr, thresholds = roc_curve(y_true, y_scores, pos_label=1)
        fnr = 1.0 - tpr
        idx = int(np.nanargmin(np.abs(fpr - fnr)))
        eer = float((fpr[idx] + fnr[idx]) / 2.0)
        thresh = float(thresholds[idx])
        return round(eer, 6), round(thresh, 6)
    except Exception:
        return float("nan"), float("nan")


def evaluate_dataset(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> Tuple[float, Dict[str, Any]]:
    """Evaluates model across a full DataLoader partition."""
    model.eval()
    total_loss = 0.0
    all_targets: list[int] = []
    all_preds: list[int] = []
    all_scores: list[float] = []

    t0 = time.perf_counter()
    with torch.no_grad():
        for features, labels, _ in loader:
            features = features.to(device)
            labels = labels.to(device)

            logits = model(features)
            loss = criterion(logits, labels)
            total_loss += loss.item() * features.size(0)

            probs = torch.softmax(logits, dim=-1)[:, 1]
            preds = torch.argmax(logits, dim=-1)

            all_targets.extend(labels.cpu().tolist())
            all_preds.extend(preds.cpu().tolist())
            all_scores.extend(probs.cpu().tolist())

    eval_time = time.perf_counter() - t0
    y_true = np.array(all_targets)
    y_pred = np.array(all_preds)
    y_score = np.array(all_scores)

    avg_loss = total_loss / max(len(y_true), 1)
    acc = float(accuracy_score(y_true, y_pred))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))

    try:
        auc = float(roc_auc_score(y_true, y_score))
    except Exception:
        auc = 0.5

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])

    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0
    eer, eer_thresh = compute_eer(y_true, y_score)
    latency_per_sample_ms = (eval_time / max(len(y_true), 1)) * 1000.0

    metrics = {
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
        "eer": round(eer, 4),
        "eer_threshold": round(eer_thresh, 4),
        "latency_per_sample_ms": round(latency_per_sample_ms, 3),
        "eval_time_sec": round(eval_time, 2),
    }
    return avg_loss, metrics


def train_model(
    epochs: int = 15,
    batch_size: int = 32,
    lr: float = 1e-3,
    preload: bool = True,
    seed: int = 42,
) -> Dict[str, Any]:
    """Runs complete 15-epoch training loop on CPU, selects by validation recall, evaluates on test."""
    torch.manual_seed(seed)
    np.random.seed(seed)
    device = torch.device("cpu")

    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Initializing datasets (preload=%s)...", preload)
    train_ds = ASVSpoof2021BenchmarkDataset(split="train", repo_root=str(PROJECT_ROOT), preload_to_memory=preload)
    val_ds = ASVSpoof2021BenchmarkDataset(split="val", repo_root=str(PROJECT_ROOT), preload_to_memory=preload)
    test_ds = ASVSpoof2021BenchmarkDataset(split="test", repo_root=str(PROJECT_ROOT), preload_to_memory=preload)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3).to(device)
    param_count = model.count_parameters()
    logger.info("Model initialized: MiniAcousticCNN (%d trainable parameters)", param_count)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

    best_val_recall = -1.0
    best_val_f1 = -1.0
    best_epoch = -1
    best_checkpoint_path = CHECKPOINT_DIR / "best_mini_acoustic_cnn.pt"
    epoch_history: list[dict] = []

    logger.info("Starting training loop (%d epochs on %s)...", epochs, device)
    total_train_start = time.perf_counter()

    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        ep_start = time.perf_counter()

        for features, labels, _ in train_loader:
            features = features.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()
            logits = model(features)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * features.size(0)

        train_loss = running_loss / len(train_ds)
        val_loss, val_m = evaluate_dataset(model, val_loader, criterion, device)
        ep_duration = time.perf_counter() - ep_start

        logger.info(
            "Epoch [%02d/%02d] (%.1fs) | Train Loss: %.4f | Val Loss: %.4f | "
            "Val Acc: %.4f | Val Rec: %.4f | Val F1: %.4f | Val AUC: %.4f | Val EER: %.4f",
            epoch, epochs, ep_duration, train_loss, val_loss,
            val_m["accuracy"], val_m["recall"], val_m["f1"], val_m["roc_auc"], val_m["eer"]
        )

        epoch_record = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "val_loss": val_loss,
            "val_metrics": val_m,
            "epoch_sec": round(ep_duration, 2),
        }
        epoch_history.append(epoch_record)

        # Selection Criterion: Primary = Validation Recall, Secondary = Validation F1
        val_rec = val_m["recall"]
        val_f1 = val_m["f1"]
        is_best = False
        if val_rec > best_val_recall:
            is_best = True
        elif val_rec == best_val_recall and val_f1 > best_val_f1:
            is_best = True

        if is_best:
            best_val_recall = val_rec
            best_val_f1 = val_f1
            best_epoch = epoch
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "val_metrics": val_m,
                    "param_count": param_count,
                    "selection_basis": "Validation Recall -> Validation F1",
                },
                best_checkpoint_path,
            )
            logger.info("  --> Saved new best checkpoint at epoch %d (Val Recall: %.4f, Val F1: %.4f)", epoch, val_rec, val_f1)

    total_train_sec = time.perf_counter() - total_train_start
    logger.info("Training complete in %.1f seconds. Best checkpoint from Epoch %d", total_train_sec, best_epoch)

    # Load best checkpoint for ONE final evaluation on held-out test set
    logger.info("Loading best checkpoint for final held-out test evaluation...")
    ckpt = torch.load(best_checkpoint_path, map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])
    ckpt_size_bytes = best_checkpoint_path.stat().st_size

    test_loss, test_m = evaluate_dataset(model, test_loader, criterion, device)
    best_val_m = ckpt["val_metrics"]

    logger.info("========================================================================")
    logger.info("  FINAL HELD-OUT TEST EVALUATION (MiniAcousticCNN vs Random Forest)")
    logger.info("========================================================================")
    logger.info("Metric          MiniAcousticCNN (Best Val Epoch %d)    RandomForest Baseline", best_epoch)
    logger.info("------------------------------------------------------------------------")
    for key in ["accuracy", "precision", "recall", "f1", "roc_auc", "fpr", "fnr", "eer"]:
        m_val = test_m[key]
        rf_val = RF_BASELINE_TEST[key]
        delta = m_val - rf_val
        logger.info("%-15s %-32.4f %-20.4f (Delta: %+0.4f)", key.upper(), m_val, rf_val, delta)
    logger.info("Latency/sample: %.3f ms", test_m["latency_per_sample_ms"])
    logger.info("Param Count:    %d", param_count)
    logger.info("Checkpoint Size: %.2f KB", ckpt_size_bytes / 1024.0)

    final_results = {
        "model_name": "MiniAcousticCNN",
        "architecture": "Conv2D(2,32)-BN-ReLU-Pool -> Conv2D(32,64)-BN-ReLU-Pool -> Conv2D(64,128)-BN-ReLU -> AvgPool -> Linear(128,2)",
        "parameter_count": param_count,
        "checkpoint_file": str(best_checkpoint_path),
        "checkpoint_size_bytes": ckpt_size_bytes,
        "best_epoch": best_epoch,
        "total_training_sec": round(total_train_sec, 2),
        "best_val_metrics": best_val_m,
        "final_held_out_test_metrics": test_m,
        "rf_baseline_comparison": {
            "rf_baseline_test": RF_BASELINE_TEST,
            "neural_vs_rf_delta": {
                k: round(test_m[k] - RF_BASELINE_TEST[k], 4)
                for k in ["accuracy", "precision", "recall", "f1", "roc_auc", "fpr", "fnr", "eer"]
            },
            "recall_improved": test_m["recall"] > RF_BASELINE_TEST["recall"],
            "fnr_reduced": test_m["fnr"] < RF_BASELINE_TEST["fnr"],
            "f1_improved": test_m["f1"] > RF_BASELINE_TEST["f1"],
        },
        "epoch_history": epoch_history,
    }

    report_path = RESULTS_DIR / "test_evaluation_report.json"
    report_path.write_text(json.dumps(final_results, indent=2), encoding="utf-8")
    logger.info("Saved final evaluation report -> %s", report_path)

    return final_results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train MiniAcousticCNN on ASVspoof 2021 benchmark")
    parser.add_argument("--epochs", type=int, default=15, help="Number of epochs (default: 15)")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size (default: 32)")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate (default: 1e-3)")
    parser.add_argument("--no-preload", action="store_true", help="Disable preloading dataset to RAM")
    args = parser.parse_args()

    train_model(
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        preload=not args.no_preload,
    )
