"""SIH104 -- Traditional ML Pipeline Runner.

End-to-end script: reads ASVspoof 2021 DF key file, extracts acoustic features,
performs speaker-safe splitting, trains Logistic Regression / Random Forest / SVM,
evaluates all models, selects the best by Recall, and saves artifacts.

Usage:
    # Smoke test -- 40 samples (fast sanity check)
    python ai/scripts/train_traditional_pipeline.py --smoke-test --samples 40

    # Pilot run -- 5000 samples
    python ai/scripts/train_traditional_pipeline.py --samples 5000

    # Full dataset
    python ai/scripts/train_traditional_pipeline.py --samples 0

Options:
    --samples INT       Number of total samples to process (0 = all). Default: 5000.
    --smoke-test        Enable smoke-test mode: verbose, exits after model save.
    --n-workers INT     Parallel FFmpeg decode threads. Default: 4.
    --seed INT          Random seed. Default: 42.
    --output-dir PATH   Model output directory. Default: ai/models/traditional
    --parquet-path PATH Feature parquet path. Default: datasets/processed/asvspoof_pilot.parquet
    --no-resume         Disable extraction resume (re-extract everything).
    --ffmpeg PATH       Explicit path to ffmpeg binary.
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import sys
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# Ensure repo 'ai' is importable
# ─────────────────────────────────────────────────────────────────────────────
_REPO_ROOT = Path(__file__).resolve().parents[2]  # sih104/
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
if str(_REPO_ROOT / "ai") not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT / "ai"))


def _setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Quiet noisy third-party loggers
    logging.getLogger("numba").setLevel(logging.WARNING)
    logging.getLogger("matplotlib").setLevel(logging.WARNING)


log = logging.getLogger("sih104.pipeline")


def print_section(title: str) -> None:
    width = 66
    print("\n" + "=" * width)
    print(f"  {title}")
    print("=" * width)


def main(args: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="SIH104 Traditional Audio ML Pipeline",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--samples", type=int, default=5000,
                        help="Total samples to process (0 = use all available).")
    parser.add_argument("--smoke-test", action="store_true",
                        help="Smoke-test mode: small sample, extra-verbose output.")
    parser.add_argument("--n-workers", type=int, default=4,
                        help="Number of parallel FFmpeg decode threads.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    parser.add_argument("--output-dir", default="ai/models/traditional",
                        help="Directory to save trained models and results.")
    parser.add_argument("--parquet-path", default=None,
                        help="Path to store/load the feature parquet file.")
    parser.add_argument("--no-resume", action="store_true",
                        help="Re-extract all features even if parquet exists.")
    parser.add_argument("--ffmpeg", default=None, help="Explicit path to ffmpeg.")
    parser.add_argument("--verbose", action="store_true")
    opts = parser.parse_args(args)

    _setup_logging(verbose=opts.verbose or opts.smoke_test)

    # ─── Override defaults for smoke test ────────────────────────────────────
    if opts.smoke_test and opts.samples == 5000:
        opts.samples = 40
        log.info("Smoke-test mode: overriding --samples to 40")

    n_samples = opts.samples if opts.samples > 0 else None  # None = all

    # Default parquet path based on sample count
    if opts.parquet_path is None:
        tag = "smoke" if opts.smoke_test else (f"{n_samples}k" if n_samples and n_samples >= 1000 else str(n_samples) if n_samples else "all")
        opts.parquet_path = f"datasets/processed/asvspoof_pilot_{tag}.parquet"

    # ─── Change cwd to repo root ──────────────────────────────────────────────
    os.chdir(_REPO_ROOT)

    print_section("SIH104 -- Traditional Audio ML Pipeline")
    print(f"  Mode:          {'SMOKE TEST' if opts.smoke_test else 'PILOT'}")
    print(f"  Target samples: {n_samples if n_samples else 'ALL'}")
    print(f"  Random seed:   {opts.seed}")
    print(f"  Workers:       {opts.n_workers}")
    print(f"  Output dir:    {opts.output_dir}")
    print(f"  Parquet path:  {opts.parquet_path}")

    # ─── STEP 1: FFmpeg Discovery ─────────────────────────────────────────────
    print_section("Step 1: FFmpeg Discovery")
    from ai.app.ml.ffmpeg_util import get_ffmpeg_exe, decode_audio_to_float32

    try:
        ffmpeg_exe = get_ffmpeg_exe(opts.ffmpeg)
        print(f"  FFmpeg: {ffmpeg_exe}")
    except RuntimeError as e:
        print(f"  ERROR: {e}")
        return 1

    # ─── STEP 2: Key File & FLAC Index ───────────────────────────────────────
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
    print(f"  Total labeled records (on disk): {len(all_records):,}")

    bona_cnt = sum(1 for r in all_records if r.label == 0)
    spoof_cnt = sum(1 for r in all_records if r.label == 1)
    spk_cnt = len({r.speaker_id for r in all_records})
    print(f"  Bonafide: {bona_cnt:,}  |  Spoof: {spoof_cnt:,}  |  Speakers: {spk_cnt}")

    # ─── STEP 3: Speaker-Safe Split ───────────────────────────────────────────
    print_section("Step 3: Speaker-Safe Train / Val / Test Split")
    train_recs, val_recs, test_recs = speaker_safe_split(
        all_records, random_seed=opts.seed,
    )
    verify_no_speaker_leakage(train_recs, val_recs, test_recs)
    print(f"  Train: {len(train_recs):,}  Val: {len(val_recs):,}  Test: {len(test_recs):,}")
    print("  Speaker leakage check: PASSED")

    # ─── STEP 4: Balanced Sample Selection ───────────────────────────────────
    if n_samples:
        print_section("Step 4: Balanced Sample Selection")
        train_recs, val_recs, test_recs = select_balanced_samples(
            train_recs, val_recs, test_recs,
            total_target=n_samples,
            random_seed=opts.seed,
        )
        all_selected = train_recs + val_recs + test_recs
        print(f"  Selected: train={len(train_recs)}, val={len(val_recs)}, test={len(test_recs)}")
        bona_sel = sum(1 for r in all_selected if r.label == 0)
        spoof_sel = sum(1 for r in all_selected if r.label == 1)
        print(f"  Class balance: bonafide={bona_sel}, spoof={spoof_sel}")
    else:
        all_selected = train_recs + val_recs + test_recs

    # ─── STEP 5: Feature Extraction ──────────────────────────────────────────
    print_section("Step 5: Feature Extraction")
    print(f"  Extracting features for {len(all_selected):,} audio files ...")
    print(f"  Workers: {opts.n_workers}  |  Parquet: {opts.parquet_path}")

    from ai.app.ml.feature_pipeline import FeaturePipeline, FEATURE_NAMES, FEATURE_DIM

    pipeline = FeaturePipeline(sample_rate=16000, ffmpeg_exe=ffmpeg_exe)
    print(f"  Feature dimension: {FEATURE_DIM}")

    feat_df, failures = extract_features_batch(
        all_selected,
        pipeline=pipeline,
        output_path=opts.parquet_path,
        n_workers=opts.n_workers,
        resume=not opts.no_resume,
    )

    print(f"\n  Successful: {len(feat_df):,}  |  Failed: {len(failures):,}")

    if failures:
        fail_path = Path(opts.output_dir) / "extraction_failures.json"
        fail_path.parent.mkdir(parents=True, exist_ok=True)
        fail_path.write_text(json.dumps(failures, indent=2), encoding="utf-8")
        print(f"  Failed file list saved: {fail_path}")
        if len(failures) > 0:
            print(f"  First failure: {failures[0]}")

    if len(feat_df) == 0:
        print("ERROR: No features were extracted. Cannot proceed.")
        return 1

    # Verify no NaN/Inf in features
    import numpy as np
    feat_arr = feat_df[FEATURE_NAMES].to_numpy(dtype=np.float32)
    if not np.isfinite(feat_arr).all():
        bad_rows = np.where(~np.isfinite(feat_arr).all(axis=1))[0]
        print(f"WARNING: {len(bad_rows)} feature rows contain NaN/Inf -- removing them.")
        feat_df = feat_df[np.isfinite(feat_arr).all(axis=1)].reset_index(drop=True)

    # Re-verify split membership
    for split_name in ["train", "val", "test"]:
        cnt = (feat_df["split"] == split_name).sum()
        spk = feat_df[feat_df["split"] == split_name]["speaker_id"].nunique()
        print(f"  {split_name:5s}: {cnt:5d} samples, {spk:3d} speakers")

    # ─── STEP 6: Train Models ─────────────────────────────────────────────────
    print_section("Step 6: Train Logistic Regression / Random Forest / SVM")
    from ai.app.ml.trainer import train_and_evaluate, save_model_artifacts, save_confusion_matrices

    fitted_models, val_metrics, test_metrics, best_name = train_and_evaluate(
        feat_df,
        feature_names=FEATURE_NAMES,
        random_seed=opts.seed,
    )

    # Print validation metrics table (used for model selection)
    print(f"\n  MODEL SELECTION -- Validation Set Metrics (used to select best model)")
    print(f"  {'Model':<22} {'Acc':>6} {'Prec':>6} {'Rec':>6} {'F1':>6} {'AUC':>6} {'FPR':>6} {'FNR':>6}")
    print("  " + "-" * 70)
    for mname, m in val_metrics.items():
        marker = " <-- SELECTED" if mname == best_name else ""
        print(f"  {mname:<22} {m.accuracy:>6.4f} {m.precision:>6.4f} {m.recall:>6.4f} {m.f1:>6.4f} {m.roc_auc:>6.4f} {m.fpr:>6.4f} {m.fnr:>6.4f}{marker}")

    # Print test metrics table (final evaluation, NOT used for selection)
    print(f"\n  FINAL EVALUATION -- Test Set Metrics (unbiased; selected model: {best_name})")
    print(f"  {'Model':<22} {'Acc':>6} {'Prec':>6} {'Rec':>6} {'F1':>6} {'AUC':>6} {'FPR':>6} {'FNR':>6}")
    print("  " + "-" * 70)
    for mname, m in test_metrics.items():
        marker = " <-- BEST (val-selected)" if mname == best_name else ""
        print(f"  {mname:<22} {m.accuracy:>6.4f} {m.precision:>6.4f} {m.recall:>6.4f} {m.f1:>6.4f} {m.roc_auc:>6.4f} {m.fpr:>6.4f} {m.fnr:>6.4f}{marker}")

    print(f"\n  Best model (by val): {best_name}")
    print(f"  Val  Recall={val_metrics[best_name].recall:.4f}  F1={val_metrics[best_name].f1:.4f}  AUC={val_metrics[best_name].roc_auc:.4f}")
    print(f"  Test Recall={test_metrics[best_name].recall:.4f}  F1={test_metrics[best_name].f1:.4f}  AUC={test_metrics[best_name].roc_auc:.4f}")

    # ─── STEP 7: Save Artifacts ───────────────────────────────────────────────
    print_section("Step 7: Save Model Artifacts")
    saved = save_model_artifacts(
        fitted_models,
        val_metrics=val_metrics,
        test_metrics=test_metrics,
        best_name=best_name,
        feature_names=FEATURE_NAMES,
        df=feat_df,
        random_seed=opts.seed,
        output_dir=opts.output_dir,
    )
    for key, path in saved.items():
        print(f"  {key:<25} -> {path}")

    # Confusion matrix plot
    cm_path = save_confusion_matrices(
        fitted_models, test_metrics, feat_df, FEATURE_NAMES,
        output_dir=opts.output_dir,
    )
    print(f"  confusion_matrices         -> {cm_path}")

    # ─── STEP 8: Smoke-test Inference ────────────────────────────────────────
    if opts.smoke_test:
        print_section("Step 8: Smoke-Test Single-File Inference")
        test_df_inner = feat_df[feat_df["split"] == "test"].head(1)
        if len(test_df_inner) == 0:
            print("  No test records to verify inference. SKIP.")
        else:
            rec_row = test_df_inner.iloc[0]
            # Re-find the FLAC path
            audio_id = rec_row["audio_id"]
            if audio_id in flac_index:
                flac_path = flac_index[audio_id]
                print(f"  Test file: {flac_path}")
                try:
                    feat_vec = pipeline.extract_from_file(flac_path)
                    import numpy as np
                    best_model = fitted_models[best_name]
                    vec_2d = feat_vec.reshape(1, -1)
                    pred = best_model.predict(vec_2d)[0]
                    pred_label = "spoof" if pred == 1 else "bonafide"
                    true_label = rec_row["label_str"]
                    if hasattr(best_model, "predict_proba"):
                        prob = best_model.predict_proba(vec_2d)[0]
                        conf = float(prob[pred])
                    else:
                        conf = float("nan")
                    print(f"  Audio ID:      {audio_id}")
                    print(f"  True label:    {true_label}")
                    print(f"  Predicted:     {pred_label}")
                    print(f"  Confidence:    {conf:.4f}")
                    print(f"  Inference:     {'CORRECT OK' if pred_label == true_label else 'INCORRECT FAIL'}")
                except Exception as exc:
                    print(f"  Inference test failed: {exc}")
            else:
                print(f"  Could not find FLAC for audio_id={audio_id}, skipping inference test.")

    # ─── FINAL SUMMARY ────────────────────────────────────────────────────────
    print_section("Pipeline Complete")
    print(f"  Feature parquet:   {opts.parquet_path}")
    print(f"  Model directory:   {opts.output_dir}")
    print(f"  Pilot results:     {opts.output_dir}/pilot_results.json")
    print(f"  Best model:        {best_name}  (selected by validation set)")
    print(f"  Val  Recall:       {val_metrics[best_name].recall:.4f}")
    print(f"  Val  F1:           {val_metrics[best_name].f1:.4f}")
    print(f"  Val  ROC-AUC:      {val_metrics[best_name].roc_auc:.4f}")
    print(f"  Test Recall:       {test_metrics[best_name].recall:.4f}  (unbiased final evaluation)")
    print(f"  Test F1:           {test_metrics[best_name].f1:.4f}")
    print(f"  Test ROC-AUC:      {test_metrics[best_name].roc_auc:.4f}")
    print()
    print("  Reproduce pilot:")
    print(f"    python ai/scripts/train_traditional_pipeline.py --samples {opts.samples}")
    print()
    print("  Single-file inference:")
    print("    python ai/scripts/inference_single_file.py <path_to_audio.flac>")

    return 0


if __name__ == "__main__":
    sys.exit(main())
