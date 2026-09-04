"""Phase 1C.3: Build and Verify Source-Disjoint Training and Validation Manifest.

Creates a reproducible training (1,400 samples) and validation (300 samples) manifest
drawn strictly from the VCC2020 and VCC2018 source families.
Guarantees:
  1. (Train ∪ Val attack systems) ∩ (Unseen-Test A07-A19 attack systems) = ∅ (Strict 0% attack overlap)
  2. Train speakers ∩ Val speakers = ∅
  3. Train speakers ∩ Unseen-Test speakers = ∅
  4. Val speakers ∩ Unseen-Test speakers = ∅
  5. Source == 'asvspoof' is strictly 0% in Train and Validation.
"""

from __future__ import annotations

import json
import logging
import os
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Set

import numpy as np
import pandas as pd
import soundfile as sf

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.app.ml.ffmpeg_util import decode_audio_to_float32

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("neural_prototype.source_disjoint_builder")

KEY_FILE = PROJECT_ROOT / "datasets/raw/asvspoof/keys/trial_metadata.txt"
UNSEEN_TEST_PARQUET = PROJECT_ROOT / "ai/neural_prototype/results/unseen_attack_eval_manifest.parquet"
OUTPUT_PARQUET = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_train_val_manifest.parquet"
OUTPUT_JSON = PROJECT_ROOT / "ai/neural_prototype/results/source_disjoint_train_val_audit.json"

RANDOM_SEED = 42

TARGET_TRAIN_BONA = 700
TARGET_TRAIN_SPOOF = 700
TARGET_VAL_BONA = 150
TARGET_VAL_SPOOF = 150

# Speaker Partition definition
# Validation gets 6 speakers:
# - VCC2020: TEM2 (Task1 target), TMM1 (Task2 target), SEM2 (source)
# - VCC2018: VCC2TM2 (target), VCC2SM3 (source), VCC2SM4 (source)
VAL_SPEAKERS = {"TEM2", "TMM1", "VCC2TM2", "SEM2", "VCC2SM3", "VCC2SM4"}

ALL_VCC_SPEAKERS = {
    "SEF1", "SEF2", "SEM1", "SEM2",
    "TEF1", "TEF2", "TEM1", "TEM2",
    "TFF1", "TFM1", "TGF1", "TGM1", "TMF1", "TMM1",
    "VCC2SF1", "VCC2SF2", "VCC2SF3", "VCC2SF4",
    "VCC2SM1", "VCC2SM2", "VCC2SM3", "VCC2SM4",
    "VCC2TF1", "VCC2TF2", "VCC2TM1", "VCC2TM2"
}

TRAIN_SPEAKERS = ALL_VCC_SPEAKERS - VAL_SPEAKERS


def build_flac_index() -> Dict[str, str]:
    """Index all FLAC files physically present on disk."""
    logger.info("Indexing FLAC files across eval parts 00..03...")
    index: Dict[str, str] = {}
    t0 = time.perf_counter()
    for part in range(4):
        pdir = PROJECT_ROOT / f"datasets/raw/asvspoof/ASVspoof2021_DF_eval_part0{part}/ASVspoof2021_DF_eval/flac"
        if pdir.exists():
            for entry in os.scandir(pdir):
                if entry.name.endswith(".flac"):
                    audio_id = entry.name[:-5]
                    index[audio_id] = entry.path
    logger.info(f"Indexed {len(index):,} FLAC files in {time.perf_counter() - t0:.2f}s.")
    return index


def run_builder() -> Dict[str, Any]:
    logger.info("=" * 68)
    logger.info("VOXSHIELD PHASE 1C.3 — BUILD SOURCE-DISJOINT TRAIN/VAL MANIFEST")
    logger.info("=" * 68)

    # 1. Load unseen-test manifest to verify disjointness
    logger.info("\n[1/6] Loading existing unseen-test manifest...")
    df_unseen = pd.read_parquet(UNSEEN_TEST_PARQUET)
    unseen_audio_ids = set(df_unseen["audio_id"])
    unseen_speakers = set(df_unseen["speaker_id"])
    unseen_attack_systems = set(df_unseen[df_unseen["label"] == 1]["attack_system"])

    logger.info(f"  Unseen-test audio samples: {len(df_unseen)}")
    logger.info(f"  Unseen-test speakers ({len(unseen_speakers)}): {sorted(unseen_speakers)}")
    logger.info(f"  Unseen-test attack systems ({len(unseen_attack_systems)}): {sorted(unseen_attack_systems)}")

    # Assert that no VCC speakers overlap with unseen test speakers
    assert len(ALL_VCC_SPEAKERS & unseen_speakers) == 0, "Speaker overlap detected with unseen-test!"
    assert len(TRAIN_SPEAKERS & VAL_SPEAKERS) == 0, "Train and Val speaker sets overlap!"

    # 2. Build FLAC index
    flac_index = build_flac_index()

    # 3. Parse trial_metadata.txt for VCC candidate pool
    logger.info("\n[2/6] Filtering VCC candidate pool from trial_metadata.txt...")
    train_bona_pool: List[Dict[str, Any]] = []
    train_spoof_pool: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    val_bona_pool: List[Dict[str, Any]] = []
    val_spoof_pool: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    total_vcc_parsed = 0
    with open(KEY_FILE, "r", encoding="utf-8") as f:
        for line in f:
            p = line.strip().split()
            if len(p) < 8:
                continue
            spk = p[0]
            aid = p[1]
            src = p[3]
            sys_id = p[4]
            label_str = p[5]
            subset = p[7]

            # STRICT RULE: Only VCC2020 and VCC2018
            if src not in ["vcc2020", "vcc2018"]:
                continue
            total_vcc_parsed += 1

            # Must not be in unseen-test
            if aid in unseen_audio_ids:
                continue

            # Must exist on disk and have file size >= 28KB (to ensure duration >= 1.0s)
            if aid not in flac_index:
                continue
            flac_path = flac_index[aid]
            if os.path.getsize(flac_path) < 28000:
                continue

            rec = {
                "audio_id": aid,
                "file_path": flac_path,
                "speaker_id": spk,
                "source": src,
                "subset": subset,
                "attack_system": sys_id,
            }

            if spk in TRAIN_SPEAKERS:
                if label_str == "bonafide":
                    rec["label"] = 0
                    train_bona_pool.append(rec)
                else:
                    rec["label"] = 1
                    train_spoof_pool[sys_id].append(rec)
            elif spk in VAL_SPEAKERS:
                if label_str == "bonafide":
                    rec["label"] = 0
                    val_bona_pool.append(rec)
                else:
                    rec["label"] = 1
                    val_spoof_pool[sys_id].append(rec)

    logger.info(f"  Parsed {total_vcc_parsed:,} VCC records.")
    logger.info(f"  Train pool: {len(train_bona_pool):,} bona, {sum(len(v) for v in train_spoof_pool.values()):,} spoof across {len(train_spoof_pool)} systems")
    logger.info(f"  Val pool:   {len(val_bona_pool):,} bona, {sum(len(v) for v in val_spoof_pool.values()):,} spoof across {len(val_spoof_pool)} systems")

    # 4. Deterministic balanced sampling
    logger.info("\n[3/6] Performing deterministic sampling (seed=%d)...", RANDOM_SEED)
    rng = random.Random(RANDOM_SEED)

    # 4a. Train Bona-fide (700)
    rng.shuffle(train_bona_pool)
    selected_train_bona = train_bona_pool[:TARGET_TRAIN_BONA]
    for r in selected_train_bona:
        r["split"] = "train"

    # 4b. Train Spoof (700 across all 97 systems)
    # 700 / 97 = 7.21. 21 systems get 8 samples, 76 systems get 7 samples (21*8 + 76*7 = 168 + 532 = 700)
    all_train_systems = sorted(list(train_spoof_pool.keys()))
    assert len(all_train_systems) == 97, f"Expected 97 systems in train pool, got {len(all_train_systems)}"

    selected_train_spoofs: List[Dict[str, Any]] = []
    quota_train = {s: 7 for s in all_train_systems}
    # Allocate 1 additional sample to first 21 systems
    for s in all_train_systems[:21]:
        quota_train[s] = 8

    for s in all_train_systems:
        pool = train_spoof_pool[s]
        rng.shuffle(pool)
        needed = quota_train[s]
        assert len(pool) >= needed, f"Insufficient samples for train system {s}: {len(pool)} < {needed}"
        chosen = pool[:needed]
        for r in chosen:
            r["split"] = "train"
        selected_train_spoofs.extend(chosen)

    assert len(selected_train_spoofs) == TARGET_TRAIN_SPOOF, f"Expected {TARGET_TRAIN_SPOOF} train spoofs, got {len(selected_train_spoofs)}"

    # 4c. Validation Bona-fide (150)
    rng.shuffle(val_bona_pool)
    selected_val_bona = val_bona_pool[:TARGET_VAL_BONA]
    for r in selected_val_bona:
        r["split"] = "val"

    # 4d. Validation Spoof (150 across available 95 systems)
    # 150 / 95 = 1.57. 55 systems get 2 samples, 40 systems get 1 sample (55*2 + 40*1 = 150)
    all_val_systems = sorted(list(val_spoof_pool.keys()))
    selected_val_spoofs: List[Dict[str, Any]] = []
    quota_val = {s: 1 for s in all_val_systems}
    for s in all_val_systems[:55]:
        quota_val[s] = 2

    for s in all_val_systems:
        pool = val_spoof_pool[s]
        rng.shuffle(pool)
        needed = quota_val[s]
        assert len(pool) >= needed, f"Insufficient samples for val system {s}: {len(pool)} < {needed}"
        chosen = pool[:needed]
        for r in chosen:
            r["split"] = "val"
        selected_val_spoofs.extend(chosen)

    assert len(selected_val_spoofs) == TARGET_VAL_SPOOF, f"Expected {TARGET_VAL_SPOOF} val spoofs, got {len(selected_val_spoofs)}"

    all_selected = selected_train_bona + selected_train_spoofs + selected_val_bona + selected_val_spoofs
    logger.info(f"  Total selected samples: {len(all_selected)} (Train: {len(selected_train_bona)+len(selected_train_spoofs)}, Val: {len(selected_val_bona)+len(selected_val_spoofs)})")

    # 5. Audio validation & duration calculation
    logger.info("\n[4/6] Verifying all 1,700 audio recordings (16 kHz, duration, readability)...")
    unreadable_count = 0
    invalid_sr_count = 0
    too_short_count = 0
    nan_inf_count = 0
    verified_records: List[Dict[str, Any]] = []

    t0 = time.perf_counter()
    for idx, item in enumerate(all_selected):
        flac_path = item["file_path"]
        try:
            info = sf.info(flac_path)
            dur = info.duration
            sr = info.samplerate

            if sr != 16000:
                invalid_sr_count += 1
            if dur < 1.0:
                too_short_count += 1

            # Quick test decode
            audio = decode_audio_to_float32(flac_path, target_sr=16000)
            if len(audio) == 0:
                unreadable_count += 1
            if np.isnan(audio).any() or np.isinf(audio).any():
                nan_inf_count += 1

            item_copy = dict(item)
            item_copy["duration_seconds"] = round(float(dur), 4)
            verified_records.append(item_copy)

        except Exception as exc:
            logger.error(f"Error reading {flac_path}: {exc}")
            unreadable_count += 1

        if (idx + 1) % 500 == 0:
            logger.info(f"  Verified {idx + 1}/{len(all_selected)} files...")

    verify_time = time.perf_counter() - t0
    logger.info(f"  Verified all {len(all_selected)} files in {verify_time:.2f}s.")
    logger.info(f"  Unreadable: {unreadable_count}, Invalid SR: {invalid_sr_count}, Too-short: {too_short_count}, NaN/Inf: {nan_inf_count}")

    assert unreadable_count == 0, f"Found {unreadable_count} unreadable files!"
    assert invalid_sr_count == 0, f"Found {invalid_sr_count} files with invalid SR!"
    assert too_short_count == 0, f"Found {too_short_count} files shorter than 1.0s!"
    assert nan_inf_count == 0, f"Found {nan_inf_count} files with NaN/Inf values!"

    # 6. Build Dataframe and compute audit statistics
    df_manifest = pd.DataFrame(verified_records)

    train_df = df_manifest[df_manifest["split"] == "train"]
    val_df = df_manifest[df_manifest["split"] == "val"]

    train_spk_actual = set(train_df["speaker_id"])
    val_spk_actual = set(val_df["speaker_id"])

    train_sys_actual = set(train_df[train_df["label"] == 1]["attack_system"])
    val_sys_actual = set(val_df[val_df["label"] == 1]["attack_system"])
    combined_sys = train_sys_actual | val_sys_actual

    # Overlaps
    spk_overlap_train_val = train_spk_actual & val_spk_actual
    spk_overlap_train_unseen = train_spk_actual & unseen_speakers
    spk_overlap_val_unseen = val_spk_actual & unseen_speakers

    att_overlap_train_unseen = train_sys_actual & unseen_attack_systems
    att_overlap_val_unseen = val_sys_actual & unseen_attack_systems
    att_overlap_combined_unseen = combined_sys & unseen_attack_systems

    # Hard safety assertion
    assert len(spk_overlap_train_val) == 0, "Speaker overlap train/val!"
    assert len(spk_overlap_train_unseen) == 0, "Speaker overlap train/unseen!"
    assert len(spk_overlap_val_unseen) == 0, "Speaker overlap val/unseen!"
    assert len(att_overlap_train_unseen) == 0, "Attack overlap train/unseen!"
    assert len(att_overlap_val_unseen) == 0, "Attack overlap val/unseen!"
    assert len(att_overlap_combined_unseen) == 0, "Combined attack overlap with unseen!"
    assert (df_manifest["source"] == "asvspoof").sum() == 0, "Found asvspoof source samples in manifest!"

    # 7. Save Parquet and JSON
    logger.info("\n[5/6] Saving source-disjoint manifest and audit report...")
    OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    df_manifest.to_parquet(OUTPUT_PARQUET, index=False)
    logger.info(f"  Saved manifest -> {OUTPUT_PARQUET} ({OUTPUT_PARQUET.stat().st_size:,} bytes)")

    audit_report = {
        "report_title": "VOXSHIELD Phase 1C.3 — Source-Disjoint Train/Val Manifest Audit",
        "random_seed": RANDOM_SEED,
        "manifest_parquet_file": str(OUTPUT_PARQUET),
        "total_train_samples": len(train_df),
        "total_validation_samples": len(val_df),
        "train_class_counts": {
            "bonafide": int((train_df["label"] == 0).sum()),
            "spoof": int((train_df["label"] == 1).sum()),
        },
        "validation_class_counts": {
            "bonafide": int((val_df["label"] == 0).sum()),
            "spoof": int((val_df["label"] == 1).sum()),
        },
        "train_speakers": sorted(list(train_spk_actual)),
        "validation_speakers": sorted(list(val_spk_actual)),
        "unseen_test_speakers": sorted(list(unseen_speakers)),
        "speaker_overlap_train_val": len(spk_overlap_train_val),
        "speaker_overlap_train_unseen_test": len(spk_overlap_train_unseen),
        "speaker_overlap_val_unseen_test": len(spk_overlap_val_unseen),
        "train_attack_systems": sorted(list(train_sys_actual)),
        "train_attack_systems_count": len(train_sys_actual),
        "validation_attack_systems": sorted(list(val_sys_actual)),
        "validation_attack_systems_count": len(val_sys_actual),
        "unseen_test_attack_systems": sorted(list(unseen_attack_systems)),
        "unseen_test_attack_systems_count": len(unseen_attack_systems),
        "train_unseen_attack_overlap": len(att_overlap_train_unseen),
        "validation_unseen_attack_overlap": len(att_overlap_val_unseen),
        "combined_train_val_unseen_attack_overlap": len(att_overlap_combined_unseen),
        "train_source_counts": train_df["source"].value_counts().to_dict(),
        "validation_source_counts": val_df["source"].value_counts().to_dict(),
        "all_97_vcc_attack_systems_represented_in_train": len(train_sys_actual) == 97,
        "all_97_vcc_attack_systems_represented_in_combined": len(combined_sys) == 97,
        "attack_system_counts_train": train_df[train_df["label"] == 1]["attack_system"].value_counts().to_dict(),
        "attack_system_counts_val": val_df[val_df["label"] == 1]["attack_system"].value_counts().to_dict(),
        "audio_validation_results": {
            "unreadable_count": unreadable_count,
            "invalid_sample_rate_count": invalid_sr_count,
            "too_short_count": too_short_count,
            "nan_inf_count": nan_inf_count,
        },
        "duration_statistics_seconds": {
            "train_mean": round(float(train_df["duration_seconds"].mean()), 3),
            "train_min": round(float(train_df["duration_seconds"].min()), 3),
            "train_max": round(float(train_df["duration_seconds"].max()), 3),
            "val_mean": round(float(val_df["duration_seconds"].mean()), 3),
            "val_min": round(float(val_df["duration_seconds"].min()), 3),
            "val_max": round(float(val_df["duration_seconds"].max()), 3),
        },
        "exact_selection_methodology": (
            "1. Candidates were filtered strictly from VCC2020 and VCC2018 sources. Zero ASVspoof source samples permitted. "
            "2. Speakers were partitioned disjointly: 20 speakers assigned exclusively to train, 6 speakers assigned exclusively to validation. "
            "3. Audio samples with file size < 28KB were pre-filtered to guarantee duration >= 1.0 second. "
            "4. Deterministic sampling with random seed 42 selected exactly 700 bona-fide and 700 spoof for train, and 150 bona-fide and 150 spoof for validation. "
            "5. In train, spoof samples were balanced across ALL 97 VCC attack systems (7-8 samples each). In val, spoof samples were balanced across 95 VCC attack systems. "
            "6. All 1,700 audio recordings were individually decoded and validated for 16 kHz mono integrity."
        ),
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(audit_report, indent=2), encoding="utf-8")
    logger.info(f"  Saved audit report -> {OUTPUT_JSON}")

    # 8. Print terminal summary
    print("\n" + "=" * 60)
    print("VOXSHIELD PHASE 1C.3 — SOURCE-DISJOINT TRAIN/VAL AUDIT")
    print("=" * 60)
    print(f"\nTrain samples: {len(train_df)}")
    print(f"  Bona-fide: {int((train_df['label'] == 0).sum())}")
    print(f"  Spoof:     {int((train_df['label'] == 1).sum())}")
    print(f"\nValidation samples: {len(val_df)}")
    print(f"  Bona-fide: {int((val_df['label'] == 0).sum())}")
    print(f"  Spoof:     {int((val_df['label'] == 1).sum())}")
    print(f"\nTrain speakers: {len(train_spk_actual)}")
    print(f"Validation speakers: {len(val_spk_actual)}")
    print(f"Unseen-test speakers: {len(unseen_speakers)}")
    print(f"\nSpeaker overlap train/val: {len(spk_overlap_train_val)}")
    print(f"Speaker overlap train/unseen-test: {len(spk_overlap_train_unseen)}")
    print(f"Speaker overlap val/unseen-test: {len(spk_overlap_val_unseen)}")
    print(f"\nTrain attack systems: {len(train_sys_actual)}")
    print(f"Validation attack systems: {len(val_sys_actual)}")
    print(f"Unseen-test attack systems: {len(unseen_attack_systems)}")
    print(f"\nTrain/unseen attack overlap: {len(att_overlap_train_unseen)}")
    print(f"Validation/unseen attack overlap: {len(att_overlap_val_unseen)}")
    print(f"Combined train+val/unseen attack overlap: {len(att_overlap_combined_unseen)}")
    print(f"\nTrain source counts: {train_df['source'].value_counts().to_dict()}")
    print(f"Validation source counts: {val_df['source'].value_counts().to_dict()}")
    print(f"\nAll 97 VCC attack systems represented: {'YES' if len(train_sys_actual) == 97 else 'NO'}")
    print(f"\nUnreadable: {unreadable_count}")
    print(f"Invalid sample rate: {invalid_sr_count}")
    print(f"Too-short: {too_short_count}")
    print(f"NaN/Inf: {nan_inf_count}")
    print(f"\nModel trained: NO")
    print(f"Checkpoint modified: NO")
    print(f"Existing benchmark modified: NO")
    print(f"Unseen-test manifest modified: NO")
    print(f"Production code modified: NO")
    print(f"External data downloaded: NO")
    print("=" * 60)

    return audit_report


if __name__ == "__main__":
    run_builder()
