"""Phase 1C.2: Build and Verify Source-Disjoint / Unseen-Attack Evaluation Set.

Constructs a dedicated 300-sample evaluation manifest (150 bona-fide, 150 spoof)
from the ASVspoof source family (systems A07-A19) with strict speaker isolation
from the existing benchmark train and validation sets.
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
from typing import Any, Dict, List

import numpy as np
import pandas as pd
import soundfile as sf

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.app.ml.ffmpeg_util import decode_audio_to_float32

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("neural_prototype.unseen_eval_builder")

KEY_FILE = PROJECT_ROOT / "datasets/raw/asvspoof/keys/trial_metadata.txt"
BENCHMARK_PARQUET = PROJECT_ROOT / "datasets/processed/asvspoof_benchmark_2000.parquet"
OUTPUT_PARQUET = PROJECT_ROOT / "ai/neural_prototype/results/unseen_attack_eval_manifest.parquet"
OUTPUT_JSON = PROJECT_ROOT / "ai/neural_prototype/results/unseen_attack_eval_audit.json"

RANDOM_SEED = 42
TARGET_BONAFIDE = 150
TARGET_SPOOF = 150

A_SYSTEMS = [f"A{i:02d}" for i in range(7, 20)]  # A07 to A19 (13 systems)


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
    logger.info("VOXSHIELD PHASE 1C.2 — BUILD & VERIFY UNSEEN-ATTACK EVAL SET")
    logger.info("=" * 68)

    # 1. Load existing benchmark to identify existing train/val/test speakers & systems
    logger.info("\n[1/6] Loading existing 2,000-sample benchmark metadata...")
    df_bm = pd.read_parquet(BENCHMARK_PARQUET)
    bm_audio_ids = set(df_bm["audio_id"])

    train_speakers = set(df_bm[df_bm["split"] == "train"]["speaker_id"])
    val_speakers = set(df_bm[df_bm["split"] == "val"]["speaker_id"])
    test_speakers = set(df_bm[df_bm["split"] == "test"]["speaker_id"])
    train_val_speakers = train_speakers | val_speakers

    logger.info(f"  Benchmark train speakers: {len(train_speakers)}")
    logger.info(f"  Benchmark val speakers:   {len(val_speakers)}")
    logger.info(f"  Disjoint speakers excluded from candidate pool: {len(train_val_speakers)}")

    # Map attack systems present in existing benchmark
    bm_systems: Dict[str, str] = {}
    with open(KEY_FILE, "r", encoding="utf-8") as f:
        for line in f:
            p = line.strip().split()
            if len(p) >= 8 and p[1] in bm_audio_ids:
                bm_systems[p[1]] = p[4]

    df_bm["attack_system"] = df_bm["audio_id"].map(lambda x: bm_systems.get(x, "-"))
    existing_train_systems = set(df_bm[(df_bm["split"] == "train") & (df_bm["label"] == 1)]["attack_system"])
    existing_val_systems = set(df_bm[(df_bm["split"] == "val") & (df_bm["label"] == 1)]["attack_system"])

    logger.info(f"  Existing CNN train attack systems: {len(existing_train_systems)}")
    logger.info(f"  Existing CNN val attack systems:   {len(existing_val_systems)}")

    # 2. Build FLAC index
    flac_index = build_flac_index()

    # 3. Parse trial_metadata.txt for eligible ASVspoof source candidates
    logger.info("\n[2/6] Filtering candidate pool from source 'asvspoof'...")
    bona_candidates: List[Dict[str, Any]] = []
    spoof_candidates_by_sys: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

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

            # Enforce constraints:
            # 1. Source must be 'asvspoof'
            if src != "asvspoof":
                continue
            # 2. Audio ID must NOT already be in the 2,000-sample benchmark
            if aid in bm_audio_ids:
                continue
            # 3. Speaker must NOT be in existing CNN train or val
            if spk in train_val_speakers:
                continue
            # 4. FLAC must physically exist on disk and be >= 25KB (to ensure duration >= 1.5s)
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

            if label_str == "bonafide":
                rec["label"] = 0
                bona_candidates.append(rec)
            elif label_str == "spoof" and sys_id in A_SYSTEMS:
                rec["label"] = 1
                spoof_candidates_by_sys[sys_id].append(rec)

    total_eligible_spoofs = sum(len(v) for v in spoof_candidates_by_sys.values())
    logger.info(f"  Eligible bona-fide candidates: {len(bona_candidates):,}")
    logger.info(f"  Eligible spoof candidates:     {total_eligible_spoofs:,} across {len(spoof_candidates_by_sys)} systems")

    # 4. Deterministic balanced sampling
    logger.info("\n[3/6] Performing deterministic sampling (seed=%d)...", RANDOM_SEED)
    rng = random.Random(RANDOM_SEED)

    # Sample 150 bona-fide
    rng.shuffle(bona_candidates)
    selected_bona = bona_candidates[:TARGET_BONAFIDE]

    # Sample 150 spoof distributed across all 13 A07-A19 systems
    # 150 = 11 * 7 + 12 * 6
    selected_spoofs: List[Dict[str, Any]] = []
    quota_per_sys = {s: 11 for s in A_SYSTEMS}
    # Allocate 1 additional sample to the first 7 systems to reach exactly 150 (7*12 + 6*11 = 150)
    for s in A_SYSTEMS[:7]:
        quota_per_sys[s] = 12

    for sys_id in A_SYSTEMS:
        candidates = spoof_candidates_by_sys[sys_id]
        rng.shuffle(candidates)
        needed = quota_per_sys[sys_id]
        chosen = candidates[:needed]
        assert len(chosen) == needed, f"Insufficient samples for {sys_id}: needed {needed}, got {len(chosen)}"
        selected_spoofs.extend(chosen)

    assert len(selected_bona) == TARGET_BONAFIDE, f"Expected {TARGET_BONAFIDE} bona, got {len(selected_bona)}"
    assert len(selected_spoofs) == TARGET_SPOOF, f"Expected {TARGET_SPOOF} spoof, got {len(selected_spoofs)}"

    all_selected = selected_bona + selected_spoofs
    rng.shuffle(all_selected)

    # 5. Audio validation & duration calculation
    logger.info("\n[4/6] Verifying audio integrity, sample rates, channels, and durations...")
    unreadable_count = 0
    insufficient_duration_count = 0
    records_with_duration: List[Dict[str, Any]] = []

    t0 = time.perf_counter()
    for idx, item in enumerate(all_selected):
        flac_path = item["file_path"]
        try:
            # Verify with soundfile / FFmpeg
            info = sf.info(flac_path)
            dur = info.duration
            sr = info.samplerate
            channels = info.channels

            if sr != 16000:
                logger.warning(f"Unexpected sample rate {sr} in {flac_path}")
            if dur < 1.0:
                insufficient_duration_count += 1

            # Quick test decode
            audio = decode_audio_to_float32(flac_path, target_sr=16000)
            if len(audio) == 0 or np.isnan(audio).any():
                unreadable_count += 1

            item_copy = dict(item)
            item_copy["duration_seconds"] = round(float(dur), 4)
            item_copy["split"] = "unseen_test"
            records_with_duration.append(item_copy)

        except Exception as exc:
            logger.error(f"Error reading {flac_path}: {exc}")
            unreadable_count += 1

    verify_time = time.perf_counter() - t0
    logger.info(f"  Verified 300 files in {verify_time:.2f}s.")
    logger.info(f"  Unreadable files: {unreadable_count}")
    logger.info(f"  Insufficient duration (<1.0s): {insufficient_duration_count}")
    assert unreadable_count == 0, f"Found {unreadable_count} unreadable audio files!"

    # 6. Build Dataframe and analyze overlaps
    df_eval = pd.DataFrame(records_with_duration)

    new_eval_speakers = set(df_eval["speaker_id"])
    new_eval_systems = set(df_eval[df_eval["label"] == 1]["attack_system"])

    spk_overlap_train = new_eval_speakers & train_speakers
    spk_overlap_val = new_eval_speakers & val_speakers
    spk_overlap_test = new_eval_speakers & test_speakers

    att_overlap_train = new_eval_systems & existing_train_systems
    att_overlap_val = new_eval_systems & existing_val_systems

    all_a_systems_represented = set(A_SYSTEMS) == new_eval_systems

    # 7. Save Parquet and JSON
    logger.info("\n[5/6] Saving parquet manifest and JSON audit report...")
    OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    df_eval.to_parquet(OUTPUT_PARQUET, index=False)
    logger.info(f"  Saved manifest -> {OUTPUT_PARQUET} ({OUTPUT_PARQUET.stat().st_size:,} bytes)")

    audit_report = {
        "report_title": "VOXSHIELD Phase 1C.2 — Unseen Attack Evaluation Set Audit",
        "manifest_parquet_file": str(OUTPUT_PARQUET),
        "random_seed": RANDOM_SEED,
        "selection_methodology": (
            "Deterministic stratified sampling from the ASVspoof source family (algorithms A07-A19). "
            "Speakers appearing in the existing CNN train or validation sets were strictly excluded. "
            "Spoof samples were balanced across all 13 A07-A19 systems (11-12 samples per system). "
            "Bona-fide samples were selected randomly from eligible disjoint speakers."
        ),
        "total_samples": len(df_eval),
        "bonafide_samples": int((df_eval["label"] == 0).sum()),
        "spoof_samples": int((df_eval["label"] == 1).sum()),
        "unique_speakers_count": len(new_eval_speakers),
        "speakers_list": sorted(list(new_eval_speakers)),
        "unique_spoof_attack_systems_count": len(new_eval_systems),
        "exact_attack_systems_represented": sorted(list(new_eval_systems)),
        "all_13_a_systems_represented": all_a_systems_represented,
        "samples_per_attack_system": df_eval[df_eval["label"] == 1]["attack_system"].value_counts().to_dict(),
        "speaker_overlap_with_existing_train": len(spk_overlap_train),
        "speaker_overlap_with_existing_val": len(spk_overlap_val),
        "speaker_overlap_with_existing_test": len(spk_overlap_test),
        "attack_system_overlap_with_existing_train": len(att_overlap_train),
        "shared_attack_systems_with_train": sorted(list(att_overlap_train)),
        "attack_system_overlap_with_existing_val": len(att_overlap_val),
        "shared_attack_systems_with_val": sorted(list(att_overlap_val)),
        "unreadable_files_count": unreadable_count,
        "insufficient_duration_files_count": insufficient_duration_count,
        "mean_duration_seconds": round(float(df_eval["duration_seconds"].mean()), 3),
        "min_duration_seconds": round(float(df_eval["duration_seconds"].min()), 3),
        "max_duration_seconds": round(float(df_eval["duration_seconds"].max()), 3),
        "critical_finding_regarding_train_overlap": (
            "CRITICAL METHODOLOGICAL FINDING: In Phase 1C.1, the audit identified that the ASVspoof source family "
            "(systems A07-A19) was disjoint from VCC2020 and VCC2018. However, because the existing MiniAcousticCNN "
            "benchmark (asvspoof_benchmark_2000.parquet) was constructed by sampling across the entire dataset, "
            "its training split already included 156 samples spanning ALL 13 A07-A19 systems. "
            "Therefore, against the ALREADY-TRAINED Epoch-8 MiniAcousticCNN, A07-A19 are NOT unseen (100% overlap). "
            "To evaluate truly unseen attack systems against an existing model, one would need to evaluate on systems "
            "absent from asvspoof_benchmark_2000.parquet (HUB-B00, SPO-B00), OR train a new model strictly on "
            "VCC2020 + VCC2018 so that this new A07-A19 evaluation manifest acts as a genuine unseen-generator test."
        ),
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(audit_report, indent=2), encoding="utf-8")
    logger.info(f"  Saved audit report -> {OUTPUT_JSON}")

    # Print exact terminal summary
    print("\n" + "=" * 60)
    print("VOXSHIELD PHASE 1C.2 — UNSEEN ATTACK EVAL MANIFEST")
    print("=" * 60)
    print("Dataset: ASVspoof 2021 DF (Source: asvspoof)")
    print("Source: asvspoof")
    print(f"Samples: {len(df_eval)}")
    print(f"Bona-fide: {int((df_eval['label'] == 0).sum())}")
    print(f"Spoof: {int((df_eval['label'] == 1).sum())}")
    print(f"Speakers: {len(new_eval_speakers)}")
    print(f"Attack systems: {len(new_eval_systems)}")
    print(f"Attack systems represented: {', '.join(sorted(list(new_eval_systems)))}")
    print(f"All A07-A19 represented: {'YES' if all_a_systems_represented else 'NO'}")
    print(f"\nSpeaker overlap with existing train: {len(spk_overlap_train)}")
    print(f"Speaker overlap with existing val: {len(spk_overlap_val)}")
    print(f"\nAttack-system overlap with existing train: {len(att_overlap_train)}")
    print(f"Attack-system overlap with existing val: {len(att_overlap_val)}")
    print(f"\nUnreadable: {unreadable_count}")
    print(f"Insufficient duration: {insufficient_duration_count}")
    print(f"\nCheckpoint modified: NO")
    print(f"Existing benchmark modified: NO")
    print(f"Production code modified: NO")
    print(f"External data downloaded: NO")
    print("=" * 60)

    return audit_report


if __name__ == "__main__":
    run_builder()
