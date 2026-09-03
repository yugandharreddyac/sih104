"""
Phase 7 — Deepfake Detector Evaluation Script
Evaluates the SIH104 deepfake detector against a labeled audio dataset.

Usage:
    python evaluation/evaluate_deepfake.py \\
        --manifest datasets/dataset_manifest.csv \\
        --split test \\
        --output evaluation/results/deepfake_eval_results.json

Dataset Requirements:
    - ASVspoof 2021 DF evaluation set (or equivalent)
    - Manifest CSV with columns: file_path, label (bona_fide/spoof), split
    
Output:
    - Per-file predictions CSV
    - EER (Equal Error Rate)
    - AUC (Area Under ROC Curve)
    - FPR @ target FNR (0.1%, 1%, 5%)
    - FNR @ target FPR (0.1%, 1%, 5%)
    - Detection Error Tradeoff (DET) curve data

NOTE:
    This script will produce ACTUAL measured metrics from the labeled dataset.
    If no dataset is available (0 records in manifest), it will report NOT_AVAILABLE.
    It NEVER fabricates metrics.
"""
import sys
import os
import json
import time
import argparse
import csv
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# Support running from repo root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import onnxruntime as ort
except ImportError:
    print("ERROR: onnxruntime not installed. Run: pip install onnxruntime")
    sys.exit(1)

try:
    from scipy.special import softmax
    from scipy.interpolate import interp1d
except ImportError:
    print("ERROR: scipy not installed. Run: pip install scipy")
    sys.exit(1)


DEEPFAKE_MODEL_PATH = "ai/models/deepfake/deepfake_detector.onnx"
SAMPLE_RATE = 16000
MIN_SAMPLES = 4800  # 300 ms minimum


def load_manifest(manifest_path: str, split: Optional[str] = None) -> List[Dict]:
    """Load manifest CSV and optionally filter by split."""
    records = []
    with open(manifest_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if split and row.get("split") != split:
                continue
            if row.get("label") not in ("bona_fide", "spoof"):
                continue
            records.append(row)
    return records


def load_audio(file_path: str) -> Tuple[Optional[np.ndarray], Optional[str]]:
    """Load a WAV audio file as float32 at 16 kHz."""
    try:
        import wave
        with wave.open(file_path, "rb") as wf:
            sr = wf.getframerate()
            n_frames = wf.getnframes()
            n_channels = wf.getnchannels()
            raw = wf.readframes(n_frames)

        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

        if n_channels > 1:
            # Mix down to mono
            samples = samples.reshape(-1, n_channels).mean(axis=1)

        if sr != SAMPLE_RATE:
            # Simple resampling via linear interpolation (not ideal, but dependency-free)
            target_len = int(len(samples) * SAMPLE_RATE / sr)
            x_old = np.linspace(0, 1, len(samples))
            x_new = np.linspace(0, 1, target_len)
            samples = np.interp(x_new, x_old, samples)

        return samples, None
    except Exception as e:
        return None, str(e)


def run_deepfake_eval(manifest_path: str, split: str, output_path: str):
    """Main evaluation function."""
    print(f"\n=== SIH104 Phase 7 — Deepfake Evaluation ===")
    print(f"Manifest: {manifest_path}")
    print(f"Split: {split}")
    print(f"Output: {output_path}")

    # Load manifest
    if not os.path.exists(manifest_path):
        print(f"ERROR: Manifest not found: {manifest_path}")
        return {"status": "ERROR", "message": "Manifest file not found"}

    records = load_manifest(manifest_path, split)
    print(f"\nRecords in split '{split}': {len(records)}")

    if len(records) == 0:
        msg = (
            f"NO DATA: 0 records found in split='{split}'. "
            f"Dataset has not been downloaded. All metrics are NOT_AVAILABLE."
        )
        print(f"\n{msg}")
        result = {
            "status": "NOT_AVAILABLE",
            "reason": msg,
            "eer": "NOT_AVAILABLE",
            "auc": "NOT_AVAILABLE",
            "fpr_at_1pct_fnr": "NOT_AVAILABLE",
            "fnr_at_1pct_fpr": "NOT_AVAILABLE",
            "total_files": 0,
            "evaluated_files": 0,
            "skipped_files": 0,
        }
        print(json.dumps(result, indent=2))
        return result

    # Load model
    if not os.path.exists(DEEPFAKE_MODEL_PATH):
        print(f"ERROR: Model not found at {DEEPFAKE_MODEL_PATH}")
        return {"status": "ERROR", "message": "Model file not found"}

    print("\nLoading ONNX model...")
    sess = ort.InferenceSession(DEEPFAKE_MODEL_PATH, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    print("Model loaded.")

    # Run evaluation
    predictions = []  # (file_path, label, spoof_score, latency_ms)
    skipped = 0
    errors = []

    for i, record in enumerate(records):
        file_path = record.get("file_path", "")
        label = record.get("label", "")

        if not os.path.exists(file_path):
            skipped += 1
            continue

        samples, err = load_audio(file_path)
        if err or samples is None:
            skipped += 1
            errors.append(f"{file_path}: {err}")
            continue

        if len(samples) < MIN_SAMPLES:
            skipped += 1
            continue

        # Run model
        audio_input = samples.reshape(1, -1)
        t0 = time.perf_counter()
        out = sess.run(None, {input_name: audio_input})
        latency_ms = (time.perf_counter() - t0) * 1000

        probs = softmax(out[0][0])
        spoof_score = float(probs[1])
        ground_truth = 1 if label == "spoof" else 0

        predictions.append({
            "file_path": file_path,
            "label": label,
            "ground_truth": ground_truth,
            "spoof_score": spoof_score,
            "latency_ms": round(latency_ms, 2),
        })

        if (i + 1) % 100 == 0:
            print(f"  Evaluated {i+1}/{len(records)}...")

    evaluated = len(predictions)
    print(f"\nEvaluated: {evaluated}, Skipped: {skipped}")

    if evaluated == 0:
        result = {
            "status": "NOT_AVAILABLE",
            "reason": "All files missing or invalid. No predictions made.",
            "evaluated": 0,
        }
        print(json.dumps(result, indent=2))
        return result

    # Compute metrics
    scores = np.array([p["spoof_score"] for p in predictions])
    labels_arr = np.array([p["ground_truth"] for p in predictions])

    # ROC curve
    thresholds = np.linspace(0, 1, 1001)
    fprs = []
    fnrs = []

    for t in thresholds:
        preds = (scores >= t).astype(int)
        tp = np.sum((preds == 1) & (labels_arr == 1))
        fp = np.sum((preds == 1) & (labels_arr == 0))
        tn = np.sum((preds == 0) & (labels_arr == 0))
        fn = np.sum((preds == 0) & (labels_arr == 1))

        n_pos = tp + fn
        n_neg = fp + tn
        fpr = fp / n_neg if n_neg > 0 else 0.0
        fnr = fn / n_pos if n_pos > 0 else 0.0
        fprs.append(fpr)
        fnrs.append(fnr)

    fprs_arr = np.array(fprs)
    fnrs_arr = np.array(fnrs)

    # EER: point where FPR ≈ FNR
    diff = np.abs(fprs_arr - fnrs_arr)
    eer_idx = np.argmin(diff)
    eer = float((fprs_arr[eer_idx] + fnrs_arr[eer_idx]) / 2)

    # AUC (trapezoidal)
    sorted_idx = np.argsort(fprs_arr)
    auc = float(np.trapz(1 - fnrs_arr[sorted_idx], fprs_arr[sorted_idx]))

    # FPR at target FNR using interpolation
    def fpr_at_fnr(target_fnr):
        try:
            f = interp1d(fnrs_arr[::-1], fprs_arr[::-1], bounds_error=False, fill_value=(1.0, 0.0))
            return float(f(target_fnr))
        except Exception:
            return "NOT_COMPUTABLE"

    def fnr_at_fpr(target_fpr):
        try:
            f = interp1d(fprs_arr, fnrs_arr, bounds_error=False, fill_value=(1.0, 0.0))
            return float(f(target_fpr))
        except Exception:
            return "NOT_COMPUTABLE"

    latencies = [p["latency_ms"] for p in predictions]

    result = {
        "status": "EVALUATED",
        "split": split,
        "total_files": len(records),
        "evaluated_files": evaluated,
        "skipped_files": skipped,
        "bona_fide_count": int(np.sum(labels_arr == 0)),
        "spoof_count": int(np.sum(labels_arr == 1)),
        "eer": round(eer, 6),
        "auc": round(auc, 6),
        "fpr_at_0.1pct_fnr": fpr_at_fnr(0.001),
        "fpr_at_1pct_fnr": fpr_at_fnr(0.01),
        "fpr_at_5pct_fnr": fpr_at_fnr(0.05),
        "fnr_at_0.1pct_fpr": fnr_at_fpr(0.001),
        "fnr_at_1pct_fpr": fnr_at_fpr(0.01),
        "fnr_at_5pct_fpr": fnr_at_fpr(0.05),
        "latency_median_ms": round(float(np.median(latencies)), 2),
        "latency_p95_ms": round(float(np.percentile(latencies, 95)), 2),
        "latency_max_ms": round(float(np.max(latencies)), 2),
        "errors_count": len(errors),
    }

    print("\n=== EVALUATION RESULTS ===")
    print(json.dumps(result, indent=2))

    # Save output
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\nResults saved to: {output_path}")

    return result


def main():
    parser = argparse.ArgumentParser(description="Phase 7 Deepfake Evaluation")
    parser.add_argument("--manifest", default="datasets/dataset_manifest.csv")
    parser.add_argument("--split", default="test")
    parser.add_argument("--output", default="evaluation/results/deepfake_eval_results.json")
    args = parser.parse_args()

    run_deepfake_eval(args.manifest, args.split, args.output)


if __name__ == "__main__":
    main()
