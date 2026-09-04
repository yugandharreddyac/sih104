"""SIH104 — ASVspoof 2021 DF Dataset Builder.

Reads the official ASVspoof 2021 DF key file, builds a balanced sample selection,
performs speaker-safe 70/15/15 train/validation/test splitting, and extracts
acoustic features to a Parquet file for reproducible ML training.

Key file format (whitespace-delimited):
  col 0: speaker_id   (e.g. LA_0023)
  col 1: audio_id     (e.g. DF_E_2000011)
  col 2: codec        (e.g. nocodec, low_m4a, mp3m4a)
  col 3: source       (e.g. asvspoof, vcc2020)
  col 4: attack_type  (e.g. A14, A09, -)
  col 5: label        (bonafide | spoof)

Label mapping:
  bonafide → 0
  spoof    → 1

Usage:
    python -m ai.app.ml.dataset_builder --help
"""

from __future__ import annotations

import json
import logging
import os
import random
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

LABEL_MAP: Dict[str, int] = {"bonafide": 0, "spoof": 1}
SPLIT_RATIOS = (0.70, 0.15, 0.15)  # train, val, test

ASVSPOOF_PART_DIRS: List[str] = [
    "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part00/ASVspoof2021_DF_eval/flac",
    "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part01/ASVspoof2021_DF_eval/flac",
    "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part02/ASVspoof2021_DF_eval/flac",
    "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part03/ASVspoof2021_DF_eval/flac",
]

KEY_FILE = "datasets/raw/asvspoof/keys/trial_metadata.txt"
OUTPUT_DIR = "datasets/processed"


# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SampleRecord:
    """Single labeled audio sample."""
    audio_id: str
    speaker_id: str
    label: int          # 0=bonafide, 1=spoof
    label_str: str      # "bonafide" | "spoof"
    flac_path: str
    split: str = ""     # "train" | "val" | "test"


@dataclass
class ExtractionResult:
    """Feature extraction result for one sample."""
    audio_id: str
    speaker_id: str
    label: int
    label_str: str
    split: str
    features: Optional[np.ndarray] = None  # shape (FEATURE_DIM,)
    error: Optional[str] = None
    duration_ms: float = 0.0

    @property
    def success(self) -> bool:
        return self.features is not None and self.error is None


# ─────────────────────────────────────────────────────────────────────────────
# FLAC Index Builder
# ─────────────────────────────────────────────────────────────────────────────

def build_flac_index(repo_root: str = ".") -> Dict[str, str]:
    """Scan ASVspoof part directories and return {audio_id: absolute_path}.

    Uses os.scandir for speed (benchmarked at ~1.1s for all 611,829 files).

    Args:
        repo_root: Root directory of the SIH104 repository.

    Returns:
        Dict mapping audio_id (stem without .flac) → absolute file path.
    """
    index: Dict[str, str] = {}
    root = Path(repo_root)

    logger.info("Building FLAC index...")
    t0 = time.perf_counter()

    for rel_dir in ASVSPOOF_PART_DIRS:
        flac_dir = root / rel_dir
        if not flac_dir.exists():
            logger.warning("FLAC directory not found, skipping: %s", flac_dir)
            continue
        with os.scandir(flac_dir) as it:
            for entry in it:
                if entry.name.endswith(".flac"):
                    stem = entry.name[:-5]
                    index[stem] = entry.path

    elapsed = time.perf_counter() - t0
    logger.info("Indexed %d FLAC files in %.2fs", len(index), elapsed)
    return index


# ─────────────────────────────────────────────────────────────────────────────
# Key File Parser
# ─────────────────────────────────────────────────────────────────────────────

def parse_key_file(
    key_path: str,
    flac_index: Dict[str, str],
) -> List[SampleRecord]:
    """Parse the ASVspoof 2021 DF key file and resolve physical file paths.

    Args:
        key_path: Path to trial_metadata.txt.
        flac_index: Dict from build_flac_index().

    Returns:
        List of SampleRecord with only files physically present on disk.
    """
    records: List[SampleRecord] = []
    missing = 0
    unknown_labels = 0

    with open(key_path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) < 6:
                continue

            speaker_id = parts[0]
            audio_id = parts[1]
            label_str = parts[5]

            if label_str not in LABEL_MAP:
                unknown_labels += 1
                continue

            if audio_id not in flac_index:
                missing += 1
                continue

            records.append(SampleRecord(
                audio_id=audio_id,
                speaker_id=speaker_id,
                label=LABEL_MAP[label_str],
                label_str=label_str,
                flac_path=flac_index[audio_id],
            ))

    logger.info(
        "Parsed key file: %d valid records, %d missing on disk, %d unknown labels",
        len(records), missing, unknown_labels,
    )
    return records


# ─────────────────────────────────────────────────────────────────────────────
# Speaker-Safe Splitting
# ─────────────────────────────────────────────────────────────────────────────

def speaker_safe_split(
    records: List[SampleRecord],
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    random_seed: int = 42,
) -> Tuple[List[SampleRecord], List[SampleRecord], List[SampleRecord]]:
    """Assign records to train/val/test splits with ZERO speaker overlap.

    Strategy:
      1. Group speakers by their dominant class (bonafide-heavy vs spoof-heavy).
      2. Shuffle speaker list deterministically.
      3. Partition speakers into 70/15/15 proportions.
      4. Assign all records for each speaker to one split only.
      5. Validate that no speaker appears in multiple splits.

    Args:
        records: All labeled sample records.
        train_ratio: Fraction for training (default 0.70).
        val_ratio: Fraction for validation (default 0.15).
        random_seed: Fixed seed for reproducibility.

    Returns:
        (train_records, val_records, test_records)

    Raises:
        RuntimeError: If speaker leakage is detected post-split.
    """
    rng = random.Random(random_seed)

    # Group speakers → records
    speaker_records: Dict[str, List[SampleRecord]] = defaultdict(list)
    for rec in records:
        speaker_records[rec.speaker_id].append(rec)

    speakers = sorted(speaker_records.keys())
    rng.shuffle(speakers)

    n_spk = len(speakers)
    n_train = max(1, round(n_spk * train_ratio))
    n_val = max(1, round(n_spk * val_ratio))
    n_test = max(1, n_spk - n_train - n_val)

    # Clamp
    if n_train + n_val + n_test > n_spk:
        n_test = n_spk - n_train - n_val

    train_spk = set(speakers[:n_train])
    val_spk = set(speakers[n_train: n_train + n_val])
    test_spk = set(speakers[n_train + n_val:])

    # Validate no overlap
    tv = train_spk & val_spk
    tt = train_spk & test_spk
    vt = val_spk & test_spk
    if tv or tt or vt:
        raise RuntimeError(
            f"Speaker leakage detected! train∩val={tv}, train∩test={tt}, val∩test={vt}"
        )

    train_recs, val_recs, test_recs = [], [], []

    for rec in records:
        spk = rec.speaker_id
        if spk in train_spk:
            rec.split = "train"
            train_recs.append(rec)
        elif spk in val_spk:
            rec.split = "val"
            val_recs.append(rec)
        elif spk in test_spk:
            rec.split = "test"
            test_recs.append(rec)

    logger.info(
        "Split: train=%d (speakers=%d), val=%d (speakers=%d), test=%d (speakers=%d)",
        len(train_recs), len(train_spk),
        len(val_recs), len(val_spk),
        len(test_recs), len(test_spk),
    )
    return train_recs, val_recs, test_recs


def verify_no_speaker_leakage(
    train: List[SampleRecord],
    val: List[SampleRecord],
    test: List[SampleRecord],
) -> None:
    """Hard assertion: raise RuntimeError if any speaker appears in >1 split.

    Args:
        train, val, test: Lists of sample records for each split.

    Raises:
        RuntimeError: If speaker leakage is detected.
    """
    train_spk = {r.speaker_id for r in train}
    val_spk = {r.speaker_id for r in val}
    test_spk = {r.speaker_id for r in test}

    tv = train_spk & val_spk
    tt = train_spk & test_spk
    vt = val_spk & test_spk

    if tv or tt or vt:
        raise RuntimeError(
            "CRITICAL — Speaker leakage detected after splitting!\n"
            f"  train ∩ val = {tv}\n"
            f"  train ∩ test = {tt}\n"
            f"  val ∩ test = {vt}\n"
            "This must be fixed before training."
        )
    logger.info(
        "Speaker leakage check PASSED. train_spk=%d, val_spk=%d, test_spk=%d",
        len(train_spk), len(val_spk), len(test_spk),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Balanced Sample Selection
# ─────────────────────────────────────────────────────────────────────────────

def select_balanced_samples(
    train: List[SampleRecord],
    val: List[SampleRecord],
    test: List[SampleRecord],
    total_target: int,
    random_seed: int = 42,
) -> Tuple[List[SampleRecord], List[SampleRecord], List[SampleRecord]]:
    """Select up to total_target samples across all splits, preserving split ratios.

    Within each split, balances bona fide vs spoof by capping the majority class.
    Speaker assignments remain unchanged.

    Args:
        train, val, test: Full record lists per split.
        total_target: Maximum total samples to retain.
        random_seed: Seed for reproducible shuffling.

    Returns:
        (selected_train, selected_val, selected_test)
    """
    rng = random.Random(random_seed)

    def _select(recs: List[SampleRecord], target: int) -> List[SampleRecord]:
        bona = [r for r in recs if r.label == 0]
        spoof = [r for r in recs if r.label == 1]
        rng.shuffle(bona)
        rng.shuffle(spoof)
        # Balance: each class gets at most half the target
        per_class = target // 2
        selected = bona[:per_class] + spoof[:per_class]
        rng.shuffle(selected)
        return selected

    n_train = max(1, round(total_target * SPLIT_RATIOS[0]))
    n_val = max(1, round(total_target * SPLIT_RATIOS[1]))
    n_test = max(1, total_target - n_train - n_val)

    sel_train = _select(train, n_train)
    sel_val = _select(val, n_val)
    sel_test = _select(test, n_test)

    logger.info(
        "Balanced selection: train=%d, val=%d, test=%d (total=%d)",
        len(sel_train), len(sel_val), len(sel_test),
        len(sel_train) + len(sel_val) + len(sel_test),
    )
    return sel_train, sel_val, sel_test


# ─────────────────────────────────────────────────────────────────────────────
# Feature Extraction Worker
# ─────────────────────────────────────────────────────────────────────────────

def _extract_one(rec: SampleRecord, pipeline) -> ExtractionResult:
    """Extract features for a single SampleRecord. Used by thread pool."""
    t0 = time.perf_counter()
    try:
        vec = pipeline.extract_from_file(rec.flac_path)
        duration_ms = (time.perf_counter() - t0) * 1000
        return ExtractionResult(
            audio_id=rec.audio_id,
            speaker_id=rec.speaker_id,
            label=rec.label,
            label_str=rec.label_str,
            split=rec.split,
            features=vec,
            duration_ms=duration_ms,
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - t0) * 1000
        return ExtractionResult(
            audio_id=rec.audio_id,
            speaker_id=rec.speaker_id,
            label=rec.label,
            label_str=rec.label_str,
            split=rec.split,
            error=f"{type(exc).__name__}: {exc}",
            duration_ms=duration_ms,
        )


def extract_features_batch(
    records: List[SampleRecord],
    pipeline,
    output_path: str,
    n_workers: int = 4,
    resume: bool = True,
) -> Tuple[pd.DataFrame, List[Dict]]:
    """Extract features for a list of records in parallel and save to Parquet.

    Args:
        records: SampleRecord list to process.
        pipeline: Initialized FeaturePipeline instance.
        output_path: Path to output .parquet file.
        n_workers: Number of parallel extraction threads.
        resume: If True, skip already-extracted records in existing Parquet.

    Returns:
        (features_df, failures) where features_df contains columns
        [audio_id, speaker_id, label, label_str, split, feat_00..feat_47]
        and failures is a list of dicts with error details.
    """
    from ai.app.ml.feature_pipeline import FEATURE_NAMES, FEATURE_DIM

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Resume support: load already extracted IDs
    already_done: set[str] = set()
    existing_rows: List[Dict] = []

    if resume and out_path.exists():
        try:
            existing_df = pd.read_parquet(out_path)
            already_done = set(existing_df["audio_id"].tolist())
            existing_rows = existing_df.to_dict(orient="records")
            logger.info(
                "Resume: found %d already extracted records in %s",
                len(already_done), out_path,
            )
        except Exception as exc:
            logger.warning("Could not read existing parquet for resume: %s", exc)

    # Filter to pending records
    pending = [r for r in records if r.audio_id not in already_done]
    logger.info(
        "Extraction: %d total, %d already done, %d pending",
        len(records), len(already_done), len(pending),
    )

    if not pending:
        logger.info("All records already extracted. Loading from %s", out_path)
        df = pd.read_parquet(out_path)
        return df, []

    # Parallel extraction
    failures: List[Dict] = []
    new_rows: List[Dict] = []
    done_count = 0
    total = len(pending)

    t0 = time.perf_counter()

    with ThreadPoolExecutor(max_workers=n_workers) as executor:
        futures = {executor.submit(_extract_one, rec, pipeline): rec for rec in pending}

        for future in as_completed(futures):
            result: ExtractionResult = future.result()
            done_count += 1

            if done_count % 50 == 0 or done_count == total:
                elapsed = time.perf_counter() - t0
                rate = done_count / elapsed if elapsed > 0 else 0
                eta = (total - done_count) / rate if rate > 0 else 0
                print(
                    f"  [{done_count:>{len(str(total))}}/{total}] "
                    f"{rate:.1f} files/sec  ETA: {eta:.0f}s  "
                    f"failed: {len(failures)}",
                    end="\r",
                    flush=True,
                )

            if result.success:
                row = {
                    "audio_id": result.audio_id,
                    "speaker_id": result.speaker_id,
                    "label": result.label,
                    "label_str": result.label_str,
                    "split": result.split,
                }
                for i, name in enumerate(FEATURE_NAMES):
                    row[name] = float(result.features[i])
                new_rows.append(row)
            else:
                failures.append({
                    "audio_id": result.audio_id,
                    "speaker_id": result.speaker_id,
                    "label": result.label,
                    "split": result.split,
                    "error": result.error,
                })

    print()  # newline after progress
    elapsed = time.perf_counter() - t0
    logger.info(
        "Extraction complete: %d success, %d failed in %.1fs (%.1f files/sec)",
        len(new_rows), len(failures), elapsed,
        len(pending) / elapsed if elapsed > 0 else 0,
    )

    # Merge existing + new rows
    all_rows = existing_rows + new_rows
    df = pd.DataFrame(all_rows)

    if df.empty:
        raise RuntimeError("No features extracted successfully. Cannot continue.")

    # Check for duplicates
    dup = df["audio_id"].duplicated().sum()
    if dup > 0:
        logger.warning("Found %d duplicate audio_id entries — keeping first occurrence.", dup)
        df = df.drop_duplicates(subset="audio_id", keep="first")

    # Save to Parquet
    df.to_parquet(out_path, index=False, compression="snappy")
    logger.info("Saved feature dataset to %s (%d rows)", out_path, len(df))

    return df, failures
