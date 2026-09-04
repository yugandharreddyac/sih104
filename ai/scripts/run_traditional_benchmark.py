"""SIH104 — Traditional AI/ML Model Benchmark Runner.

Runs a comprehensive benchmark across 7 supervised traditional ML model families:
  1. Logistic Regression (with StandardScaler)
  2. Random Forest (tree ensemble, raw features)
  3. SVM-RBF (kernel distance, with StandardScaler)
  4. K-Nearest Neighbors (KNN, distance metric, with StandardScaler)
  5. Extra Trees (extremely randomized trees, raw features)
  6. Gradient Boosting (sequential boosting, raw features)
  7. HistGradientBoosting (histogram boosting, raw features)

Plus checks availability of optional models: XGBoost, LightGBM, CatBoost.

Methodology:
  - Feature matrix: 48-dimensional acoustic features (24 Log-Mel + 20 LFCC + 4 scalars)
  - Preprocessing: Applied ONCE in AcousticFeatureExtractor
  - Splitting: Speaker-safe train / validation / test partitioning (zero speaker overlap)
  - Scaling policy: StandardScaler fitted ONLY on training set for distance/kernel models;
                    raw features for tree ensembles.
  - Model selection: Performed STRICTLY on the VALIDATION set (criterion: Recall -> F1 -> ROC-AUC).
  - Test evaluation: Untouched test set evaluated ONLY for final reporting.
                     The test set NEVER influences training, selection, or tuning.
  - Biometric metrics: EER (Equal Error Rate) and minDCF (NIST/ASVspoof standard) computed from continuous scores.

Usage:
  python ai/scripts/run_traditional_benchmark.py --samples 2000 --n-workers 4
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent.parent

if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from ai.app.ml.feature_pipeline import FEATURE_NAMES, FEATURE_DIM

log = logging.getLogger("benchmark")


def _setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s  %(levelname)-8s  %(name)s: %(message)s"
    datefmt = "%H:%M:%S"
    logging.basicConfig(level=level, format=fmt, datefmt=datefmt)
    # Silence third-party verbose logs
    logging.getLogger("numba").setLevel(logging.WARNING)
    logging.getLogger("matplotlib").setLevel(logging.WARNING)


def print_section(title: str) -> None:
    width = 72
    print()
    print("=" * width)
    print(f"  {title}")
    print("=" * width)


def parse_arguments(args: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="SIH104 — Traditional ML Model Benchmark (7 model families).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--samples", type=int, default=2000,
                        help="Number of balanced samples to extract for the benchmark.")
    parser.add_argument("--smoke-test", action="store_true",
                        help="Quick test mode: runs on 40 samples.")
    parser.add_argument("--n-workers", type=int, default=4,
                        help="Number of parallel FFmpeg decode threads.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    parser.add_argument("--output-dir", default="ai/models/traditional",
                        help="Directory to save benchmark artifacts.")
    parser.add_argument("--parquet-path", default=None,
                        help="Path to store/load feature parquet file.")
    parser.add_argument("--no-resume", action="store_true",
                        help="Re-extract features even if parquet exists.")
    parser.add_argument("--ffmpeg", default=None, help="Explicit path to ffmpeg.")
    parser.add_argument("--verbose", action="store_true")
    opts = parser.parse_args(args)

    if opts.smoke_test and opts.samples == 2000:
        opts.samples = 40
        log.info("Smoke test: overriding --samples to 40")

    if opts.parquet_path is None:
        tag = "smoke" if opts.smoke_test else f"{opts.samples}"
        opts.parquet_path = f"datasets/processed/asvspoof_benchmark_{tag}.parquet"

    return opts


def main(args: Optional[list[str]] = None) -> int:
    opts = parse_arguments(args)
    _setup_logging(verbose=opts.verbose or opts.smoke_test)

    os.chdir(_REPO_ROOT)

    print_section("SIH104 — Traditional AI/ML Comprehensive Benchmark")
    print(f"  Target Samples: {opts.samples}")
    print(f"  Random Seed:    {opts.seed}")
    print(f"  Workers:        {opts.n_workers}")
    print(f"  Output Dir:     {opts.output_dir}")
    print(f"  Parquet File:   {opts.parquet_path}")

    # ─── STEP 1: FFmpeg Discovery ─────────────────────────────────────────────
    print_section("Step 1: FFmpeg Discovery")
    from ai.app.ml.ffmpeg_util import get_ffmpeg_exe

    try:
        ffmpeg_exe = get_ffmpeg_exe(opts.ffmpeg)
        print(f"  FFmpeg executable: {ffmpeg_exe}")
    except RuntimeError as e:
        print(f"  ERROR: {e}")
        return 1

    # ─── STEP 2: Index FLAC & Key File ───────────────────────────────────────
    print_section("Step 2: Build FLAC Index & Parse Key File")
    from ai.app.ml.dataset_builder import (
        build_flac_index, parse_key_file, speaker_safe_split,
        verify_no_speaker_leakage, select_balanced_samples,
        extract_features_batch, KEY_FILE,
    )

    flac_index = build_flac_index(repo_root=str(_REPO_ROOT))
    print(f"  Indexed FLAC files: {len(flac_index):,}")

    all_records = parse_key_file(
        str(_REPO_ROOT / KEY_FILE),
        flac_index=flac_index,
    )
    n_bonafide = sum(1 for r in all_records if r.label == 0)
    n_spoof = sum(1 for r in all_records if r.label == 1)
    unique_spk = len({r.speaker_id for r in all_records})
    print(f"  Total records: {len(all_records):,}  (Bonafide: {n_bonafide:,} | Spoof: {n_spoof:,} | Speakers: {unique_spk})")

    # ─── STEP 3: Speaker-Safe Split ───────────────────────────────────────────
    print_section("Step 3: Speaker-Safe Train / Val / Test Split")
    train_recs, val_recs, test_recs = speaker_safe_split(
        all_records, random_seed=opts.seed,
    )
    verify_no_speaker_leakage(train_recs, val_recs, test_recs)
    print("  Speaker leakage check: PASSED (zero speaker overlap across all 3 splits)")

    # ─── STEP 4: Balanced Sample Selection ────────────────────────────────────
    print_section("Step 4: Balanced Sample Selection")
    train_recs, val_recs, test_recs = select_balanced_samples(
        train_recs, val_recs, test_recs,
        total_target=opts.samples,
        random_seed=opts.seed,
    )
    all_selected = train_recs + val_recs + test_recs
    print(f"  Selected samples: train={len(train_recs)}, val={len(val_recs)}, test={len(test_recs)} (total: {len(all_selected)})")

    # ─── STEP 5: Feature Extraction ───────────────────────────────────────────
    print_section("Step 5: Feature Extraction (Corrected 48-dim Pipeline)")
    parquet_path = Path(opts.parquet_path)
    resume = parquet_path.exists() and not opts.no_resume

    if resume:
        print(f"  Found existing benchmark parquet: {parquet_path}")
        feat_df = pd.read_parquet(parquet_path)
        print(f"  Loaded {len(feat_df)} rows from parquet.")
    else:
        print(f"  Extracting features fresh -> {parquet_path}")
        from ai.app.ml.feature_pipeline import FeaturePipeline
        pipeline = FeaturePipeline(sample_rate=16000, ffmpeg_exe=ffmpeg_exe)
        feat_df, failures = extract_features_batch(
            all_selected,
            pipeline=pipeline,
            output_path=parquet_path,
            n_workers=opts.n_workers,
            resume=False,
        )

    # Validate feature matrix
    missing_feats = [col for col in FEATURE_NAMES if col not in feat_df.columns]
    if missing_feats:
        print(f"  ERROR: Parquet missing feature columns: {missing_feats}")
        return 1

    feature_mat = feat_df[FEATURE_NAMES].to_numpy(dtype=np.float32)
    nan_count = int(np.isnan(feature_mat).sum())
    inf_count = int(np.isinf(feature_mat).sum())
    print(f"  Feature dimensions: {len(FEATURE_NAMES)} (expected: 48)")
    print(f"  NaN count: {nan_count} | Inf count: {inf_count}")
    if nan_count > 0 or inf_count > 0:
        print("  ERROR: Feature matrix contains NaN or Inf values!")
        return 1

    # ─── STEP 6: Run Comprehensive Benchmark ──────────────────────────────────
    print_section("Step 6: Train & Evaluate 7 Model Families + Hyperparameter Search")
    from ai.app.ml.trainer import (
        run_comprehensive_benchmark,
        save_benchmark_artifacts,
    )

    t_start = time.perf_counter()
    bench_res = run_comprehensive_benchmark(
        feat_df,
        feature_names=FEATURE_NAMES,
        random_seed=opts.seed,
    )
    total_bench_time = time.perf_counter() - t_start
    print(f"  Benchmark complete in {total_bench_time:.2f}s")

    # ─── STEP 7: Validation Comparison Table ──────────────────────────────────
    print_section("Step 7: Model Selection — Validation Set Performance")
    print("  CRITERION: Recall (primary) -> F1 (secondary) -> ROC-AUC (tertiary)")
    print("  All models fitted on TRAIN only; hyperparameter search and selection on VALIDATION.")
    print()
    header = f"  {'Model':<25} {'Accuracy':>8} {'Precision':>9} {'Recall':>8} {'F1':>8} {'ROC-AUC':>8} {'FPR':>8} {'FNR':>8} {'EER':>8} {'minDCF':>8}"
    print(header)
    print("  " + "-" * (len(header) - 2))

    for family, m in bench_res.family_champions_val.items():
        is_best = (family == bench_res.best_family)
        marker = " <-- BEST BY VALIDATION" if is_best else ""
        auc_str = f"{m.roc_auc:>8.4f}" if not np.isnan(m.roc_auc) else "     nan"
        eer_str = f"{m.eer:>8.4f}" if not np.isnan(m.eer) else "     nan"
        dcf_str = f"{m.min_dcf:>8.4f}" if not np.isnan(m.min_dcf) else "     nan"
        print(
            f"  {m.model_name:<25} {m.accuracy:>8.4f} {m.precision:>9.4f} "
            f"{m.recall:>8.4f} {m.f1:>8.4f} {auc_str} {m.fpr:>8.4f} {m.fnr:>8.4f} "
            f"{eer_str} {dcf_str}{marker}"
        )

    print()
    print(f"  BEST MODEL BY VALIDATION: {bench_res.best_family}[{bench_res.best_config_name}]")
    print(f"  Reason: Highest validation Recall ({bench_res.best_val_metrics.recall:.4f}) and F1 ({bench_res.best_val_metrics.f1:.4f})")

    # ─── STEP 8: Final Evaluation on Untouched Test Set ───────────────────────
    print_section("Step 8: Final Evaluation — Untouched Test Set")
    print(f"  Primary Result: Selected Model -> {bench_res.best_family}[{bench_res.best_config_name}]")
    print("  NOTE: Test set was NOT used for training, hyperparameter tuning, or model selection.")
    print()
    print(header)
    print("  " + "-" * (len(header) - 2))

    for family, m in bench_res.family_champions_test.items():
        is_best = (family == bench_res.best_family)
        marker = " <-- FINAL EVAL (Winner)" if is_best else ""
        auc_str = f"{m.roc_auc:>8.4f}" if not np.isnan(m.roc_auc) else "     nan"
        eer_str = f"{m.eer:>8.4f}" if not np.isnan(m.eer) else "     nan"
        dcf_str = f"{m.min_dcf:>8.4f}" if not np.isnan(m.min_dcf) else "     nan"
        print(
            f"  {m.model_name:<25} {m.accuracy:>8.4f} {m.precision:>9.4f} "
            f"{m.recall:>8.4f} {m.f1:>8.4f} {auc_str} {m.fpr:>8.4f} {m.fnr:>8.4f} "
            f"{eer_str} {dcf_str}{marker}"
        )

    best_tm = bench_res.best_test_metrics
    print()
    print(f"  Selected Model Final Test Metrics ({bench_res.best_family}[{bench_res.best_config_name}]):")
    print(f"    Accuracy:  {best_tm.accuracy:.4f}")
    print(f"    Precision: {best_tm.precision:.4f}")
    print(f"    Recall:    {best_tm.recall:.4f}")
    print(f"    F1-Score:  {best_tm.f1:.4f}")
    print(f"    ROC-AUC:   {best_tm.roc_auc:.4f}")
    print(f"    FPR:       {best_tm.fpr:.4f}")
    print(f"    FNR:       {best_tm.fnr:.4f}")
    print(f"    EER:       {best_tm.eer:.4f}")
    print(f"    minDCF:    {best_tm.min_dcf:.4f}")
    print(f"    Confusion Matrix: TN={best_tm.tn}, FP={best_tm.fp}, FN={best_tm.fn}, TP={best_tm.tp}")

    # ─── STEP 9: KNN Scalability Analysis ─────────────────────────────────────
    print_section("Step 9: KNN Computational Cost & Scalability Analysis")
    knn_cost = bench_res.knn_cost_analysis
    print(f"  Pilot Train Samples: {knn_cost['pilot_train_samples']}")
    print(f"  Pilot Test Samples:  {knn_cost['pilot_test_samples']}")
    print(f"  Pilot Test Inference Duration: {knn_cost['pilot_predict_time_sec']}s ({knn_cost['pilot_per_sample_predict_ms']} ms/sample)")
    print(f"  Full Dataset Target: Train={knn_cost['full_dataset_train_samples']:,}, Test={knn_cost['full_dataset_test_samples']:,}")
    print(f"  Extrapolated Full Test Set Time: {knn_cost['extrapolated_full_test_sec']:.1f}s (~{knn_cost['extrapolated_full_test_hours']:.2f} hours)")
    print(f"  Extrapolated Per-Query Latency:  {knn_cost['extrapolated_per_sample_latency_ms']:.1f} ms/query")
    print(f"  Scalability Assessment:          {knn_cost['assessment']}")

    # ─── STEP 10: Save Benchmark Artifacts ────────────────────────────────────
    print_section("Step 10: Save Benchmark Artifacts")
    saved = save_benchmark_artifacts(
        bench_res,
        feature_names=FEATURE_NAMES,
        df=feat_df,
        random_seed=opts.seed,
        output_dir=opts.output_dir,
    )
    for k, v in saved.items():
        print(f"  {k:<28} -> {v}")

    # ─── STEP 11: Single-File Inference Verification ──────────────────────────
    print_section("Step 11: Single-File Inference Verification")
    from ai.scripts.inference_single_file import predict_single_file

    sample_test_flac = None
    for r in test_recs:
        if r.audio_id in flac_index:
            sample_test_flac = flac_index[r.audio_id]
            sample_true_label = r.label_str
            break

    if sample_test_flac:
        inf_res = predict_single_file(
            sample_test_flac,
            model_dir=opts.output_dir,
            ffmpeg_exe=ffmpeg_exe,
        )
        pred_str = inf_res["prediction"]
        conf = inf_res.get("confidence", 0.0)
        print(f"  Inference audio:   {Path(sample_test_flac).name}")
        print(f"  True label:        {sample_true_label}")
        print(f"  Predicted label:   {pred_str}")
        print(f"  Confidence:        {conf:.4f}")
        print(f"  Verification:      {'CORRECT OK' if pred_str == sample_true_label else 'MISCLASSIFIED'}")

    # ─── STEP 12: Traditional ML Sufficiency Assessment ───────────────────────
    print_section("Step 12: Traditional ML Sufficiency Assessment")
    test_rec = best_tm.recall
    test_fpr = best_tm.fpr
    test_auc = best_tm.roc_auc
    is_sufficient = (test_rec >= 0.80 and test_fpr <= 0.20 and test_auc >= 0.85)

    print()
    if is_sufficient:
        print("  TRADITIONAL ML SUFFICIENT: YES")
        print("  TRANSFORMER STAGE RECOMMENDED: NO")
        print(f"  Reason: Test Recall={test_rec:.4f} >= 0.80, FPR={test_fpr:.4f} <= 0.20, ROC-AUC={test_auc:.4f} >= 0.85.")
    else:
        print("  TRADITIONAL ML SUFFICIENT: NO")
        print("  TRANSFORMER STAGE RECOMMENDED: YES")
        print(f"  Reason: Observed Test Recall={test_rec:.4f} (FNR={best_tm.fnr:.4f}), FPR={test_fpr:.4f}, ROC-AUC={test_auc:.4f}, EER={best_tm.eer:.4f}.")
        print("  Acoustic spectral features with traditional ML leave high residual false-negative or false-positive errors.")
        print("  Deep temporal vocoder representations (e.g. WavLM / RawNet / SSL frontend) are needed for robust spoof discrimination.")

    print()
    print("  FULL DATASET RUN STATUS: NOT YET RUN")
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
