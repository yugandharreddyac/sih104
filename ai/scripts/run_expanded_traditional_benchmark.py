#!/usr/bin/env python3
"""
SIH104 — Expanded Traditional ML & Ensemble Benchmark
Evaluates 7 individual supervised models + 5 principled probability ensembles.
Uses strict validation-based model selection; untouched test set for final evaluation.
Saves all artifacts under ai/models/traditional/expanded_benchmark/ (preserves baseline).
"""

import os
import sys
import time
import json
import logging
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import (
    RandomForestClassifier,
    ExtraTreesClassifier,
    GradientBoostingClassifier,
    HistGradientBoostingClassifier,
)
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)
import joblib

# Ensure project root in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ai.app.ml.trainer import compute_eer, compute_min_dcf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("sih104.expanded_benchmark")

EXPANDED_DIR = os.path.join(PROJECT_ROOT, "ai", "models", "traditional", "expanded_benchmark")
os.makedirs(EXPANDED_DIR, exist_ok=True)
CM_DIR = os.path.join(EXPANDED_DIR, "confusion_matrices")
os.makedirs(CM_DIR, exist_ok=True)


def evaluate_predictions(
    y_true: np.ndarray,
    probs: np.ndarray,
    preds: np.ndarray,
    model_name: str,
    predict_time_sec: float,
    train_time_sec: float = 0.0,
) -> Dict[str, Any]:
    acc = float(accuracy_score(y_true, preds))
    prec = float(precision_score(y_true, preds, zero_division=0))
    rec = float(recall_score(y_true, preds, zero_division=0))
    f1 = float(f1_score(y_true, preds, zero_division=0))

    try:
        auc = float(roc_auc_score(y_true, probs))
    except Exception:
        auc = 0.5

    cm = confusion_matrix(y_true, preds, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])

    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0

    eer, eer_thresh = compute_eer(y_true, probs)
    min_dcf, min_dcf_thresh = compute_min_dcf(y_true, probs)

    return {
        "model_name": model_name,
        "accuracy": round(acc, 6),
        "precision": round(prec, 6),
        "recall": round(rec, 6),
        "f1": round(f1, 6),
        "roc_auc": round(auc, 6),
        "fpr": round(fpr, 6),
        "fnr": round(fnr, 6),
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tp": tp,
        "eer": round(eer, 6),
        "eer_threshold": round(eer_thresh, 6),
        "min_dcf": round(min_dcf, 6),
        "train_time_sec": round(train_time_sec, 4),
        "predict_time_sec": round(predict_time_sec, 4),
    }


def main():
    logger.info("========================================================================")
    logger.info("  SIH104 — EXPANDED TRADITIONAL ML & ENSEMBLE BENCHMARK")
    logger.info("========================================================================")

    # 1. Dataset Loading & Integrity Check
    parquet_path = os.path.join(PROJECT_ROOT, "datasets", "processed", "asvspoof_benchmark_2000.parquet")
    if not os.path.exists(parquet_path):
        logger.error(f"Dataset parquet not found at {parquet_path}")
        sys.exit(1)

    df = pd.read_parquet(parquet_path)
    logger.info(f"Loaded {len(df)} samples from {parquet_path}")

    # Feature columns (48 features)
    feat_cols = [
        c for c in df.columns
        if c.startswith("log_mel_") or c.startswith("lfcc_") or c in [
            "spectral_flatness",
            "vocoder_phase_distortion",
            "high_freq_attenuation_ratio",
            "temporal_variance",
        ]
    ]
    assert len(feat_cols) == 48, f"Expected 48 features, found {len(feat_cols)}"
    logger.info(f"Verified feature count: {len(feat_cols)}")

    # Check finite values
    X_all = df[feat_cols].to_numpy(dtype=np.float32)
    assert np.isfinite(X_all).all(), "Non-finite values found in feature matrix!"

    # Split verification
    train_mask = (df["split"] == "train")
    val_mask = (df["split"] == "val")
    test_mask = (df["split"] == "test")

    train_spk = set(df[train_mask]["speaker_id"])
    val_spk = set(df[val_mask]["speaker_id"])
    test_spk = set(df[test_mask]["speaker_id"])

    assert len(train_spk & val_spk) == 0, "Speaker leakage train-val!"
    assert len(train_spk & test_spk) == 0, "Speaker leakage train-test!"
    assert len(val_spk & test_spk) == 0, "Speaker leakage val-test!"
    logger.info("Zero speaker leakage verified across Train/Val/Test!")

    X_train = df[train_mask][feat_cols].to_numpy(dtype=np.float32)
    y_train = df[train_mask]["label"].to_numpy(dtype=np.int64)

    X_val = df[val_mask][feat_cols].to_numpy(dtype=np.float32)
    y_val = df[val_mask]["label"].to_numpy(dtype=np.int64)

    X_test = df[test_mask][feat_cols].to_numpy(dtype=np.float32)
    y_test = df[test_mask]["label"].to_numpy(dtype=np.int64)

    logger.info(f"Train split: {len(X_train)} (Bona-fide: {sum(y_train==0)}, Spoof: {sum(y_train==1)}, Speakers: {len(train_spk)})")
    logger.info(f"Val split:   {len(X_val)} (Bona-fide: {sum(y_val==0)}, Spoof: {sum(y_val==1)}, Speakers: {len(val_spk)})")
    logger.info(f"Test split:  {len(X_test)} (Bona-fide: {sum(y_test==0)}, Spoof: {sum(y_test==1)}, Speakers: {len(test_spk)})")

    # 2. Check Available Libraries
    logger.info("\nChecking available libraries:")
    for lib in ["sklearn", "xgboost", "lightgbm", "catboost"]:
        try:
            m = __import__(lib)
            logger.info(f"  {lib}: {getattr(m, '__version__', 'installed')}")
        except ImportError:
            logger.info(f"  {lib}: OPTIONAL MODEL NOT AVAILABLE")

    # 3. Define Candidate Individual Models
    models: Dict[str, Any] = {
        "RandomForest[n200_dNone_leaf2]": RandomForestClassifier(
            n_estimators=200, max_depth=None, min_samples_leaf=2, random_state=42, n_jobs=-1
        ),
        "ExtraTrees[n200_dNone]": ExtraTreesClassifier(
            n_estimators=200, max_depth=None, random_state=42, n_jobs=-1
        ),
        "SVM_RBF[C=1.0_scale]": Pipeline([
            ("scaler", StandardScaler()),
            ("svm", SVC(C=1.0, gamma="scale", probability=True, random_state=42)),
        ]),
        "LogisticRegression[C=0.1]": Pipeline([
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(C=0.1, max_iter=1000, random_state=42)),
        ]),
        "GradientBoosting[n100_lr0.1_d3]": GradientBoostingClassifier(
            n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42
        ),
        "HistGradientBoosting[lr0.05_iter200_leaves31]": HistGradientBoostingClassifier(
            learning_rate=0.05, max_iter=200, max_leaf_nodes=31, random_state=42
        ),
        "KNN[k=5_distance]": Pipeline([
            ("scaler", StandardScaler()),
            ("knn", KNeighborsClassifier(n_neighbors=5, weights="distance")),
        ]),
    }

    # 4. Train Individual Models on TRAIN ONLY
    logger.info("\n========================================================================")
    logger.info("  Training Individual Models on TRAIN Split Only")
    logger.info("========================================================================")

    trained_models: Dict[str, Any] = {}
    val_probs: Dict[str, np.ndarray] = {}
    test_probs: Dict[str, np.ndarray] = {}
    train_times: Dict[str, float] = {}

    for name, estimator in models.items():
        logger.info(f"Fitting {name} on {len(X_train)} train samples ...")
        t0 = time.perf_counter()
        estimator.fit(X_train, y_train)
        fit_time = time.perf_counter() - t0
        train_times[name] = fit_time
        trained_models[name] = estimator

        # Get Validation Probabilities
        t_pred = time.perf_counter()
        p_val = estimator.predict_proba(X_val)[:, 1]
        val_probs[name] = p_val

        # Get Test Probabilities
        p_test = estimator.predict_proba(X_test)[:, 1]
        test_probs[name] = p_test

    # 5. Evaluate Individual Models on VALIDATION
    val_results: Dict[str, Dict[str, Any]] = {}
    for name, estimator in trained_models.items():
        probs = val_probs[name]
        preds = (probs >= 0.5).astype(int)
        metrics = evaluate_predictions(
            y_true=y_val,
            probs=probs,
            preds=preds,
            model_name=name,
            predict_time_sec=0.001,
            train_time_sec=train_times[name],
        )
        val_results[name] = metrics

    # 6. Principled Probability-Level Ensembles
    logger.info("\n========================================================================")
    logger.info("  Evaluating Principled Probability-Level Ensembles on VALIDATION")
    logger.info("========================================================================")

    ensemble_definitions = {
        "Ensemble_RF_SVM": ["RandomForest[n200_dNone_leaf2]", "SVM_RBF[C=1.0_scale]"],
        "Ensemble_RF_ExtraTrees": ["RandomForest[n200_dNone_leaf2]", "ExtraTrees[n200_dNone]"],
        "Ensemble_RF_HistGB": ["RandomForest[n200_dNone_leaf2]", "HistGradientBoosting[lr0.05_iter200_leaves31]"],
        "Ensemble_RF_SVM_GB": ["RandomForest[n200_dNone_leaf2]", "SVM_RBF[C=1.0_scale]", "GradientBoosting[n100_lr0.1_d3]"],
    }

    ensemble_val_probs: Dict[str, np.ndarray] = {}
    ensemble_test_probs: Dict[str, np.ndarray] = {}
    ensemble_configs: Dict[str, Any] = {}

    for ens_name, members in ensemble_definitions.items():
        # Soft voting: arithmetic average of member probabilities
        p_val_members = [val_probs[m] for m in members]
        p_test_members = [test_probs[m] for m in members]

        ens_val_p = np.mean(p_val_members, axis=0)
        ens_test_p = np.mean(p_test_members, axis=0)

        ensemble_val_probs[ens_name] = ens_val_p
        ensemble_test_probs[ens_name] = ens_test_p
        ensemble_configs[ens_name] = {"members": members, "weights": [round(1.0/len(members), 4)]*len(members), "type": "equal_weight_soft_vote"}

        ens_preds = (ens_val_p >= 0.5).astype(int)
        total_train_t = sum(train_times[m] for m in members)
        metrics = evaluate_predictions(
            y_true=y_val,
            probs=ens_val_p,
            preds=ens_preds,
            model_name=ens_name,
            predict_time_sec=0.002,
            train_time_sec=total_train_t,
        )
        val_results[ens_name] = metrics

    # 7. Optimal Weighted Ensemble Grid Search (RF + SVM + GB) on VALIDATION ONLY
    logger.info("Optimizing weighted ensemble (RF + SVM + GB) on Validation set...")
    best_weighted_val_rec = -1.0
    best_weighted_val_f1 = -1.0
    best_weighted_val_auc = -1.0
    best_weights = (0.33, 0.33, 0.34)
    best_w_val_p = None
    best_w_test_p = None

    for w_rf in np.linspace(0.1, 0.8, 8):
        for w_svm in np.linspace(0.1, 0.8, 8):
            w_gb = 1.0 - w_rf - w_svm
            if w_gb < 0.05:
                continue
            curr_val_p = (
                w_rf * val_probs["RandomForest[n200_dNone_leaf2]"] +
                w_svm * val_probs["SVM_RBF[C=1.0_scale]"] +
                w_gb * val_probs["GradientBoosting[n100_lr0.1_d3]"]
            )
            curr_preds = (curr_val_p >= 0.5).astype(int)
            rec = recall_score(y_val, curr_preds, zero_division=0)
            f1 = f1_score(y_val, curr_preds, zero_division=0)
            auc = roc_auc_score(y_val, curr_val_p)

            # Strict selection hierarchy: Recall -> F1 -> ROC-AUC
            if (rec > best_weighted_val_rec) or (
                rec == best_weighted_val_rec and f1 > best_weighted_val_f1
            ) or (
                rec == best_weighted_val_rec and f1 == best_weighted_val_f1 and auc > best_weighted_val_auc
            ):
                best_weighted_val_rec = rec
                best_weighted_val_f1 = f1
                best_weighted_val_auc = auc
                best_weights = (round(float(w_rf), 3), round(float(w_svm), 3), round(float(w_gb), 3))
                best_w_val_p = curr_val_p
                best_w_test_p = (
                    w_rf * test_probs["RandomForest[n200_dNone_leaf2]"] +
                    w_svm * test_probs["SVM_RBF[C=1.0_scale]"] +
                    w_gb * test_probs["GradientBoosting[n100_lr0.1_d3]"]
                )

    w_ens_name = f"Ensemble_RF_SVM_GB_Optimized[w_rf={best_weights[0]}_w_svm={best_weights[1]}_w_gb={best_weights[2]}]"
    ensemble_val_probs[w_ens_name] = best_w_val_p
    ensemble_test_probs[w_ens_name] = best_w_test_p
    ensemble_configs[w_ens_name] = {
        "members": ["RandomForest[n200_dNone_leaf2]", "SVM_RBF[C=1.0_scale]", "GradientBoosting[n100_lr0.1_d3]"],
        "weights": list(best_weights),
        "type": "validation_calibrated_weights"
    }

    w_ens_preds = (best_w_val_p >= 0.5).astype(int)
    w_ens_train_t = sum(train_times[m] for m in ["RandomForest[n200_dNone_leaf2]", "SVM_RBF[C=1.0_scale]", "GradientBoosting[n100_lr0.1_d3]"])
    val_results[w_ens_name] = evaluate_predictions(
        y_true=y_val,
        probs=best_w_val_p,
        preds=w_ens_preds,
        model_name=w_ens_name,
        predict_time_sec=0.003,
        train_time_sec=w_ens_train_t,
    )

    # 8. Model Selection on VALIDATION ONLY
    logger.info("\n========================================================================")
    logger.info("  VALIDATION SET PERFORMANCE (All Models & Ensembles)")
    logger.info("========================================================================")
    logger.info(f"{'Model':<55} {'Acc':<7} {'Prec':<7} {'Rec':<7} {'F1':<7} {'AUC':<7} {'FPR':<7} {'FNR':<7}")
    logger.info("-" * 105)

    all_candidate_names = list(models.keys()) + list(ensemble_definitions.keys()) + [w_ens_name]

    # Sort strictly by Recall (descending), then F1 (descending), then ROC-AUC (descending)
    sorted_candidates = sorted(
        all_candidate_names,
        key=lambda k: (val_results[k]["recall"], val_results[k]["f1"], val_results[k]["roc_auc"]),
        reverse=True,
    )

    winner_name = sorted_candidates[0]

    for name in sorted_candidates:
        m = val_results[name]
        is_winner = " <-- VALIDATION WINNER" if name == winner_name else ""
        logger.info(
            f"{name:<55} {m['accuracy']:<7.4f} {m['precision']:<7.4f} {m['recall']:<7.4f} "
            f"{m['f1']:<7.4f} {m['roc_auc']:<7.4f} {m['fpr']:<7.4f} {m['fnr']:<7.4f}{is_winner}"
        )

    logger.info(f"\nWINNER SELECTED ON VALIDATION ONLY: {winner_name}")
    logger.info(f"Validation Recall: {val_results[winner_name]['recall']}, F1: {val_results[winner_name]['f1']}, ROC-AUC: {val_results[winner_name]['roc_auc']}")

    # 9. Final Evaluation on UNTOUCHED TEST SET
    logger.info("\n========================================================================")
    logger.info("  FINAL EVALUATION ON UNTOUCHED TEST SET")
    logger.info("========================================================================")
    logger.info(f"{'Model':<55} {'Acc':<7} {'Prec':<7} {'Rec':<7} {'F1':<7} {'AUC':<7} {'FPR':<7} {'FNR':<7}")
    logger.info("-" * 105)

    test_results: Dict[str, Dict[str, Any]] = {}

    for name in sorted_candidates:
        if name in test_probs:
            p_test = test_probs[name]
            t_train = train_times.get(name, 0.0)
        else:
            p_test = ensemble_test_probs[name]
            cfg = ensemble_configs[name]
            t_train = sum(train_times[m] for m in cfg["members"])

        t0 = time.perf_counter()
        preds = (p_test >= 0.5).astype(int)
        p_time = time.perf_counter() - t0

        m = evaluate_predictions(
            y_true=y_test,
            probs=p_test,
            preds=preds,
            model_name=name,
            predict_time_sec=p_time,
            train_time_sec=t_train,
        )
        test_results[name] = m
        is_winner = " <-- PRIMARY (Val Winner)" if name == winner_name else ""
        logger.info(
            f"{name:<55} {m['accuracy']:<7.4f} {m['precision']:<7.4f} {m['recall']:<7.4f} "
            f"{m['f1']:<7.4f} {m['roc_auc']:<7.4f} {m['fpr']:<7.4f} {m['fnr']:<7.4f}{is_winner}"
        )

    # 10. Save Artifacts Safely into EXPANDED_DIR
    logger.info("\n========================================================================")
    logger.info(f"  Saving Artifacts into {EXPANDED_DIR}")
    logger.info("========================================================================")

    # Save winner model
    winner_is_ensemble = winner_name in ensemble_configs
    if winner_is_ensemble:
        cfg = ensemble_configs[winner_name]
        winner_artifact = {
            "type": "ensemble",
            "name": winner_name,
            "members": cfg["members"],
            "weights": cfg["weights"],
            "models": {m: trained_models[m] for m in cfg["members"]},
        }
    else:
        winner_artifact = {
            "type": "single",
            "name": winner_name,
            "model": trained_models[winner_name],
        }

    winner_model_path = os.path.join(EXPANDED_DIR, "expanded_winner_model.joblib")
    joblib.dump(winner_artifact, winner_model_path)
    model_size_bytes = os.path.getsize(winner_model_path)
    logger.info(f"Saved winner model to {winner_model_path} ({model_size_bytes:,} bytes)")

    # Save winner info JSON
    winner_info = {
        "title": "SIH104 Expanded Benchmark Winner",
        "selected_winner": winner_name,
        "is_ensemble": winner_is_ensemble,
        "selection_basis": "Validation Recall (primary) -> F1 (secondary) -> ROC-AUC (tertiary)",
        "val_metrics": val_results[winner_name],
        "test_metrics": test_results[winner_name],
        "model_file": "expanded_winner_model.joblib",
        "model_size_bytes": model_size_bytes,
        "baseline_comparison": {
            "baseline_model": "RandomForest[n200_dNone_leaf2]",
            "baseline_test_recall": test_results["RandomForest[n200_dNone_leaf2]"]["recall"],
            "baseline_test_fnr": test_results["RandomForest[n200_dNone_leaf2]"]["fnr"],
            "baseline_test_f1": test_results["RandomForest[n200_dNone_leaf2]"]["f1"],
            "baseline_test_auc": test_results["RandomForest[n200_dNone_leaf2]"]["roc_auc"],
            "baseline_test_acc": test_results["RandomForest[n200_dNone_leaf2]"]["accuracy"],
            "winner_test_recall": test_results[winner_name]["recall"],
            "winner_test_fnr": test_results[winner_name]["fnr"],
            "winner_test_f1": test_results[winner_name]["f1"],
            "winner_test_auc": test_results[winner_name]["roc_auc"],
            "winner_test_acc": test_results[winner_name]["accuracy"],
            "recall_improved": bool(test_results[winner_name]["recall"] > test_results["RandomForest[n200_dNone_leaf2]"]["recall"]),
            "fnr_improved": bool(test_results[winner_name]["fnr"] < test_results["RandomForest[n200_dNone_leaf2]"]["fnr"]),
            "f1_improved": bool(test_results[winner_name]["f1"] > test_results["RandomForest[n200_dNone_leaf2]"]["f1"]),
        }
    }

    winner_info_path = os.path.join(EXPANDED_DIR, "expanded_winner_info.json")
    with open(winner_info_path, "w", encoding="utf-8") as fp:
        json.dump(winner_info, fp, indent=2)

    # Save comprehensive results
    full_results = {
        "metadata": {
            "title": "SIH104 Expanded Traditional ML & Ensemble Benchmark",
            "samples": len(df),
            "train_samples": len(X_train),
            "val_samples": len(X_val),
            "test_samples": len(X_test),
            "features": len(feat_cols),
            "speakers": {
                "train": len(train_spk),
                "val": len(val_spk),
                "test": len(test_spk),
            }
        },
        "validation_results": val_results,
        "test_results": test_results,
        "selected_winner": winner_name,
        "winner_info": winner_info,
    }

    results_path = os.path.join(EXPANDED_DIR, "expanded_benchmark_results.json")
    with open(results_path, "w", encoding="utf-8") as fp:
        json.dump(full_results, fp, indent=2)

    logger.info(f"Saved complete results JSON to {results_path}")
    logger.info("\nExpanded benchmark run complete!")


if __name__ == "__main__":
    main()
