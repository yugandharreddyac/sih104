"""Phase 2A.2: Frozen CNN Telephony & Channel Robustness Evaluation.

Evaluates the frozen source-disjoint MiniAcousticCNN checkpoint against
6 controlled channel conditions using the 300-sample unseen-generator test set:
  C0: Clean 16 kHz Baseline
  C1: 8 kHz Nyquist Downsampling Round-Trip (16k -> 8k -> 16k)
  C2: G.711 mu-law Telephony Companding (8 kHz, 8-bit, 64 kbps)
  C3: G.711 A-law Telephony Companding (8 kHz, 8-bit, 64 kbps)
  C4: ITU-T G.151 Telephone Bandpass (300 Hz - 3400 Hz)
  C5: Ambient Mobile Noise (15 dB SNR)

Operating threshold is strictly frozen at 0.50.
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
from typing import Any, Callable, Dict, List, Tuple

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
logger = logging.getLogger("phase2a_robustness")

CHECKPOINT_PATH = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_training/best_source_disjoint_mini_acoustic_cnn.pt"
MANIFEST_PATH = PROJECT_ROOT / "ai/neural_prototype/results/unseen_attack_eval_manifest.parquet"
OUTPUT_DIR = PROJECT_ROOT / "ai/neural_prototype/results/phase2a_robustness"
REPORT_JSON = OUTPUT_DIR / "phase2a_robustness_report.json"
REPORT_MD = OUTPUT_DIR / "phase2a_robustness_report.md"

FIXED_THRESHOLD = 0.50
RANDOM_SEED = 42

A_SYSTEMS = [f"A{i:02d}" for i in range(7, 20)]


# ── Transform Definitions ───────────────────────────────────────────────────

# Resamplers
resample_16k_to_8k = torchaudio.transforms.Resample(orig_freq=16000, new_freq=8000)
resample_8k_to_16k = torchaudio.transforms.Resample(orig_freq=8000, new_freq=16000)

# Telephone bandpass filter SOS coefficients (4th-order Butterworth 300–3400 Hz at 16k)
bandpass_sos = scipy.signal.butter(4, [300.0, 3400.0], btype="bandpass", fs=16000, output="sos")


def transform_c0_clean(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    """C0: Clean 16 kHz uncompressed baseline."""
    return audio


def transform_c1_8k_roundtrip(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    """C1: 16 kHz -> 8 kHz -> 16 kHz round-trip resampling."""
    t_in = torch.from_numpy(audio)
    t_8k = resample_16k_to_8k(t_in)
    t_16k = resample_8k_to_16k(t_8k)
    return t_16k.numpy()


def transform_c2_g711_mulaw(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    """C2: 16 kHz -> 8 kHz -> G.711 mu-law -> 16 kHz."""
    t_in = torch.from_numpy(audio)
    t_8k = resample_16k_to_8k(t_in).numpy()

    # Clip to [-1.0, 1.0] and scale to 16-bit PCM for companding
    pcm = np.clip(t_8k, -1.0, 1.0)
    pcm_int = (pcm * 32767.0).astype(np.int16)

    buf = io.BytesIO()
    sf.write(buf, pcm_int, 8000, format="WAV", subtype="ULAW")
    buf.seek(0)
    decoded_8k, _ = sf.read(buf, dtype="float32")

    t_16k = resample_8k_to_16k(torch.from_numpy(decoded_8k))
    return t_16k.numpy()


def transform_c3_g711_alaw(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    """C3: 16 kHz -> 8 kHz -> G.711 A-law -> 16 kHz."""
    t_in = torch.from_numpy(audio)
    t_8k = resample_16k_to_8k(t_in).numpy()

    pcm = np.clip(t_8k, -1.0, 1.0)
    pcm_int = (pcm * 32767.0).astype(np.int16)

    buf = io.BytesIO()
    sf.write(buf, pcm_int, 8000, format="WAV", subtype="ALAW")
    buf.seek(0)
    decoded_8k, _ = sf.read(buf, dtype="float32")

    t_16k = resample_8k_to_16k(torch.from_numpy(decoded_8k))
    return t_16k.numpy()


def transform_c4_bandpass(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    """C4: 300–3400 Hz telephone bandpass filter at 16 kHz."""
    filtered = scipy.signal.sosfilt(bandpass_sos, audio)
    return filtered.astype(np.float32)


def transform_c5_noise_15db(audio: np.ndarray, seed: int = 42) -> np.ndarray:
    """C5: Additive Gaussian noise at exactly 15 dB SNR."""
    rng = np.random.RandomState(seed)
    signal_power = float(np.mean(audio ** 2))
    if signal_power < 1e-12:
        return audio
    # SNR = 10 * log10(P_signal / P_noise) -> P_noise = P_signal / 10^(15/10)
    noise_power = signal_power / (10.0 ** (15.0 / 10.0))
    noise = rng.normal(0.0, np.sqrt(noise_power), size=audio.shape).astype(np.float32)
    noisy = audio + noise
    return noisy.astype(np.float32)


CONDITIONS: List[Tuple[str, str, Callable[[np.ndarray, int], np.ndarray]]] = [
    ("C0", "Clean 16 kHz Baseline", transform_c0_clean),
    ("C1", "8 kHz Round Trip", transform_c1_8k_roundtrip),
    ("C2", "G.711 mu-law (PCMU)", transform_c2_g711_mulaw),
    ("C3", "G.711 A-law (PCMA)", transform_c3_g711_alaw),
    ("C4", "Telephone Bandpass (300-3400 Hz)", transform_c4_bandpass),
    ("C5", "Additive Noise (15 dB SNR)", transform_c5_noise_15db),
]


def run_experiment() -> Dict[str, Any]:
    logger.info("=" * 68)
    logger.info("VOXSHIELD PHASE 2A.2 — TELEPHONY & CHANNEL ROBUSTNESS EXPERIMENT")
    logger.info("=" * 68)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Load manifest and verify invariants
    assert CHECKPOINT_PATH.exists(), f"Checkpoint not found: {CHECKPOINT_PATH}"
    assert MANIFEST_PATH.exists(), f"Manifest not found: {MANIFEST_PATH}"

    df_manifest = pd.read_parquet(MANIFEST_PATH)
    assert len(df_manifest) == 300, f"Expected 300 samples, got {len(df_manifest)}"
    assert (df_manifest["label"] == 0).sum() == 150, "Expected 150 bona-fide"
    assert (df_manifest["label"] == 1).sum() == 150, "Expected 150 spoof"

    logger.info(f"Loaded {len(df_manifest)} evaluation samples from {MANIFEST_PATH.name}")

    # 2. Load model
    device = torch.device("cpu")
    ckpt = torch.load(CHECKPOINT_PATH, map_location=device)
    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    param_count = model.count_parameters()
    logger.info(f"Loaded frozen MiniAcousticCNN (Epoch {ckpt.get('epoch', 15)}, {param_count:,} params)")

    extractor = TwoChannelSpectrogramExtractor(sample_rate=16000, n_bins=60, target_duration_sec=3.0)

    # 3. Preload raw audio waveforms
    logger.info("\nLoading 300 raw audio files into memory...")
    raw_audio_list: List[Tuple[str, np.ndarray, int, str]] = []
    t0 = time.perf_counter()
    for idx in range(len(df_manifest)):
        row = df_manifest.iloc[idx]
        flac_path = row["file_path"]
        label = int(row["label"])
        aid = str(row["audio_id"])
        sys_id = str(row["attack_system"])

        try:
            audio = decode_audio_to_float32(flac_path, target_sr=16000)
        except Exception:
            audio, _ = sf.read(flac_path, dtype="float32")

        raw_audio_list.append((aid, audio, label, sys_id))
    logger.info(f"Loaded 300 audio files in {time.perf_counter() - t0:.2f}s.")

    # 4. Evaluate each condition
    results_by_condition: Dict[str, Dict[str, Any]] = {}
    per_system_by_condition: Dict[str, Dict[str, Dict[str, Any]]] = {}

    for cond_code, cond_name, transform_fn in CONDITIONS:
        logger.info(f"\nEvaluating Condition [{cond_code}] — {cond_name}...")
        all_targets: List[int] = []
        all_scores: List[float] = []
        all_systems: List[str] = []
        latencies_ms: List[float] = []

        t_cond_start = time.perf_counter()
        for i, (aid, raw_audio, label, sys_id) in enumerate(raw_audio_list):
            t_sample_start = time.perf_counter()

            # Transform audio
            transformed_audio = transform_fn(raw_audio, seed=RANDOM_SEED + i)

            # Feature extraction
            wave_tensor = torch.from_numpy(transformed_audio.copy())
            features = extractor.extract(wave_tensor).unsqueeze(0).to(device)

            # Forward pass
            with torch.no_grad():
                logits = model(features)
                prob_spoof = torch.softmax(logits, dim=-1)[0, 1].item()

            sample_dur = (time.perf_counter() - t_sample_start) * 1000.0
            latencies_ms.append(sample_dur)

            all_targets.append(label)
            all_scores.append(prob_spoof)
            all_systems.append(sys_id)

        cond_total_time = time.perf_counter() - t_cond_start
        y_true = np.array(all_targets)
        y_scores = np.array(all_scores)
        y_pred = (y_scores >= FIXED_THRESHOLD).astype(int)

        # Metrics
        acc = float(accuracy_score(y_true, y_pred))
        prec = float(precision_score(y_true, y_pred, zero_division=0))
        rec = float(recall_score(y_true, y_pred, zero_division=0))
        f1 = float(f1_score(y_true, y_pred, zero_division=0))
        auc = float(roc_auc_score(y_true, y_scores))

        cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
        tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])
        fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
        fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0

        # EER (descriptive)
        fpr_curve, tpr_curve, thresh_curve = roc_curve(y_true, y_scores, pos_label=1)
        fnr_curve = 1.0 - tpr_curve
        eer_idx = int(np.nanargmin(np.abs(fpr_curve - fnr_curve)))
        eer = float((fpr_curve[eer_idx] + fnr_curve[eer_idx]) / 2.0)
        eer_thresh = float(thresh_curve[eer_idx])

        # Latencies
        mean_lat = float(np.mean(latencies_ms))
        med_lat = float(np.median(latencies_ms))
        p95_lat = float(np.percentile(latencies_ms, 95))

        logger.info(
            f"  [{cond_code}] Acc: {acc:.4f} | Prec: {prec:.4f} | Rec: {rec:.4f} | "
            f"F1: {f1:.4f} | AUC: {auc:.4f} | FPR: {fpr:.4f} | FNR: {fnr:.4f} | EER: {eer:.4f}"
        )

        results_by_condition[cond_code] = {
            "condition_code": cond_code,
            "condition_name": cond_name,
            "threshold": FIXED_THRESHOLD,
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "roc_auc": round(auc, 4),
            "fpr": round(fpr, 4),
            "fnr": round(fnr, 4),
            "eer": round(eer, 4),
            "eer_threshold": round(eer_thresh, 4),
            "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
            "latency_ms": {
                "mean": round(mean_lat, 2),
                "median": round(med_lat, 2),
                "p95": round(p95_lat, 2),
                "total_wall_sec": round(cond_total_time, 2),
            },
        }

        # Per-attack-system breakdown
        per_sys: Dict[str, Dict[str, Any]] = {}
        for s_id in A_SYSTEMS:
            mask = (y_true == 1) & (np.array(all_systems) == s_id)
            sys_scores = y_scores[mask]
            n_spoof = int(len(sys_scores))
            sys_pred = (sys_scores >= FIXED_THRESHOLD).astype(int)
            sys_tp = int(np.sum(sys_pred == 1))
            sys_fn = int(np.sum(sys_pred == 0))
            sys_recall = float(sys_tp / n_spoof) if n_spoof > 0 else 0.0
            sys_mean_score = float(np.mean(sys_scores)) if n_spoof > 0 else 0.0

            per_sys[s_id] = {
                "spoof_samples": n_spoof,
                "detected_tp": sys_tp,
                "false_negatives_fn": sys_fn,
                "recall": round(sys_recall, 4),
                "mean_spoof_score": round(sys_mean_score, 4),
            }
        per_system_by_condition[cond_code] = per_sys

    # 5. Calculate degradation relative to C0 Clean
    c0 = results_by_condition["C0"]
    degradation_vs_c0: Dict[str, Dict[str, float]] = {}

    for cond_code in ["C1", "C2", "C3", "C4", "C5"]:
        res = results_by_condition[cond_code]
        degradation_vs_c0[cond_code] = {
            "delta_accuracy": round((res["accuracy"] - c0["accuracy"]) * 100.0, 2),
            "delta_precision": round((res["precision"] - c0["precision"]) * 100.0, 2),
            "delta_recall": round((res["recall"] - c0["recall"]) * 100.0, 2),
            "delta_f1": round((res["f1"] - c0["f1"]) * 100.0, 2),
            "delta_roc_auc": round((res["roc_auc"] - c0["roc_auc"]) * 100.0, 2),
            "delta_fpr": round((res["fpr"] - c0["fpr"]) * 100.0, 2),
            "delta_fnr": round((res["fnr"] - c0["fnr"]) * 100.0, 2),
            "delta_eer": round((res["eer"] - c0["eer"]) * 100.0, 2),
        }

    # Identify largest degradations
    worst_rec_cond = min(degradation_vs_c0.keys(), key=lambda k: degradation_vs_c0[k]["delta_recall"])
    worst_f1_cond = min(degradation_vs_c0.keys(), key=lambda k: degradation_vs_c0[k]["delta_f1"])
    worst_auc_cond = min(degradation_vs_c0.keys(), key=lambda k: degradation_vs_c0[k]["delta_roc_auc"])
    worst_eer_cond = max(degradation_vs_c0.keys(), key=lambda k: degradation_vs_c0[k]["delta_eer"])

    # Per-system degradation: average recall drop across C1-C5 vs C0
    c0_per_sys = per_system_by_condition["C0"]
    system_rec_drops: Dict[str, float] = {}
    for s_id in A_SYSTEMS:
        c0_rec = c0_per_sys[s_id]["recall"]
        avg_distorted_rec = np.mean([per_system_by_condition[c][s_id]["recall"] for c in ["C1", "C2", "C3", "C4", "C5"]])
        system_rec_drops[s_id] = round(float(avg_distorted_rec - c0_rec) * 100.0, 2)

    most_affected_systems = sorted(system_rec_drops.items(), key=lambda x: x[1])[:3]

    # 6. Save comprehensive JSON report
    report = {
        "experiment_title": "VOXSHIELD Phase 2A.2 — Frozen CNN Telephony / Channel Robustness Experiment",
        "experiment_metadata": {
            "date": "2026-09-03",
            "environment": {
                "python": sys.version.split()[0],
                "pytorch": torch.__version__,
                "torchaudio": torchaudio.__version__,
                "soundfile": sf.__version__,
                "scipy": scipy.__version__,
                "numpy": np.__version__,
                "platform": platform.platform(),
            },
            "checkpoint_path": str(CHECKPOINT_PATH),
            "checkpoint_status": "STRICTLY FROZEN (No retraining, no threshold tuning)",
            "manifest_path": str(MANIFEST_PATH),
            "total_samples": len(df_manifest),
            "fixed_operating_threshold": FIXED_THRESHOLD,
            "random_seed": RANDOM_SEED,
        },
        "condition_results": results_by_condition,
        "degradation_vs_clean_percentage_points": degradation_vs_c0,
        "per_attack_system_results": per_system_by_condition,
        "summary_of_largest_degradations": {
            "worst_condition_by_recall": f"{worst_rec_cond} ({results_by_condition[worst_rec_cond]['condition_name']}): {degradation_vs_c0[worst_rec_cond]['delta_recall']:+.2f} pp",
            "worst_condition_by_f1": f"{worst_f1_cond} ({results_by_condition[worst_f1_cond]['condition_name']}): {degradation_vs_c0[worst_f1_cond]['delta_f1']:+.2f} pp",
            "worst_condition_by_auc": f"{worst_auc_cond} ({results_by_condition[worst_auc_cond]['condition_name']}): {degradation_vs_c0[worst_auc_cond]['delta_roc_auc']:+.2f} pp",
            "worst_condition_by_eer": f"{worst_eer_cond} ({results_by_condition[worst_eer_cond]['condition_name']}): {degradation_vs_c0[worst_eer_cond]['delta_eer']:+.2f} pp",
            "most_affected_attack_systems": [
                f"{s}: {drop:+.2f} pp average recall change" for s, drop in most_affected_systems
            ],
        },
        "methodological_limitations": [
            "These are controlled synthetic channel transformations, not recordings from real telephone networks.",
            "300 samples is a limited evaluation size.",
            "The underlying samples remain ASVspoof academic data.",
            "This experiment does not establish commercial-cloner robustness.",
            "This experiment does not establish multilingual robustness.",
            "This experiment does not establish robustness to packet loss unless tested.",
            "No threshold was tuned on robustness data; threshold 0.50 was applied frozen.",
        ],
    }

    REPORT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.info(f"Saved JSON report -> {REPORT_JSON}")

    # 7. Save Markdown summary
    md_content = generate_markdown_report(report)
    REPORT_MD.write_text(md_content, encoding="utf-8")
    logger.info(f"Saved Markdown report -> {REPORT_MD}")

    # 8. Print final terminal output
    print("\n" + "=" * 60)
    print("VOXSHIELD — PHASE 2A.2 ROBUSTNESS RESULTS")
    print("=" * 60)
    print("\nCheckpoint:")
    print("  Frozen: YES / Modified: NO")
    print("\nSamples:")
    print(f"  {len(df_manifest)}")
    print("\nThreshold:")
    print(f"  {FIXED_THRESHOLD:.2f}")

    print("\n" + "-" * 60)
    print("CONDITION RESULTS")
    print("-" * 60)
    for c_code, c_name, _ in CONDITIONS:
        r = results_by_condition[c_code]
        print(f"\n{c_code} {c_name}:")
        print(f"  Accuracy:  {r['accuracy']:.4f}")
        print(f"  Precision: {r['precision']:.4f}")
        print(f"  Recall:    {r['recall']:.4f}")
        print(f"  F1:        {r['f1']:.4f}")
        print(f"  AUC:       {r['roc_auc']:.4f}")
        print(f"  FPR:       {r['fpr']:.4f}")
        print(f"  FNR:       {r['fnr']:.4f}")
        print(f"  EER:       {r['eer']:.4f}")

    print("\n" + "-" * 60)
    print("LARGEST DEGRADATIONS")
    print("-" * 60)
    print(f"Worst condition by Recall: {worst_rec_cond} ({results_by_condition[worst_rec_cond]['condition_name']}) -> {degradation_vs_c0[worst_rec_cond]['delta_recall']:+.2f} pp")
    print(f"Worst condition by F1:     {worst_f1_cond} ({results_by_condition[worst_f1_cond]['condition_name']}) -> {degradation_vs_c0[worst_f1_cond]['delta_f1']:+.2f} pp")
    print(f"Worst condition by AUC:    {worst_auc_cond} ({results_by_condition[worst_auc_cond]['condition_name']}) -> {degradation_vs_c0[worst_auc_cond]['delta_roc_auc']:+.2f} pp")
    print(f"Worst condition by EER:    {worst_eer_cond} ({results_by_condition[worst_eer_cond]['condition_name']}) -> {degradation_vs_c0[worst_eer_cond]['delta_eer']:+.2f} pp")
    print("\nMost affected attack systems:")
    for s, drop in most_affected_systems:
        print(f"  {s}: {drop:+.2f} pp average recall drop")

    print("\n" + "-" * 60)
    print("LATENCY")
    print("-" * 60)
    for c_code, _, _ in CONDITIONS:
        lat = results_by_condition[c_code]["latency_ms"]
        print(f"{c_code}: Mean={lat['mean']:.2f} ms, Median={lat['median']:.2f} ms, P95={lat['p95']:.2f} ms")

    print("\n" + "-" * 60)
    print("INTEGRITY")
    print("-" * 60)
    print("Training performed: NO")
    print("Checkpoint modified: NO")
    print("Existing dataset modified: NO")
    print("Existing manifest modified: NO")
    print("Production code modified: NO")
    print("External data downloaded: NO")
    print("\nFiles created:")
    print("  - ai/neural_prototype/results/phase2a_robustness/run_phase2a_robustness.py")
    print("  - ai/neural_prototype/results/phase2a_robustness/phase2a_robustness_report.json")
    print("  - ai/neural_prototype/results/phase2a_robustness/phase2a_robustness_report.md")
    print("Files modified: NONE")
    print("Files deleted: NONE")
    print("\nSTOP.")
    print("Do not retrain or tune the model after obtaining these results.")
    print("=" * 60)

    return report


def generate_markdown_report(rep: Dict[str, Any]) -> str:
    conds = rep["condition_results"]
    deg = rep["degradation_vs_clean_percentage_points"]

    lines = [
        "# VOXSHIELD Phase 2A.2 — Telephony & Channel Robustness Evaluation Report",
        "",
        "## 1. Executive Summary",
        "",
        "Evaluated the frozen source-disjoint `MiniAcousticCNN` (trained on VCC2020+VCC2018, 0 exposure to A07-A19) "
        "across 6 controlled channel and telephony distortion conditions on the 300-sample unseen-generator test set.",
        "Operating threshold was strictly frozen at **0.50** without tuning on corrupted data.",
        "",
        "## 2. Condition-by-Condition Results Table",
        "",
        "| Condition | Accuracy | Precision | Recall | F1 | ROC-AUC | FPR | FNR | EER | Mean Latency |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
    ]

    for c_code, r in conds.items():
        lines.append(
            f"| **{c_code}: {r['condition_name']}** | {r['accuracy']:.4f} | {r['precision']:.4f} | "
            f"{r['recall']:.4f} | {r['f1']:.4f} | {r['roc_auc']:.4f} | {r['fpr']:.4f} | {r['fnr']:.4f} | "
            f"{r['eer']:.4f} | {r['latency_ms']['mean']:.2f} ms |"
        )

    lines.extend([
        "",
        "## 3. Degradation Relative to Clean Baseline (Percentage Points)",
        "",
        "| Distorted Condition | $\\Delta$ Accuracy | $\\Delta$ Precision | $\\Delta$ Recall | $\\Delta$ F1 | $\\Delta$ ROC-AUC | $\\Delta$ FPR | $\\Delta$ FNR | $\\Delta$ EER |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
    ])

    for c_code, d in deg.items():
        c_name = conds[c_code]["condition_name"]
        lines.append(
            f"| **{c_code}: {c_name}** | {d['delta_accuracy']:+.2f} pp | {d['delta_precision']:+.2f} pp | "
            f"{d['delta_recall']:+.2f} pp | {d['delta_f1']:+.2f} pp | {d['delta_roc_auc']:+.2f} pp | "
            f"{d['delta_fpr']:+.2f} pp | {d['delta_fnr']:+.2f} pp | {d['delta_eer']:+.2f} pp |"
        )

    lines.extend([
        "",
        "## 4. Key Scientific Findings",
        "",
        "1. **Nyquist Frequency Cutoff Impact:** 8 kHz downsampling (C1) and bandpass filtering (C4) remove upper-band vocoder harmonics (>4 kHz). This alters the high-frequency LFCC/Mel bins.",
        "2. **G.711 Telephony Quantization:** Companding under mu-law (C2) and A-law (C3) introduces non-linear quantization noise on top of 8 kHz bandlimiting.",
        "3. **Additive Background Noise (C5):** White Gaussian noise at 15 dB SNR alters low-energy spectral frames.",
        "",
        "## 5. Methodological Limitations",
        "",
        "- Synthetic channel transformations rather than in-the-wild telephony carrier captures.",
        "- Evaluation size is 300 samples.",
        "- The underlying samples remain ASVspoof academic data.",
        "- Commercial zero-shot cloners and Indian language audio are not yet evaluated.",
        "- Zero threshold calibration was performed on the corrupted data.",
    ])

    return "\n".join(lines)


if __name__ == "__main__":
    run_experiment()
