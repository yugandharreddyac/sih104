"""SIH104 — Traditional ML Model Trainer and Evaluator.

Trains three traditional ML classifiers on the extracted feature dataset:
  1. Logistic Regression (with StandardScaler)
  2. Random Forest (no scaler needed; tree-based)
  3. SVM with RBF kernel (with StandardScaler)

Model selection methodology (CORRECTED):
  - All models are fitted on the TRAINING set only.
  - The VALIDATION set is used to select the best model.
  - The TEST set is used ONLY for the final unbiased evaluation of the
    selected model. Test-set metrics do NOT influence model selection.
  - Selection criterion: Recall (primary) -> F1 (secondary) -> ROC-AUC (tertiary).
    Recall is prioritised to minimise missed deepfakes (FNR).

Label convention:
  0 = bonafide
  1 = spoof (deepfake)

The best model is persisted to ai/models/traditional/ along with
its scaler, feature config, and evaluation metrics.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    RandomForestClassifier,
    HistGradientBoostingClassifier,
    ExtraTreesClassifier,
    GradientBoostingClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

MODEL_DIR = Path("ai/models/traditional")
RANDOM_SEED = 42


# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ModelMetrics:
    """Evaluation metrics for one model on an evaluation set."""
    model_name: str
    accuracy: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    roc_auc: float = 0.0
    fpr: float = 0.0         # False Positive Rate
    fnr: float = 0.0         # False Negative Rate (= 1 - Recall)
    tn: int = 0
    fp: int = 0
    fn: int = 0
    tp: int = 0
    train_time_sec: float = 0.0
    predict_time_sec: float = 0.0
    eer: float = float("nan")
    eer_threshold: float = float("nan")
    min_dcf: float = float("nan")


# ─────────────────────────────────────────────────────────────────────────────
# Model factory
# ─────────────────────────────────────────────────────────────────────────────

def build_models(random_seed: int = RANDOM_SEED) -> Dict[str, Any]:
    """Return dict of {name: sklearn estimator} to train.

    All classifiers are configured for imbalanced data (class_weight='balanced').
    Logistic Regression and SVM use StandardScaler via Pipeline.

    Returns:
        Dict mapping model name -> sklearn estimator or Pipeline.
    """
    lr = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(
            class_weight="balanced",
            max_iter=1000,
            random_state=random_seed,
            solver="lbfgs",
            C=1.0,
        )),
    ])

    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=16,
        class_weight="balanced_subsample",
        random_state=random_seed,
        n_jobs=-1,
    )

    svm = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", SVC(
            kernel="rbf",
            class_weight="balanced",
            probability=True,
            random_state=random_seed,
            C=10.0,
            gamma="scale",
        )),
    ])

    return {
        "LogisticRegression": lr,
        "RandomForest": rf,
        "SVM_RBF": svm,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Biometric / Spoof Detection Specific Metrics (EER & minDCF)
# ─────────────────────────────────────────────────────────────────────────────

def compute_eer(y_true: np.ndarray, y_scores: np.ndarray) -> Tuple[float, float]:
    """Compute Equal Error Rate (EER) and operating threshold from continuous scores.

    Operating point where False Acceptance Rate (FPR) equals False Rejection Rate (FNR).

    Returns:
        (eer, threshold_at_eer). Returns (nan, nan) if scores cannot be evaluated.
    """
    try:
        if len(np.unique(y_true)) < 2:
            return float("nan"), float("nan")
        fpr, tpr, thresholds = roc_curve(y_true, y_scores, pos_label=1)
        fnr = 1.0 - tpr
        idx = int(np.nanargmin(np.abs(fpr - fnr)))
        eer = float((fpr[idx] + fnr[idx]) / 2.0)
        thresh = float(thresholds[idx])
        return round(eer, 6), round(thresh, 6)
    except Exception:
        return float("nan"), float("nan")


def compute_min_dcf(
    y_true: np.ndarray,
    y_scores: np.ndarray,
    p_target: float = 0.05,
    c_miss: float = 1.0,
    c_fa: float = 1.0,
) -> Tuple[float, float]:
    """Compute normalized minimum Detection Cost Function (minDCF).

    Protocol: ASVspoof / NIST standard minDCF.
    C_miss = 1.0, C_fa = 1.0, P_target = 0.05 (prior probability of spoof).
    DCF(theta) = C_miss * P_target * FNR(theta) + C_fa * (1 - P_target) * FPR(theta)
    DCF_default = min(C_miss * P_target, C_fa * (1 - P_target))
    norm_DCF(theta) = DCF(theta) / DCF_default
    minDCF = min_theta norm_DCF(theta)

    Returns:
        (min_dcf, threshold_at_min_dcf).
    """
    try:
        if len(np.unique(y_true)) < 2:
            return float("nan"), float("nan")
        fpr, tpr, thresholds = roc_curve(y_true, y_scores, pos_label=1)
        fnr = 1.0 - tpr
        dcf = c_miss * p_target * fnr + c_fa * (1.0 - p_target) * fpr
        dcf_default = min(c_miss * p_target, c_fa * (1.0 - p_target))
        norm_dcf = dcf / (dcf_default + 1e-12)
        min_idx = int(np.nanargmin(norm_dcf))
        return round(float(norm_dcf[min_idx]), 6), round(float(thresholds[min_idx]), 6)
    except Exception:
        return float("nan"), float("nan")


# ─────────────────────────────────────────────────────────────────────────────
# Training & Evaluation
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_model(
    model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    model_name: str,
    train_time: float,
) -> ModelMetrics:
    """Compute all evaluation metrics on an evaluation set (val or test).

    Args:
        model: Fitted sklearn estimator.
        X_test: Feature matrix.
        y_test: True labels.
        model_name: Display name for the model.
        train_time: Training duration in seconds.

    Returns:
        ModelMetrics instance.
    """
    t0 = time.perf_counter()
    y_pred = model.predict(X_test)
    predict_time = time.perf_counter() - t0

    # Probabilities for ROC-AUC, EER, and minDCF
    if hasattr(model, "predict_proba"):
        y_prob = model.predict_proba(X_test)[:, 1]
    elif hasattr(model, "decision_function"):
        df_score = model.decision_function(X_test)
        # Normalise to [0, 1]
        y_prob = (df_score - df_score.min()) / (df_score.max() - df_score.min() + 1e-8)
    else:
        y_prob = y_pred.astype(float)

    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = (cm.ravel() if cm.size == 4 else (0, 0, 0, 0))

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    try:
        roc_auc = roc_auc_score(y_test, y_prob)
    except Exception:
        roc_auc = float("nan")

    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0

    eer, eer_thresh = compute_eer(y_test, y_prob)
    min_dcf, min_dcf_thresh = compute_min_dcf(y_test, y_prob, p_target=0.05)

    metrics = ModelMetrics(
        model_name=model_name,
        accuracy=round(float(accuracy), 6),
        precision=round(float(precision), 6),
        recall=round(float(recall), 6),
        f1=round(float(f1), 6),
        roc_auc=round(float(roc_auc), 6),
        fpr=round(float(fpr), 6),
        fnr=round(float(fnr), 6),
        tn=int(tn), fp=int(fp), fn=int(fn), tp=int(tp),
        train_time_sec=round(train_time, 3),
        predict_time_sec=round(predict_time, 3),
        eer=eer,
        eer_threshold=eer_thresh,
        min_dcf=min_dcf,
    )

    logger.info(
        "[%s] Accuracy=%.4f  Precision=%.4f  Recall=%.4f  F1=%.4f  ROC-AUC=%.4f  FPR=%.4f  FNR=%.4f  EER=%.4f  minDCF=%.4f",
        model_name, accuracy, precision, recall, f1, roc_auc, fpr, fnr, eer, min_dcf,
    )
    logger.info(
        "[%s] Confusion Matrix: TN=%d  FP=%d  FN=%d  TP=%d",
        model_name, tn, fp, fn, tp,
    )

    return metrics


def train_and_evaluate(
    df: pd.DataFrame,
    feature_names: List[str],
    random_seed: int = RANDOM_SEED,
) -> Tuple[Dict[str, Any], Dict[str, ModelMetrics], Dict[str, ModelMetrics], str]:
    """Train all models, select on validation set, and evaluate on test set.

    Model selection methodology:
      1. All models are fitted on the TRAINING set only.
      2. All models are evaluated on the VALIDATION set.
      3. The best model is selected from VALIDATION metrics
         (criterion: Recall -> F1 -> ROC-AUC).
      4. All models are evaluated on the TEST set for reporting.
         Test-set metrics do NOT influence model selection.

    Args:
        df: Feature DataFrame with columns [split, label, *feature_names].
        feature_names: Ordered list of feature column names.
        random_seed: Reproducibility seed.

    Returns:
        (fitted_models, val_metrics, test_metrics, best_model_name)
        - val_metrics:  ModelMetrics for all models on the validation set.
        - test_metrics: ModelMetrics for all models on the test set.
        - best_model_name: Selected using val_metrics ONLY.
    """
    # Split dataframe by pre-assigned split column
    train_df = df[df["split"] == "train"].reset_index(drop=True)
    val_df   = df[df["split"] == "val"].reset_index(drop=True)
    test_df  = df[df["split"] == "test"].reset_index(drop=True)

    logger.info(
        "Training set: %d samples, Val: %d, Test: %d",
        len(train_df), len(val_df), len(test_df),
    )

    if len(train_df) == 0:
        raise ValueError("Training split is empty. Cannot train models.")
    if len(val_df) == 0:
        raise ValueError(
            "Validation split is empty. Cannot perform validation-based model selection. "
            "Ensure the dataset has enough samples for a non-empty val split."
        )
    if len(test_df) == 0:
        raise ValueError("Test split is empty. Cannot evaluate models.")

    X_train = train_df[feature_names].to_numpy(dtype=np.float32)
    y_train = train_df["label"].to_numpy(dtype=np.int32)

    X_val   = val_df[feature_names].to_numpy(dtype=np.float32)
    y_val   = val_df["label"].to_numpy(dtype=np.int32)

    X_test  = test_df[feature_names].to_numpy(dtype=np.float32)
    y_test  = test_df["label"].to_numpy(dtype=np.int32)

    # Verify no NaN / Inf in training and validation data
    for arr_name, arr in [("X_train", X_train), ("X_val", X_val), ("X_test", X_test)]:
        if not np.isfinite(arr).all():
            bad_rows = np.where(~np.isfinite(arr).all(axis=1))[0]
            raise ValueError(f"{arr_name} contains non-finite values in rows: {bad_rows[:10]}")

    # Log class distribution
    logger.info(
        "Train class dist: bonafide=%d, spoof=%d. Val: bonafide=%d, spoof=%d. Test: bonafide=%d, spoof=%d",
        int((y_train == 0).sum()), int((y_train == 1).sum()),
        int((y_val == 0).sum()),   int((y_val == 1).sum()),
        int((y_test == 0).sum()),  int((y_test == 1).sum()),
    )

    models = build_models(random_seed=random_seed)
    fitted_models: Dict[str, Any] = {}
    val_metrics:  Dict[str, ModelMetrics] = {}
    test_metrics: Dict[str, ModelMetrics] = {}

    for name, estimator in models.items():
        logger.info("Training %s ...", name)
        t0 = time.perf_counter()
        estimator.fit(X_train, y_train)
        train_time = time.perf_counter() - t0
        logger.info("  %s trained in %.2fs", name, train_time)
        fitted_models[name] = estimator

        # ── Evaluate on VALIDATION set (used for model selection) ─────────
        v_metrics = evaluate_model(
            estimator, X_val, y_val,
            model_name=f"{name}[val]",
            train_time=train_time,
        )
        # Store under the bare model name for clean access
        val_metrics[name] = ModelMetrics(
            model_name=name,
            accuracy=v_metrics.accuracy,
            precision=v_metrics.precision,
            recall=v_metrics.recall,
            f1=v_metrics.f1,
            roc_auc=v_metrics.roc_auc,
            fpr=v_metrics.fpr,
            fnr=v_metrics.fnr,
            tn=v_metrics.tn, fp=v_metrics.fp,
            fn=v_metrics.fn, tp=v_metrics.tp,
            train_time_sec=v_metrics.train_time_sec,
            predict_time_sec=v_metrics.predict_time_sec,
        )

        # ── Evaluate on TEST set (reporting only, NOT used for selection) ──
        t_metrics = evaluate_model(
            estimator, X_test, y_test,
            model_name=f"{name}[test]",
            train_time=train_time,
        )
        test_metrics[name] = ModelMetrics(
            model_name=name,
            accuracy=t_metrics.accuracy,
            precision=t_metrics.precision,
            recall=t_metrics.recall,
            f1=t_metrics.f1,
            roc_auc=t_metrics.roc_auc,
            fpr=t_metrics.fpr,
            fnr=t_metrics.fnr,
            tn=t_metrics.tn, fp=t_metrics.fp,
            fn=t_metrics.fn, tp=t_metrics.tp,
            train_time_sec=t_metrics.train_time_sec,
            predict_time_sec=t_metrics.predict_time_sec,
        )

    # ── MODEL SELECTION: uses VALIDATION metrics only ─────────────────────────
    best_name = max(
        val_metrics.keys(),
        key=lambda k: (
            val_metrics[k].recall,
            val_metrics[k].f1,
            val_metrics[k].roc_auc,
        ),
    )
    logger.info(
        "[MODEL SELECTION — VAL SET] Best model: %s "
        "(Val Recall=%.4f, Val F1=%.4f, Val ROC-AUC=%.4f)",
        best_name,
        val_metrics[best_name].recall,
        val_metrics[best_name].f1,
        val_metrics[best_name].roc_auc,
    )
    logger.info(
        "[FINAL EVALUATION — TEST SET] %s "
        "(Test Recall=%.4f, Test F1=%.4f, Test ROC-AUC=%.4f)",
        best_name,
        test_metrics[best_name].recall,
        test_metrics[best_name].f1,
        test_metrics[best_name].roc_auc,
    )

    return fitted_models, val_metrics, test_metrics, best_name


# ─────────────────────────────────────────────────────────────────────────────
# Model Persistence
# ─────────────────────────────────────────────────────────────────────────────

def save_model_artifacts(
    fitted_models: Dict[str, Any],
    val_metrics: Dict[str, ModelMetrics],
    test_metrics: Dict[str, ModelMetrics],
    best_name: str,
    feature_names: List[str],
    df: pd.DataFrame,
    random_seed: int = RANDOM_SEED,
    output_dir: str | Path = MODEL_DIR,
) -> Dict[str, str]:
    """Persist all model artifacts with corrected val/test metric separation.

    Args:
        fitted_models: Dict of {name: fitted_estimator}.
        val_metrics:   ModelMetrics for all models on the VALIDATION set.
                       Used only for selection reporting.
        test_metrics:  ModelMetrics for all models on the TEST set.
                       The best_name model's test metrics are the final results.
        best_name:     Key of the selected best model (selected by val_metrics).
        feature_names: Ordered feature name list.
        df:            Full feature DataFrame (used for metadata).
        random_seed:   Training seed.
        output_dir:    Directory to save artifacts.

    Returns:
        Dict of {artifact_name: file_path}.
    """
    import datetime

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    saved_paths: Dict[str, str] = {}

    # Save all fitted models
    for name, model in fitted_models.items():
        safe_name = name.replace(" ", "_").lower()
        p = out / f"{safe_name}.joblib"
        joblib.dump(model, p, compress=3)
        saved_paths[f"model_{safe_name}"] = str(p)
        logger.info("Saved model %s -> %s", name, p)

    # Feature configuration (corrected descriptions)
    feature_config = {
        "feature_names": feature_names,
        "feature_dim": len(feature_names),
        "label_map": {"bonafide": 0, "spoof": 1},
        "audio_config": {
            "sample_rate": 16000,
            "channels": 1,
            "format": "f32le",
        },
        "preprocessing": {
            "class": "AudioPreprocessor",
            "module": "ai.app.deepfake.preprocessing",
            "applied_once": True,
            "dc_offset_removal": True,
            "pre_emphasis_alpha": 0.97,
            "frame_length_samples": 400,
            "frame_hop_samples": 160,
            "note": "Preprocessing applied inside AcousticFeatureExtractor only. "
                    "FeaturePipeline passes raw audio directly to the extractor.",
        },
        "extraction": {
            "class": "AcousticFeatureExtractor",
            "module": "ai.app.deepfake.features",
            "log_mel": {
                "n_bins": 24,
                "implementation": "Mel triangular filterbank (HTK formula, 80Hz-Nyquist) -> log energy",
            },
            "lfcc": {
                "n_bins": 20,
                "implementation": "Linear triangular filterbank -> log energy -> DCT-II",
            },
            "scalar_features": {
                "spectral_flatness": "Wiener entropy (geo_mean / arith_mean of mean power spectrum)",
                "vocoder_phase_distortion": "Mean |frame-to-frame magnitude diff| (no phase angle used; name kept for API)",
                "high_freq_attenuation_ratio": "High-to-low energy ratio at 4kHz boundary (name kept for API)",
                "temporal_variance": "np.var of per-frame total power (unnormalized)",
            },
        },
        "model_selection": {
            "selection_set": "validation",
            "criterion": "Recall (primary) -> F1 (secondary) -> ROC-AUC (tertiary)",
            "evaluation_set": "test",
            "note": "Test set is used ONLY for final unbiased evaluation of the selected model.",
        },
    }
    feat_cfg_path = out / "feature_config.json"
    feat_cfg_path.write_text(json.dumps(feature_config, indent=2), encoding="utf-8")
    saved_paths["feature_config"] = str(feat_cfg_path)

    # Dataset metadata
    train_df = df[df["split"] == "train"]
    val_df   = df[df["split"] == "val"]
    test_df  = df[df["split"] == "test"]

    # Build results dict — clearly separating val (selection) from test (evaluation)
    results = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "random_seed": random_seed,
        "dataset": {
            "total_samples": len(df),
            "successful_samples": len(df),
            "train_size": len(train_df),
            "val_size": len(val_df),
            "test_size": len(test_df),
            "class_distribution": {
                "bonafide": int((df["label"] == 0).sum()),
                "spoof": int((df["label"] == 1).sum()),
            },
            "train_class_distribution": {
                "bonafide": int((train_df["label"] == 0).sum()),
                "spoof": int((train_df["label"] == 1).sum()),
            },
            "val_class_distribution": {
                "bonafide": int((val_df["label"] == 0).sum()),
                "spoof": int((val_df["label"] == 1).sum()),
            },
            "test_class_distribution": {
                "bonafide": int((test_df["label"] == 0).sum()),
                "spoof": int((test_df["label"] == 1).sum()),
            },
            "unique_speakers": int(df["speaker_id"].nunique()),
            "train_speakers": int(train_df["speaker_id"].nunique()),
            "val_speakers": int(val_df["speaker_id"].nunique()),
            "test_speakers": int(test_df["speaker_id"].nunique()),
        },
        "feature_dim": len(feature_names),
        "methodology": {
            "model_selection_set": "validation",
            "final_evaluation_set": "test",
            "selection_criterion": "Recall (primary), F1 (secondary), ROC-AUC (tertiary)",
        },
        "val_metrics": {
            name: asdict(m) for name, m in val_metrics.items()
        },
        "test_metrics": {
            name: asdict(m) for name, m in test_metrics.items()
        },
        "best_model": {
            "name": best_name,
            "selected_by": "validation set Recall -> F1 -> ROC-AUC",
            "val_recall":   val_metrics[best_name].recall,
            "val_f1":       val_metrics[best_name].f1,
            "val_roc_auc": val_metrics[best_name].roc_auc,
            "test_recall":  test_metrics[best_name].recall,
            "test_f1":      test_metrics[best_name].f1,
            "test_roc_auc": test_metrics[best_name].roc_auc,
        },
    }

    results_path = out / "pilot_results.json"
    results_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    saved_paths["pilot_results"] = str(results_path)
    logger.info("Saved results -> %s", results_path)

    # Save best model pointer
    best_ptr = {
        "best_model_name": best_name,
        "best_model_file": f"{best_name.lower().replace(' ', '_')}.joblib",
    }
    (out / "best_model_info.json").write_text(json.dumps(best_ptr, indent=2), encoding="utf-8")
    saved_paths["best_model_info"] = str(out / "best_model_info.json")

    return saved_paths


# ─────────────────────────────────────────────────────────────────────────────
# Confusion Matrix Visualization
# ─────────────────────────────────────────────────────────────────────────────

def save_confusion_matrices(
    fitted_models: Dict[str, Any],
    test_metrics: Dict[str, ModelMetrics],
    df: pd.DataFrame,
    feature_names: List[str],
    output_dir: str | Path = MODEL_DIR,
) -> str:
    """Generate and save a confusion matrix plot for all models (test set).

    Args:
        fitted_models: Dict of {name: fitted estimator}.
        test_metrics:  ModelMetrics for all models on the TEST set.
        df: Full feature DataFrame with split column.
        feature_names: Feature column names.
        output_dir: Directory to save the plot.

    Returns:
        Path to the saved PNG file.
    """
    import matplotlib.pyplot as plt
    import matplotlib

    matplotlib.use("Agg")  # non-interactive backend

    test_df = df[df["split"] == "test"].reset_index(drop=True)
    X_test = test_df[feature_names].to_numpy(dtype=np.float32)
    y_test = test_df["label"].to_numpy(dtype=np.int32)

    n_models = len(fitted_models)
    fig, axes = plt.subplots(1, n_models, figsize=(5 * n_models, 4))
    if n_models == 1:
        axes = [axes]

    for ax, (name, model) in zip(axes, fitted_models.items()):
        y_pred = model.predict(X_test)
        cm = confusion_matrix(y_test, y_pred)

        ax.imshow(cm, interpolation="nearest", cmap="Blues")
        ax.set_title(
            f"{name}\n"
            f"Val-sel  Recall={test_metrics[name].recall:.3f}  F1={test_metrics[name].f1:.3f}",
            fontsize=9,
        )
        ax.set_xlabel("Predicted label")
        ax.set_ylabel("True label")
        ax.set_xticks([0, 1])
        ax.set_yticks([0, 1])
        ax.set_xticklabels(["bonafide", "spoof"])
        ax.set_yticklabels(["bonafide", "spoof"])

        for i in range(cm.shape[0]):
            for j in range(cm.shape[1]):
                ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                        color="white" if cm[i, j] > cm.max() / 2 else "black")

    plt.suptitle(
        "SIH104 -- ASVspoof 2021 DF  |  Test-Set Confusion Matrices",
        fontsize=11, y=1.02,
    )
    plt.tight_layout()

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    plot_path = out / "confusion_matrices.png"
    plt.savefig(plot_path, bbox_inches="tight", dpi=150)
    plt.close(fig)

    logger.info("Saved confusion matrix plot -> %s", plot_path)
    return str(plot_path)


# ─────────────────────────────────────────────────────────────────────────────
# Comprehensive Traditional AI/ML Benchmark Suite
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class BenchmarkResult:
    all_candidate_val_metrics: Dict[str, Dict[str, ModelMetrics]]
    family_champions_val: Dict[str, ModelMetrics]
    family_champions_test: Dict[str, ModelMetrics]
    family_champions_fitted: Dict[str, Any]
    family_best_configs: Dict[str, str]
    best_family: str
    best_config_name: str
    best_model: Any
    best_val_metrics: ModelMetrics
    best_test_metrics: ModelMetrics
    knn_cost_analysis: Dict[str, Any]
    optional_models_status: Dict[str, str]


def build_benchmark_candidates(random_seed: int = RANDOM_SEED) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str]]:
    """Build candidate models grouped by family with a defensible hyperparameter grid.

    Scaling policy:
      - Distance/linear/kernel models (Logistic Regression, SVM-RBF, KNN):
        Fitted with StandardScaler via sklearn Pipeline.
      - Tree-based models (Random Forest, Extra Trees, Gradient Boosting, HistGradientBoosting):
        Fitted on raw features.

    Returns:
        (candidate_families, optional_models_status)
    """
    candidates: Dict[str, Dict[str, Any]] = {}
    optional_status: Dict[str, str] = {}

    # 1. Logistic Regression (distance/linear -> StandardScaler)
    candidates["LogisticRegression"] = {
        "C=0.1": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=0.1, class_weight="balanced", max_iter=1000, solver="lbfgs", random_state=random_seed)),
        ]),
        "C=1.0": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=1.0, class_weight="balanced", max_iter=1000, solver="lbfgs", random_state=random_seed)),
        ]),
        "C=10.0": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=10.0, class_weight="balanced", max_iter=1000, solver="lbfgs", random_state=random_seed)),
        ]),
    }

    # 2. Random Forest (tree ensemble -> raw features)
    candidates["RandomForest"] = {
        "n200_d16": RandomForestClassifier(
            n_estimators=200, max_depth=16, min_samples_leaf=1,
            class_weight="balanced_subsample", random_state=random_seed, n_jobs=-1,
        ),
        "n400_d16": RandomForestClassifier(
            n_estimators=400, max_depth=16, min_samples_leaf=1,
            class_weight="balanced_subsample", random_state=random_seed, n_jobs=-1,
        ),
        "n200_dNone_leaf2": RandomForestClassifier(
            n_estimators=200, max_depth=None, min_samples_leaf=2,
            class_weight="balanced_subsample", random_state=random_seed, n_jobs=-1,
        ),
    }

    # 3. SVM-RBF (kernel distance -> StandardScaler)
    candidates["SVM_RBF"] = {
        "C=1.0_scale": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", SVC(kernel="rbf", C=1.0, gamma="scale", class_weight="balanced", probability=True, random_state=random_seed)),
        ]),
        "C=10.0_scale": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", SVC(kernel="rbf", C=10.0, gamma="scale", class_weight="balanced", probability=True, random_state=random_seed)),
        ]),
    }

    # 4. K-Nearest Neighbors (distance metric -> StandardScaler)
    candidates["KNN"] = {
        "k=3_uniform": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", KNeighborsClassifier(n_neighbors=3, weights="uniform", n_jobs=-1)),
        ]),
        "k=5_uniform": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", KNeighborsClassifier(n_neighbors=5, weights="uniform", n_jobs=-1)),
        ]),
        "k=7_uniform": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", KNeighborsClassifier(n_neighbors=7, weights="uniform", n_jobs=-1)),
        ]),
        "k=5_distance": Pipeline([
            ("scaler", StandardScaler()),
            ("clf", KNeighborsClassifier(n_neighbors=5, weights="distance", n_jobs=-1)),
        ]),
    }

    # 5. Extra Trees (extremely randomized trees -> raw features)
    candidates["ExtraTrees"] = {
        "n200_d16": ExtraTreesClassifier(
            n_estimators=200, max_depth=16, class_weight="balanced", random_state=random_seed, n_jobs=-1,
        ),
        "n400_d16": ExtraTreesClassifier(
            n_estimators=400, max_depth=16, class_weight="balanced", random_state=random_seed, n_jobs=-1,
        ),
        "n200_dNone": ExtraTreesClassifier(
            n_estimators=200, max_depth=None, class_weight="balanced", random_state=random_seed, n_jobs=-1,
        ),
    }

    # 6. Gradient Boosting (sequential boosting -> raw features)
    candidates["GradientBoosting"] = {
        "n100_lr0.1_d3": GradientBoostingClassifier(
            n_estimators=100, learning_rate=0.1, max_depth=3, random_state=random_seed,
        ),
        "n200_lr0.05_d3": GradientBoostingClassifier(
            n_estimators=200, learning_rate=0.05, max_depth=3, random_state=random_seed,
        ),
        "n100_lr0.1_d5": GradientBoostingClassifier(
            n_estimators=100, learning_rate=0.1, max_depth=5, random_state=random_seed,
        ),
    }

    # 7. HistGradientBoosting (histogram boosting -> raw features)
    candidates["HistGradientBoosting"] = {
        "lr0.1_iter100_leaves31": HistGradientBoostingClassifier(
            learning_rate=0.1, max_iter=100, max_leaf_nodes=31, class_weight="balanced", random_state=random_seed,
        ),
        "lr0.05_iter200_leaves31": HistGradientBoostingClassifier(
            learning_rate=0.05, max_iter=200, max_leaf_nodes=31, class_weight="balanced", random_state=random_seed,
        ),
        "lr0.1_iter100_leaves63": HistGradientBoostingClassifier(
            learning_rate=0.1, max_iter=100, max_leaf_nodes=63, class_weight="balanced", random_state=random_seed,
        ),
    }

    # Optional packages inspection
    for opt_name in ["XGBoost", "LightGBM", "CatBoost"]:
        optional_status[opt_name] = "NOT AVAILABLE"

    return candidates, optional_status


def run_comprehensive_benchmark(
    df: pd.DataFrame,
    feature_names: List[str],
    random_seed: int = RANDOM_SEED,
) -> BenchmarkResult:
    """Run a comprehensive benchmark across all 7 traditional ML model families.

    Methodology:
      1. Train data only is used to fit models and scalers.
      2. Validation data is used to tune hyperparameters within each family
         and select the winning model family.
         Selection criterion: Recall (primary) -> F1 (secondary) -> ROC-AUC (tertiary).
      3. Test data is evaluated ONLY on the family champions.
         The overall winner's test performance represents the final unbiased evaluation.

    Args:
        df: Feature DataFrame with columns [split, label, *feature_names].
        feature_names: Ordered list of feature column names.
        random_seed: Reproducibility seed.

    Returns:
        BenchmarkResult object with complete evaluation details.
    """
    train_df = df[df["split"] == "train"].reset_index(drop=True)
    val_df   = df[df["split"] == "val"].reset_index(drop=True)
    test_df  = df[df["split"] == "test"].reset_index(drop=True)

    if len(train_df) == 0:
        raise ValueError("Training split is empty.")
    if len(val_df) == 0:
        raise ValueError("Validation split is empty.")
    if len(test_df) == 0:
        raise ValueError("Test split is empty.")

    X_train = train_df[feature_names].to_numpy(dtype=np.float32)
    y_train = train_df["label"].to_numpy(dtype=np.int32)

    X_val   = val_df[feature_names].to_numpy(dtype=np.float32)
    y_val   = val_df["label"].to_numpy(dtype=np.int32)

    X_test  = test_df[feature_names].to_numpy(dtype=np.float32)
    y_test  = test_df["label"].to_numpy(dtype=np.int32)

    for arr_name, arr in [("X_train", X_train), ("X_val", X_val), ("X_test", X_test)]:
        if not np.isfinite(arr).all():
            raise ValueError(f"{arr_name} contains non-finite values.")

    logger.info(
        "Benchmark Dataset: Train=%d (bona=%d, spoof=%d) | Val=%d (bona=%d, spoof=%d) | Test=%d (bona=%d, spoof=%d)",
        len(train_df), int((y_train == 0).sum()), int((y_train == 1).sum()),
        len(val_df),   int((y_val == 0).sum()),   int((y_val == 1).sum()),
        len(test_df),  int((y_test == 0).sum()),  int((y_test == 1).sum()),
    )

    candidates_by_family, optional_status = build_benchmark_candidates(random_seed=random_seed)

    all_candidate_val_metrics: Dict[str, Dict[str, ModelMetrics]] = {}
    family_champions_val: Dict[str, ModelMetrics] = {}
    family_champions_fitted: Dict[str, Any] = {}
    family_best_configs: Dict[str, str] = {}

    # Stage 1: Fit and evaluate all candidates on Validation set
    logger.info("=== STAGE 1: Hyperparameter search & Validation evaluation ===")
    for family_name, configs in candidates_by_family.items():
        all_candidate_val_metrics[family_name] = {}
        best_cfg_name = None
        best_cfg_val_metrics = None
        best_cfg_fitted = None

        for cfg_name, estimator in configs.items():
            full_name = f"{family_name}[{cfg_name}]"
            logger.info("  Training %s ...", full_name)
            t0 = time.perf_counter()
            estimator.fit(X_train, y_train)
            train_time = time.perf_counter() - t0

            # Evaluate on Validation set (selection set)
            val_m = evaluate_model(
                estimator, X_val, y_val,
                model_name=full_name,
                train_time=train_time,
            )
            all_candidate_val_metrics[family_name][cfg_name] = val_m

            # Selection criterion: Recall (primary) -> F1 (secondary) -> ROC-AUC (tertiary)
            def _score_key(m: ModelMetrics):
                auc = m.roc_auc if not np.isnan(m.roc_auc) else -1.0
                return (m.recall, m.f1, auc)

            if best_cfg_val_metrics is None or _score_key(val_m) > _score_key(best_cfg_val_metrics):
                best_cfg_val_metrics = val_m
                best_cfg_name = cfg_name
                best_cfg_fitted = estimator

        family_champions_val[family_name] = ModelMetrics(
            model_name=f"{family_name}[{best_cfg_name}]",
            accuracy=best_cfg_val_metrics.accuracy,
            precision=best_cfg_val_metrics.precision,
            recall=best_cfg_val_metrics.recall,
            f1=best_cfg_val_metrics.f1,
            roc_auc=best_cfg_val_metrics.roc_auc,
            fpr=best_cfg_val_metrics.fpr,
            fnr=best_cfg_val_metrics.fnr,
            tn=best_cfg_val_metrics.tn, fp=best_cfg_val_metrics.fp,
            fn=best_cfg_val_metrics.fn, tp=best_cfg_val_metrics.tp,
            train_time_sec=best_cfg_val_metrics.train_time_sec,
            predict_time_sec=best_cfg_val_metrics.predict_time_sec,
            eer=best_cfg_val_metrics.eer,
            eer_threshold=best_cfg_val_metrics.eer_threshold,
            min_dcf=best_cfg_val_metrics.min_dcf,
        )
        family_champions_fitted[family_name] = best_cfg_fitted
        family_best_configs[family_name] = best_cfg_name
        logger.info(
            "Family '%s' champion: %s (Val Rec=%.4f, F1=%.4f, AUC=%.4f)",
            family_name, best_cfg_name,
            best_cfg_val_metrics.recall, best_cfg_val_metrics.f1, best_cfg_val_metrics.roc_auc,
        )

    # Stage 2: Pick overall best model from family champions using Validation metrics only
    def _family_score_key(fam: str):
        m = family_champions_val[fam]
        auc = m.roc_auc if not np.isnan(m.roc_auc) else -1.0
        return (m.recall, m.f1, auc)

    best_family = max(family_champions_val.keys(), key=_family_score_key)
    best_config_name = family_best_configs[best_family]
    best_model = family_champions_fitted[best_family]
    best_val_metrics = family_champions_val[best_family]

    logger.info(
        "=== OVERALL BEST MODEL BY VALIDATION: %s[%s] (Val Recall=%.4f, Val F1=%.4f, Val ROC-AUC=%.4f) ===",
        best_family, best_config_name,
        best_val_metrics.recall, best_val_metrics.f1, best_val_metrics.roc_auc,
    )

    # Stage 3: Evaluate family champions on untouched Test set
    logger.info("=== STAGE 3: Final evaluation on untouched Test set ===")
    family_champions_test: Dict[str, ModelMetrics] = {}
    for family_name, fitted_est in family_champions_fitted.items():
        cfg_name = family_best_configs[family_name]
        full_name = f"{family_name}[{cfg_name}]"
        test_m = evaluate_model(
            fitted_est, X_test, y_test,
            model_name=full_name,
            train_time=family_champions_val[family_name].train_time_sec,
        )
        family_champions_test[family_name] = test_m

    best_test_metrics = family_champions_test[best_family]

    # Stage 4: KNN computational cost scalability analysis
    knn_m = family_champions_val.get("KNN")
    knn_test_m = family_champions_test.get("KNN")
    knn_predict_time_test = knn_test_m.predict_time_sec if knn_test_m else 0.0
    n_test_samples = len(test_df)
    n_train_samples = len(train_df)
    full_train_target = 380889
    full_test_target = 106551

    per_sample_predict_sec = knn_predict_time_test / max(n_test_samples, 1)
    # KNN exact search scales with O(N_train * N_test)
    extrapolated_full_test_sec = (
        knn_predict_time_test
        * (full_train_target / max(n_train_samples, 1))
        * (full_test_target / max(n_test_samples, 1))
    )
    extrapolated_per_sample_ms = (per_sample_predict_sec * (full_train_target / max(n_train_samples, 1))) * 1000.0

    knn_cost_analysis = {
        "pilot_train_samples": n_train_samples,
        "pilot_test_samples": n_test_samples,
        "pilot_predict_time_sec": round(knn_predict_time_test, 4),
        "pilot_per_sample_predict_ms": round(per_sample_predict_sec * 1000.0, 4),
        "full_dataset_train_samples": full_train_target,
        "full_dataset_test_samples": full_test_target,
        "extrapolated_full_test_sec": round(extrapolated_full_test_sec, 2),
        "extrapolated_full_test_hours": round(extrapolated_full_test_sec / 3600.0, 2),
        "extrapolated_per_sample_latency_ms": round(extrapolated_per_sample_ms, 2),
        "assessment": (
            "EXCESSIVE FOR REAL-TIME DEPLOYMENT"
            if extrapolated_per_sample_ms > 10.0
            else "FEASIBLE"
        ),
    }

    return BenchmarkResult(
        all_candidate_val_metrics=all_candidate_val_metrics,
        family_champions_val=family_champions_val,
        family_champions_test=family_champions_test,
        family_champions_fitted=family_champions_fitted,
        family_best_configs=family_best_configs,
        best_family=best_family,
        best_config_name=best_config_name,
        best_model=best_model,
        best_val_metrics=best_val_metrics,
        best_test_metrics=best_test_metrics,
        knn_cost_analysis=knn_cost_analysis,
        optional_models_status=optional_status,
    )


def save_benchmark_artifacts(
    benchmark_res: BenchmarkResult,
    feature_names: List[str],
    df: pd.DataFrame,
    random_seed: int = RANDOM_SEED,
    output_dir: str | Path = MODEL_DIR,
) -> Dict[str, str]:
    """Persist benchmark results, report, models, and confusion matrices.

    Creates separate benchmark artifacts:
      - traditional_benchmark_results.json
      - traditional_benchmark_report.json
      - traditional_benchmark_confusion_matrices/
      - benchmark_<family>.joblib for each family champion
      - benchmark_best_model.joblib
      - benchmark_best_model_info.json

    Returns:
        Dict of saved artifact paths.
    """
    import datetime
    import matplotlib.pyplot as plt
    import matplotlib

    matplotlib.use("Agg")

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    cm_dir = out / "traditional_benchmark_confusion_matrices"
    cm_dir.mkdir(parents=True, exist_ok=True)

    saved_paths: Dict[str, str] = {}

    # 1. Save family champion models
    for family_name, model in benchmark_res.family_champions_fitted.items():
        safe_name = family_name.lower().replace(" ", "_")
        p = out / f"benchmark_{safe_name}.joblib"
        joblib.dump(model, p, compress=3)
        saved_paths[f"model_{safe_name}"] = str(p)

    # Save overall best model
    best_p = out / "benchmark_best_model.joblib"
    joblib.dump(benchmark_res.best_model, best_p, compress=3)
    saved_paths["benchmark_best_model"] = str(best_p)

    best_info = {
        "best_model_family": benchmark_res.best_family,
        "best_config_name": benchmark_res.best_config_name,
        "best_model_file": "benchmark_best_model.joblib",
        "selected_by": "validation set Recall (primary) -> F1 (secondary) -> ROC-AUC (tertiary)",
        "val_metrics": asdict(benchmark_res.best_val_metrics),
        "test_metrics": asdict(benchmark_res.best_test_metrics),
    }
    best_info_p = out / "benchmark_best_model_info.json"
    best_info_p.write_text(json.dumps(best_info, indent=2), encoding="utf-8")
    saved_paths["benchmark_best_model_info"] = str(best_info_p)

    # 2. Build full results JSON
    train_df = df[df["split"] == "train"]
    val_df   = df[df["split"] == "val"]
    test_df  = df[df["split"] == "test"]

    full_results = {
        "benchmark_title": "SIH104 — Traditional Audio ML Benchmark",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "random_seed": random_seed,
        "dataset_integrity": {
            "total_samples": len(df),
            "train_samples": len(train_df),
            "val_samples": len(val_df),
            "test_samples": len(test_df),
            "class_distribution": {
                "bonafide": int((df["label"] == 0).sum()),
                "spoof": int((df["label"] == 1).sum()),
            },
            "unique_speakers": int(df["speaker_id"].nunique()),
            "train_speakers": int(train_df["speaker_id"].nunique()),
            "val_speakers": int(val_df["speaker_id"].nunique()),
            "test_speakers": int(test_df["speaker_id"].nunique()),
            "feature_dim": len(feature_names),
        },
        "methodology": {
            "model_selection_set": "validation",
            "final_evaluation_set": "test",
            "selection_criterion": "Recall (primary), F1 (secondary), ROC-AUC (tertiary)",
            "scaling_policy": {
                "distance_and_linear_models": "StandardScaler (fitted on train only)",
                "tree_ensembles": "Raw features (unscaled)",
            },
        },
        "optional_models_status": benchmark_res.optional_models_status,
        "hyperparameter_search_validation_results": {
            family: {cfg: asdict(m) for cfg, m in cfgs.items()}
            for family, cfgs in benchmark_res.all_candidate_val_metrics.items()
        },
        "family_champions": {
            family: {
                "best_config": benchmark_res.family_best_configs[family],
                "val_metrics": asdict(benchmark_res.family_champions_val[family]),
                "test_metrics": asdict(benchmark_res.family_champions_test[family]),
            }
            for family in benchmark_res.family_champions_val
        },
        "best_model_by_validation": {
            "family": benchmark_res.best_family,
            "config": benchmark_res.best_config_name,
            "val_recall": benchmark_res.best_val_metrics.recall,
            "val_f1": benchmark_res.best_val_metrics.f1,
            "val_roc_auc": benchmark_res.best_val_metrics.roc_auc,
            "test_recall": benchmark_res.best_test_metrics.recall,
            "test_f1": benchmark_res.best_test_metrics.f1,
            "test_roc_auc": benchmark_res.best_test_metrics.roc_auc,
            "test_eer": benchmark_res.best_test_metrics.eer,
            "test_min_dcf": benchmark_res.best_test_metrics.min_dcf,
        },
        "knn_computational_cost_analysis": benchmark_res.knn_cost_analysis,
    }

    results_p = out / "traditional_benchmark_results.json"
    results_p.write_text(json.dumps(full_results, indent=2), encoding="utf-8")
    saved_paths["benchmark_results"] = str(results_p)

    # 3. Build executive report JSON
    # Evaluate sufficiency:
    # A traditional model is sufficient if test recall >= 0.80 and test FPR <= 0.20 and test ROC-AUC >= 0.85
    test_rec = benchmark_res.best_test_metrics.recall
    test_fpr = benchmark_res.best_test_metrics.fpr
    test_auc = benchmark_res.best_test_metrics.roc_auc
    is_sufficient = (test_rec >= 0.80 and test_fpr <= 0.20 and test_auc >= 0.85)

    report = {
        "title": "SIH104 — Traditional ML Pilot Benchmark Report",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "selected_model": f"{benchmark_res.best_family}[{benchmark_res.best_config_name}]",
        "selection_basis": "Validation set Recall (primary) -> F1 (secondary) -> ROC-AUC (tertiary)",
        "validation_metrics": asdict(benchmark_res.best_val_metrics),
        "final_test_metrics": asdict(benchmark_res.best_test_metrics),
        "confusion_matrix": {
            "TN": benchmark_res.best_test_metrics.tn,
            "FP": benchmark_res.best_test_metrics.fp,
            "FN": benchmark_res.best_test_metrics.fn,
            "TP": benchmark_res.best_test_metrics.tp,
        },
        "traditional_ml_sufficient": "YES" if is_sufficient else "NO",
        "transformer_stage_recommended": "NO" if is_sufficient else "YES",
        "reasoning": (
            f"Best model {benchmark_res.best_family}[{benchmark_res.best_config_name}] achieved "
            f"Test Recall={test_rec:.4f} (FNR={benchmark_res.best_test_metrics.fnr:.4f}), "
            f"FPR={test_fpr:.4f}, ROC-AUC={test_auc:.4f}, EER={benchmark_res.best_test_metrics.eer:.4f}. "
            + (
                "Performance meets preliminary operational criteria for traditional acoustic ML."
                if is_sufficient
                else "FNR or FPR remains high on diverse speech spoofing conditions; acoustic spectral features alone "
                     "leave significant residual false alarms/misses. A deep-learning / self-supervised transformer stage "
                     "(e.g., WavLM / RawNet / SSL frontend) is recommended to capture non-linear temporal vocoder artifacts."
            )
        ),
        "full_dataset_run_status": "NOT YET RUN",
    }
    report_p = out / "traditional_benchmark_report.json"
    report_p.write_text(json.dumps(report, indent=2), encoding="utf-8")
    saved_paths["benchmark_report"] = str(report_p)

    # 4. Generate confusion matrix plots
    test_df_reset = test_df.reset_index(drop=True)
    X_test = test_df_reset[feature_names].to_numpy(dtype=np.float32)
    y_test = test_df_reset["label"].to_numpy(dtype=np.int32)

    # Plot 1: Selected best model confusion matrix
    fig_best, ax_best = plt.subplots(figsize=(5, 4))
    y_pred_best = benchmark_res.best_model.predict(X_test)
    cm_best = confusion_matrix(y_test, y_pred_best)
    ax_best.imshow(cm_best, interpolation="nearest", cmap="Blues")
    ax_best.set_title(
        f"Selected Best Model: {benchmark_res.best_family}[{benchmark_res.best_config_name}]\n"
        f"Test Recall={test_rec:.3f} | F1={benchmark_res.best_test_metrics.f1:.3f} | EER={benchmark_res.best_test_metrics.eer:.3f}",
        fontsize=9,
    )
    ax_best.set_xlabel("Predicted label")
    ax_best.set_ylabel("True label")
    ax_best.set_xticks([0, 1])
    ax_best.set_yticks([0, 1])
    ax_best.set_xticklabels(["bonafide", "spoof"])
    ax_best.set_yticklabels(["bonafide", "spoof"])
    for i in range(cm_best.shape[0]):
        for j in range(cm_best.shape[1]):
            ax_best.text(j, i, str(cm_best[i, j]), ha="center", va="center",
                         color="white" if cm_best[i, j] > cm_best.max() / 2 else "black")
    plt.tight_layout()
    best_cm_p = cm_dir / "confusion_matrix_best_model.png"
    plt.savefig(best_cm_p, bbox_inches="tight", dpi=150)
    plt.close(fig_best)
    saved_paths["confusion_matrix_best"] = str(best_cm_p)

    # Plot 2: All 7 family champions grid
    n_champions = len(benchmark_res.family_champions_fitted)
    fig_all, axes_all = plt.subplots(1, n_champions, figsize=(4.5 * n_champions, 4))
    if n_champions == 1:
        axes_all = [axes_all]

    for ax, (family_name, model) in zip(axes_all, benchmark_res.family_champions_fitted.items()):
        y_pred = model.predict(X_test)
        cm = confusion_matrix(y_test, y_pred)
        t_m = benchmark_res.family_champions_test[family_name]
        is_best = (family_name == benchmark_res.best_family)

        ax.imshow(cm, interpolation="nearest", cmap="Greens" if is_best else "Blues")
        header = f"{'*BEST* ' if is_best else ''}{family_name}"
        ax.set_title(
            f"{header}\nRec={t_m.recall:.3f} | F1={t_m.f1:.3f}\nAUC={t_m.roc_auc:.3f}",
            fontsize=8, fontweight="bold" if is_best else "normal",
        )
        ax.set_xlabel("Predicted")
        ax.set_ylabel("True")
        ax.set_xticks([0, 1])
        ax.set_yticks([0, 1])
        ax.set_xticklabels(["bona", "spoof"], fontsize=8)
        ax.set_yticklabels(["bona", "spoof"], fontsize=8)
        for i in range(cm.shape[0]):
            for j in range(cm.shape[1]):
                ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                        color="white" if cm[i, j] > cm.max() / 2 else "black", fontsize=8)

    plt.suptitle("SIH104 — Traditional ML Benchmark  |  Test-Set Confusion Matrices (7 Models)", fontsize=11, y=1.02)
    plt.tight_layout()
    all_cm_p = cm_dir / "confusion_matrices_all_models.png"
    plt.savefig(all_cm_p, bbox_inches="tight", dpi=150)
    plt.close(fig_all)
    saved_paths["confusion_matrices_all"] = str(all_cm_p)

    logger.info("Saved benchmark artifacts to %s", out)
    return saved_paths
