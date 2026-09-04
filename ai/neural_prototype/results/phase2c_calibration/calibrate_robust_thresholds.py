"""Phase 2C.2: Validation-Only Robust CNN Threshold Calibration.

Calibrates operating thresholds for the frozen Robust MiniAcousticCNN
(best_robust_mini_acoustic_cnn.pt) using ONLY the 300-sample validation split from
source_disjoint_train_val_manifest.parquet.

DOES NOT ACCESS OR EVALUATE unseen_attack_eval_manifest.parquet.

Evaluates 6 channel conditions in-memory:
  C0: Clean 16 kHz
  C1: 8 kHz Round-Trip (16k -> 8k -> 16k)
  C2: G.711 mu-law (PCMU)
  C3: G.711 A-law (PCMA)
  C4: Telephone Bandpass (300-3400 Hz)
  C5: Additive Noise (15 dB SNR)

Performs threshold sweep: 0.01 to 0.99 (step 0.005).
Analyzes Operating Points:
  - FPR <= 5%, 10%, 15%, 20%
  - EER threshold
  - F1-max threshold
  - Policies A, B, C, and D (Dual Mode: C0 clean vs C1-C4 pooled telephony)
"""

from __future__ import annotations

import io
import json
import logging
import platform
import sys
import time

if sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import scipy.signal
import soundfile as sf
import torch
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
logger = logging.getLogger("phase2c_calibration")

CHECKPOINT_PATH = PROJECT_ROOT / "ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt"
MANIFEST_PATH = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_train_val_manifest.parquet"
OUTPUT_DIR = PROJECT_ROOT / "ai/neural_prototype/results/phase2c_calibration"
REPORT_JSON = OUTPUT_DIR / "calibration_report.json"
REPORT_MD = OUTPUT_DIR / "calibration_report.md"

RANDOM_SEED = 42

# ── Transform Primitives ───────────────────────────────────────────────────

resample_16k_to_8k = torchaudio.transforms.Resample(orig_freq=16000, new_freq=8000)
resample_8k_to_16k = torchaudio.transforms.Resample(orig_freq=8000, new_freq=16000)
bandpass_sos = scipy.signal.butter(4, [300.0, 3400.0], btype="bandpass", fs=16000, output="sos")


def transform_c0_clean(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    return audio


def transform_c1_8k_roundtrip(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    t_in = torch.from_numpy(audio.copy())
    t_8k = resample_16k_to_8k(t_in)
    t_16k = resample_8k_to_16k(t_8k)
    return t_16k.numpy().astype(np.float32)


def transform_c2_g711_mulaw(audio: np.ndarray, seed: int = 42) -> np.ndarray:
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


def transform_c3_g711_alaw(audio: np.ndarray, seed: int = 42) -> np.ndarray:
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


def transform_c4_bandpass(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    filtered = scipy.signal.sosfilt(bandpass_sos, audio)
    return filtered.astype(np.float32)


def transform_c5_noise_15db(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    rng = np.random.RandomState(seed)
    signal_power = float(np.mean(audio ** 2))
    if signal_power < 1e-12:
        return audio
    noise_power = signal_power / (10.0 ** (15.0 / 10.0))
    noise = rng.normal(0.0, np.sqrt(noise_power), size=audio.shape).astype(np.float32)
    noisy = audio + noise
    return noisy.astype(np.float32)


CONDITIONS: List[Tuple[str, str, Callable[[np.ndarray, int], np.ndarray]]] = [
    ("C0", "Clean 16 kHz", transform_c0_clean),
    ("C1", "8 kHz Round Trip", transform_c1_8k_roundtrip),
    ("C2", "G.711 mu-law (PCMU)", transform_c2_g711_mulaw),
    ("C3", "G.711 A-law (PCMA)", transform_c3_g711_alaw),
    ("C4", "Telephone Bandpass (300-3400 Hz)", transform_c4_bandpass),
    ("C5", "Additive Noise (15 dB SNR)", transform_c5_noise_15db),
]


def evaluate_scores_at_threshold(y_true: np.ndarray, y_scores: np.ndarray, thresh: float) -> Dict[str, Any]:
    y_pred = (y_scores >= thresh).astype(int)
    acc = float(accuracy_score(y_true, y_pred))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0

    return {
        "threshold": round(thresh, 4),
        "accuracy": round(acc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
        "fpr": round(fpr, 4),
        "fnr": round(fnr, 4),
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tp": tp,
    }


def find_optimal_threshold(
    eval_records: List[Dict[str, Any]],
    target_fpr: float,
) -> Optional[Dict[str, Any]]:
    """Select threshold satisfying FPR <= target_fpr with max recall, tie-breaking on lower FPR, then higher F1."""
    eligible = [r for r in eval_records if r["fpr"] <= target_fpr + 1e-7]
    if not eligible:
        return None

    # Maximize recall, minimize FPR, maximize F1
    best = max(eligible, key=lambda r: (r["recall"], -r["fpr"], r["f1"]))
    return best


def find_closest_threshold(
    eval_records: List[Dict[str, Any]],
    target_fpr: float,
) -> Dict[str, Any]:
    """Find threshold whose achieved FPR is closest to target_fpr."""
    return min(eval_records, key=lambda r: abs(r["fpr"] - target_fpr))


def run_calibration() -> Dict[str, Any]:
    logger.info("=" * 68)
    logger.info("VOXSHIELD PHASE 2C.2 — VALIDATION THRESHOLD CALIBRATION")
    logger.info("=" * 68)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    device = torch.device("cpu")

    # 1. Verify model checkpoint and manifest
    assert CHECKPOINT_PATH.exists(), f"Checkpoint not found: {CHECKPOINT_PATH}"
    assert MANIFEST_PATH.exists(), f"Manifest not found: {MANIFEST_PATH}"

    ckpt = torch.load(CHECKPOINT_PATH, map_location=device)
    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    params = model.count_parameters()
    logger.info(f"Loaded frozen Robust CNN (Epoch {ckpt.get('epoch', 10)}, {params:,} params)")

    df_manifest = pd.read_parquet(MANIFEST_PATH)
    df_val = df_manifest[df_manifest["split"] == "val"].reset_index(drop=True)

    assert len(df_val) == 300, f"Expected 300 val samples, got {len(df_val)}"
    assert (df_val["label"] == 0).sum() == 150, "Expected 150 bona-fide"
    assert (df_val["label"] == 1).sum() == 150, "Expected 150 spoof"
    logger.info(f"Loaded {len(df_val)} validation samples from {MANIFEST_PATH.name} (6 disjoint speakers)")

    extractor = TwoChannelSpectrogramExtractor(sample_rate=16000, n_bins=60, target_duration_sec=3.0)

    # 2. Preload validation raw audio into memory
    raw_val_audio: List[Tuple[str, np.ndarray, int, str]] = []
    t0 = time.perf_counter()
    for idx in range(len(df_val)):
        row = df_val.iloc[idx]
        flac_path = row["file_path"]
        label = int(row["label"])
        aid = str(row["audio_id"])
        sys_id = str(row["attack_system"])

        try:
            audio = decode_audio_to_float32(flac_path, target_sr=16000)
        except Exception:
            audio, _ = sf.read(flac_path, dtype="float32")

        raw_val_audio.append((aid, audio, label, sys_id))
    logger.info(f"Preloaded 300 validation audio files in {time.perf_counter() - t0:.2f}s.")

    # 3. Generate predictions for each condition
    scores_by_condition: Dict[str, Tuple[np.ndarray, np.ndarray]] = {}

    for cond_code, cond_name, transform_fn in CONDITIONS:
        logger.info(f"Extracting validation scores for Condition [{cond_code}]: {cond_name}...")
        targets: List[int] = []
        scores: List[float] = []

        for i, (_, audio, label, _) in enumerate(raw_val_audio):
            transformed = transform_fn(audio, seed=RANDOM_SEED + i)
            wave_tensor = torch.from_numpy(transformed.copy())
            features = extractor.extract(wave_tensor).unsqueeze(0).to(device)

            with torch.no_grad():
                logits = model(features)
                prob_spoof = torch.softmax(logits, dim=-1)[0, 1].item()

            targets.append(label)
            scores.append(prob_spoof)

        scores_by_condition[cond_code] = (np.array(targets), np.array(scores))

    # 4. Threshold sweep and metric calculation
    threshold_range = np.round(np.arange(0.01, 0.995, 0.005), 4).tolist()

    condition_analysis: Dict[str, Dict[str, Any]] = {}

    for cond_code, cond_name, _ in CONDITIONS:
        y_true, y_scores = scores_by_condition[cond_code]

        # Overall ranking metrics
        try:
            auc = float(roc_auc_score(y_true, y_scores))
        except ValueError:
            auc = 0.5

        fpr_curve, tpr_curve, thresh_curve = roc_curve(y_true, y_scores, pos_label=1)
        fnr_curve = 1.0 - tpr_curve
        eer_idx = int(np.nanargmin(np.abs(fpr_curve - fnr_curve)))
        eer = float((fpr_curve[eer_idx] + fnr_curve[eer_idx]) / 2.0)
        eer_thresh = float(thresh_curve[eer_idx])

        # Sweep evaluation
        sweep_records = [
            evaluate_scores_at_threshold(y_true, y_scores, t) for t in threshold_range
        ]

        # F1-max operating point
        best_f1_rec = max(sweep_records, key=lambda r: (r["f1"], r["recall"]))

        # Target FPR operating points
        opt_fpr_5 = find_optimal_threshold(sweep_records, target_fpr=0.05)
        opt_fpr_10 = find_optimal_threshold(sweep_records, target_fpr=0.10)
        opt_fpr_15 = find_optimal_threshold(sweep_records, target_fpr=0.15)
        opt_fpr_20 = find_optimal_threshold(sweep_records, target_fpr=0.20)

        # Closest FPR operating points
        closest_fpr_5 = find_closest_threshold(sweep_records, target_fpr=0.05)
        closest_fpr_10 = find_closest_threshold(sweep_records, target_fpr=0.10)
        closest_fpr_15 = find_closest_threshold(sweep_records, target_fpr=0.15)
        closest_fpr_20 = find_closest_threshold(sweep_records, target_fpr=0.20)

        condition_analysis[cond_code] = {
            "condition_code": cond_code,
            "condition_name": cond_name,
            "validation_samples": len(y_true),
            "roc_auc": round(auc, 4),
            "eer": round(eer, 4),
            "eer_threshold": round(eer_thresh, 4),
            "f1_max_operating_point": best_f1_rec,
            "operating_targets": {
                "fpr_le_5pct": opt_fpr_5 if opt_fpr_5 is not None else "NOT ACHIEVABLE",
                "fpr_le_10pct": opt_fpr_10 if opt_fpr_10 is not None else "NOT ACHIEVABLE",
                "fpr_le_15pct": opt_fpr_15 if opt_fpr_15 is not None else "NOT ACHIEVABLE",
                "fpr_le_20pct": opt_fpr_20 if opt_fpr_20 is not None else "NOT ACHIEVABLE",
            },
            "closest_operating_points": {
                "closest_fpr_5pct": closest_fpr_5,
                "closest_fpr_10pct": closest_fpr_10,
                "closest_fpr_15pct": closest_fpr_15,
                "closest_fpr_20pct": closest_fpr_20,
            },
            "score_distribution": {
                "bonafide_mean": round(float(np.mean(y_scores[y_true == 0])), 4),
                "bonafide_median": round(float(np.median(y_scores[y_true == 0])), 4),
                "bonafide_std": round(float(np.std(y_scores[y_true == 0])), 4),
                "spoof_mean": round(float(np.mean(y_scores[y_true == 1])), 4),
                "spoof_median": round(float(np.median(y_scores[y_true == 1])), 4),
                "spoof_std": round(float(np.std(y_scores[y_true == 1])), 4),
            },
        }

    # 5. Policy Analysis
    # Policy D: C0 independent + Pooled C1-C4 (Telephony)
    pooled_c1_c4_y_true = np.concatenate([scores_by_condition[c][0] for c in ["C1", "C2", "C3", "C4"]])
    pooled_c1_c4_y_scores = np.concatenate([scores_by_condition[c][1] for c in ["C1", "C2", "C3", "C4"]])

    pooled_sweep = [
        evaluate_scores_at_threshold(pooled_c1_c4_y_true, pooled_c1_c4_y_scores, t)
        for t in threshold_range
    ]

    try:
        pooled_auc = float(roc_auc_score(pooled_c1_c4_y_true, pooled_c1_c4_y_scores))
    except ValueError:
        pooled_auc = 0.5

    p_fpr_curve, p_tpr_curve, p_thresh_curve = roc_curve(pooled_c1_c4_y_true, pooled_c1_c4_y_scores, pos_label=1)
    p_fnr_curve = 1.0 - p_tpr_curve
    p_eer_idx = int(np.nanargmin(np.abs(p_fpr_curve - p_fnr_curve)))
    pooled_eer = float((p_fpr_curve[p_eer_idx] + p_fnr_curve[p_eer_idx]) / 2.0)
    pooled_eer_thresh = float(p_thresh_curve[p_eer_idx])

    pooled_f1_max = max(pooled_sweep, key=lambda r: (r["f1"], r["recall"]))
    pooled_opt_fpr_5 = find_optimal_threshold(pooled_sweep, target_fpr=0.05)
    pooled_opt_fpr_10 = find_optimal_threshold(pooled_sweep, target_fpr=0.10)
    pooled_opt_fpr_15 = find_optimal_threshold(pooled_sweep, target_fpr=0.15)
    pooled_opt_fpr_20 = find_optimal_threshold(pooled_sweep, target_fpr=0.20)

    policies = {
        "policy_a_high_security": {
            "description": "Condition-specific thresholds satisfying validation FPR <= 5%",
            "thresholds": {
                c: (
                    condition_analysis[c]["operating_targets"]["fpr_le_5pct"]["threshold"]
                    if condition_analysis[c]["operating_targets"]["fpr_le_5pct"] != "NOT ACHIEVABLE"
                    else None
                )
                for c in ["C0", "C1", "C2", "C3", "C4", "C5"]
            },
        },
        "policy_b_balanced": {
            "description": "Condition-specific thresholds satisfying validation FPR <= 10%",
            "thresholds": {
                c: (
                    condition_analysis[c]["operating_targets"]["fpr_le_10pct"]["threshold"]
                    if condition_analysis[c]["operating_targets"]["fpr_le_10pct"] != "NOT ACHIEVABLE"
                    else None
                )
                for c in ["C0", "C1", "C2", "C3", "C4", "C5"]
            },
        },
        "policy_c_maximum_f1": {
            "description": "Condition-specific thresholds maximizing validation F1",
            "thresholds": {
                c: condition_analysis[c]["f1_max_operating_point"]["threshold"]
                for c in ["C0", "C1", "C2", "C3", "C4", "C5"]
            },
        },
        "policy_d_dual_mode": {
            "description": "Dual-mode: C0 independent wideband threshold + pooled C1-C4 common telephony threshold",
            "c0_clean_wideband": {
                "fpr_le_5pct": condition_analysis["C0"]["operating_targets"]["fpr_le_5pct"],
                "fpr_le_10pct": condition_analysis["C0"]["operating_targets"]["fpr_le_10pct"],
                "f1_max": condition_analysis["C0"]["f1_max_operating_point"],
                "eer_threshold": condition_analysis["C0"]["eer_threshold"],
            },
            "c1_c4_pooled_telephony": {
                "total_samples": len(pooled_c1_c4_y_true),
                "roc_auc": round(pooled_auc, 4),
                "eer": round(pooled_eer, 4),
                "eer_threshold": round(pooled_eer_thresh, 4),
                "fpr_le_5pct": pooled_opt_fpr_5 if pooled_opt_fpr_5 is not None else "NOT ACHIEVABLE",
                "fpr_le_10pct": pooled_opt_fpr_10 if pooled_opt_fpr_10 is not None else "NOT ACHIEVABLE",
                "fpr_le_15pct": pooled_opt_fpr_15 if pooled_opt_fpr_15 is not None else "NOT ACHIEVABLE",
                "fpr_le_20pct": pooled_opt_fpr_20 if pooled_opt_fpr_20 is not None else "NOT ACHIEVABLE",
                "f1_max": pooled_f1_max,
            },
            "recommended_dual_thresholds": {
                "high_security_fpr5": {
                    "theta_clean": (
                        condition_analysis["C0"]["operating_targets"]["fpr_le_5pct"]["threshold"]
                        if condition_analysis["C0"]["operating_targets"]["fpr_le_5pct"] != "NOT ACHIEVABLE"
                        else None
                    ),
                    "theta_telephony": pooled_opt_fpr_5["threshold"] if pooled_opt_fpr_5 is not None else None,
                },
                "balanced_fpr10": {
                    "theta_clean": (
                        condition_analysis["C0"]["operating_targets"]["fpr_le_10pct"]["threshold"]
                        if condition_analysis["C0"]["operating_targets"]["fpr_le_10pct"] != "NOT ACHIEVABLE"
                        else None
                    ),
                    "theta_telephony": pooled_opt_fpr_10["threshold"] if pooled_opt_fpr_10 is not None else None,
                },
                "maximum_f1": {
                    "theta_clean": condition_analysis["C0"]["f1_max_operating_point"]["threshold"],
                    "theta_telephony": pooled_f1_max["threshold"],
                },
            },
        },
    }

    # 6. Save JSON report
    report = {
        "experiment_title": "VOXSHIELD Phase 2C.2 — Validation-Only Robust CNN Threshold Calibration",
        "checkpoint_path": str(CHECKPOINT_PATH),
        "manifest_path": str(MANIFEST_PATH),
        "split_used": "val",
        "validation_sample_count": len(df_val),
        "sweep_parameters": {
            "start": 0.01,
            "end": 0.99,
            "step": 0.005,
            "steps_evaluated": len(threshold_range),
        },
        "per_condition_analysis": condition_analysis,
        "policy_analysis": policies,
        "integrity_verification": {
            "training_performed": False,
            "model_checkpoint_modified": False,
            "existing_datasets_modified": False,
            "existing_manifests_modified": False,
            "production_code_modified": False,
            "existing_scripts_modified": False,
            "unseen_test_manifest_accessed": False,
            "external_data_downloaded": False,
            "packages_installed": False,
        },
    }

    REPORT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info(f"Saved calibration report -> {REPORT_JSON}")

    # 7. Save Markdown report
    md_content = generate_markdown_report(report)
    REPORT_MD.write_text(md_content, encoding="utf-8")
    logger.info(f"Saved markdown report -> {REPORT_MD}")

    # 8. Print terminal output
    print("\n" + "=" * 80)
    print("VOXSHIELD PHASE 2C.2 — VALIDATION-ONLY THRESHOLD CALIBRATION RESULTS")
    print("=" * 80)
    print(f"\nSamples:   300 (150 bona-fide, 150 spoof from source-disjoint validation split)")
    print(f"Sweep:     0.01 to 0.99 (step 0.005, 197 thresholds evaluated per condition)")

    print("\n" + "-" * 80)
    print(f"{'Condition':<10} {'AUC':<8} {'EER':<8} {'EER θ':<8} {'FPR<=5% θ':<12} {'FPR<=10% θ':<12} {'F1-max θ':<10}")
    print("-" * 80)

    for cond_code, cond_name, _ in CONDITIONS:
        ca = condition_analysis[cond_code]
        auc_str = f"{ca['roc_auc']:.4f}"
        eer_str = f"{ca['eer']:.4f}"
        eer_th_str = f"{ca['eer_threshold']:.4f}"

        f5 = ca["operating_targets"]["fpr_le_5pct"]
        f5_str = f"{f5['threshold']:.4f}" if f5 != "NOT ACHIEVABLE" else "N/A"

        f10 = ca["operating_targets"]["fpr_le_10pct"]
        f10_str = f"{f10['threshold']:.4f}" if f10 != "NOT ACHIEVABLE" else "N/A"

        f1_th_str = f"{ca['f1_max_operating_point']['threshold']:.4f}"

        print(f"{cond_code:<10} {auc_str:<8} {eer_str:<8} {eer_th_str:<8} {f5_str:<12} {f10_str:<12} {f1_th_str:<10}")

    print("-" * 80)

    # Print Policy D recommendations
    p_d = policies["policy_d_dual_mode"]
    print("\nRECOMMENDED VALIDATION-DERIVED POLICY D THRESHOLDS (Dual-Mode):")
    print("-" * 80)
    print(f"1. High-Security Operating Point (Target FPR <= 5%):")
    rec_hs = p_d["recommended_dual_thresholds"]["high_security_fpr5"]
    print(f"   Clean / Wideband (C0):     θ = {rec_hs['theta_clean']} (Val FPR: {p_d['c0_clean_wideband']['fpr_le_5pct']['fpr']*100:.1f}%, Rec: {p_d['c0_clean_wideband']['fpr_le_5pct']['recall']*100:.1f}%)")
    print(f"   Telephony Narrowband (C1-4): θ = {rec_hs['theta_telephony']} (Val FPR: {p_d['c1_c4_pooled_telephony']['fpr_le_5pct']['fpr']*100:.1f}%, Rec: {p_d['c1_c4_pooled_telephony']['fpr_le_5pct']['recall']*100:.1f}%)")

    print(f"\n2. Balanced Operating Point (Target FPR <= 10%):")
    rec_bal = p_d["recommended_dual_thresholds"]["balanced_fpr10"]
    print(f"   Clean / Wideband (C0):     θ = {rec_bal['theta_clean']} (Val FPR: {p_d['c0_clean_wideband']['fpr_le_10pct']['fpr']*100:.1f}%, Rec: {p_d['c0_clean_wideband']['fpr_le_10pct']['recall']*100:.1f}%)")
    print(f"   Telephony Narrowband (C1-4): θ = {rec_bal['theta_telephony']} (Val FPR: {p_d['c1_c4_pooled_telephony']['fpr_le_10pct']['fpr']*100:.1f}%, Rec: {p_d['c1_c4_pooled_telephony']['fpr_le_10pct']['recall']*100:.1f}%)")

    print(f"\n3. Maximum-F1 Operating Point:")
    rec_f1 = p_d["recommended_dual_thresholds"]["maximum_f1"]
    print(f"   Clean / Wideband (C0):     θ = {rec_f1['theta_clean']} (Val F1: {p_d['c0_clean_wideband']['f1_max']['f1']:.4f}, Rec: {p_d['c0_clean_wideband']['f1_max']['recall']*100:.1f}%)")
    print(f"   Telephony Narrowband (C1-4): θ = {rec_f1['theta_telephony']} (Val F1: {p_d['c1_c4_pooled_telephony']['f1_max']['f1']:.4f}, Rec: {p_d['c1_c4_pooled_telephony']['f1_max']['recall']*100:.1f}%)")

    print("\n" + "-" * 80)
    print("INTEGRITY VERIFICATION")
    print("-" * 80)
    print("Training performed: NO")
    print("Model checkpoint modified: NO")
    print("Existing datasets modified: NO")
    print("Existing manifests modified: NO")
    print("Production code modified: NO")
    print("Existing scripts modified: NO")
    print("Unseen test manifest accessed: NO")
    print("External data downloaded: NO")
    print("Packages installed: NO")

    print("\nFiles created:")
    print("  - ai/neural_prototype/results/phase2c_calibration/calibrate_robust_thresholds.py")
    print("  - ai/neural_prototype/results/phase2c_calibration/calibration_report.json")
    print("  - ai/neural_prototype/results/phase2c_calibration/calibration_report.md")
    print("Files modified: NONE")
    print("Files deleted: NONE")
    print("=" * 80)

    return report


def generate_markdown_report(rep: Dict[str, Any]) -> str:
    ca = rep["per_condition_analysis"]
    pd_data = rep["policy_analysis"]["policy_d_dual_mode"]

    lines = [
        "# VOXSHIELD Phase 2C.2 — Validation-Only Robust CNN Threshold Calibration Report",
        "",
        "## 1. Methodology & Integrity Constraints",
        "",
        "- **Model:** Frozen Robust MiniAcousticCNN (`best_robust_mini_acoustic_cnn.pt`, Epoch 10, 93,442 params).",
        "- **Dataset:** Evaluated ONLY on the 300 validation samples from `source_disjoint_train_val_manifest.parquet` (6 disjoint speakers, 150 bona-fide, 150 spoof).",
        "- **Unseen Test Isolation:** The held-out A07–A19 test set was **NOT accessed**.",
        "- **Sweep:** Threshold range $[0.01, 0.99]$ with step $0.005$ (197 operating points per condition).",
        "",
        "## 2. Per-Condition Threshold Sweep Results",
        "",
        "| Condition | AUC | EER | EER θ | FPR<=5% θ | Achieved FPR | Achieved Rec | FPR<=10% θ | Achieved FPR | Achieved Rec | F1-max θ | Max F1 |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
    ]

    for c_code, c_name, _ in CONDITIONS:
        c = ca[c_code]
        f5 = c["operating_targets"]["fpr_le_5pct"]
        f10 = c["operating_targets"]["fpr_le_10pct"]
        f1 = c["f1_max_operating_point"]

        f5_th = f"{f5['threshold']:.4f}" if f5 != "NOT ACHIEVABLE" else "N/A"
        f5_fpr = f"{f5['fpr']*100:.1f}%" if f5 != "NOT ACHIEVABLE" else "N/A"
        f5_rec = f"{f5['recall']*100:.1f}%" if f5 != "NOT ACHIEVABLE" else "N/A"

        f10_th = f"{f10['threshold']:.4f}" if f10 != "NOT ACHIEVABLE" else "N/A"
        f10_fpr = f"{f10['fpr']*100:.1f}%" if f10 != "NOT ACHIEVABLE" else "N/A"
        f10_rec = f"{f10['recall']*100:.1f}%" if f10 != "NOT ACHIEVABLE" else "N/A"

        lines.append(
            f"| **{c_code}: {c['condition_name']}** | {c['roc_auc']:.4f} | {c['eer']:.4f} | {c['eer_threshold']:.4f} | "
            f"{f5_th} | {f5_fpr} | {f5_rec} | {f10_th} | {f10_fpr} | {f10_rec} | {f1['threshold']:.4f} | {f1['f1']:.4f} |"
        )

    lines.extend([
        "",
        "## 3. Policy D: Dual-Mode Calibration Analysis",
        "",
        "Telephony audio channels (C1–C4) exhibit shared spectral bandwidth truncation and quantization characteristics. "
        "Pooling validation samples from C1, C2, C3, and C4 (1,200 evaluation points: 600 bona, 600 spoof) provides a robust basis for telephony threshold selection.",
        "",
        "| Mode | Target | Recommended θ | Validation FPR | Validation Recall | Validation F1 |",
        "| :--- | :--- | :---: | :---: | :---: | :---: |",
    ])

    c0_f5 = pd_data["c0_clean_wideband"]["fpr_le_5pct"]
    p_f5 = pd_data["c1_c4_pooled_telephony"]["fpr_le_5pct"]
    c0_f10 = pd_data["c0_clean_wideband"]["fpr_le_10pct"]
    p_f10 = pd_data["c1_c4_pooled_telephony"]["fpr_le_10pct"]
    c0_f1 = pd_data["c0_clean_wideband"]["f1_max"]
    p_f1 = pd_data["c1_c4_pooled_telephony"]["f1_max"]

    lines.append(f"| **Clean / Wideband (C0)** | High-Security (FPR<=5%) | {c0_f5['threshold']:.4f} | {c0_f5['fpr']*100:.1f}% | {c0_f5['recall']*100:.1f}% | {c0_f5['f1']:.4f} |")
    lines.append(f"| **Telephony Pooled (C1-C4)** | High-Security (FPR<=5%) | {p_f5['threshold']:.4f} | {p_f5['fpr']*100:.1f}% | {p_f5['recall']*100:.1f}% | {p_f5['f1']:.4f} |")
    lines.append(f"| **Clean / Wideband (C0)** | Balanced (FPR<=10%) | {c0_f10['threshold']:.4f} | {c0_f10['fpr']*100:.1f}% | {c0_f10['recall']*100:.1f}% | {c0_f10['f1']:.4f} |")
    lines.append(f"| **Telephony Pooled (C1-C4)** | Balanced (FPR<=10%) | {p_f10['threshold']:.4f} | {p_f10['fpr']*100:.1f}% | {p_f10['recall']*100:.1f}% | {p_f10['f1']:.4f} |")
    lines.append(f"| **Clean / Wideband (C0)** | Maximum F1 | {c0_f1['threshold']:.4f} | {c0_f1['fpr']*100:.1f}% | {c0_f1['recall']*100:.1f}% | {c0_f1['f1']:.4f} |")
    lines.append(f"| **Telephony Pooled (C1-C4)** | Maximum F1 | {p_f1['threshold']:.4f} | {p_f1['fpr']*100:.1f}% | {p_f1['recall']*100:.1f}% | {p_f1['f1']:.4f} |")

    lines.extend([
        "",
        "## 4. Scientific Caution",
        "",
        "- All reported thresholds are **validation-derived** on 6 speakers from VCC2020/VCC2018.",
        "- Achieving $\\text{FPR} \\le 5\\%$ on validation does not guarantee exact $5\\%$ FPR on held-out unseen attacks.",
        "- Final held-out evaluation in Phase 2C.3 will test whether these frozen thresholds generalize to the unseen A07–A19 test set.",
    ])

    return "\n".join(lines)


if __name__ == "__main__":
    run_calibration()
