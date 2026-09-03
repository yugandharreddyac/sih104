"""VOXSHIELD — IndicVoices Direct Downloader
Safe, resumable downloader for AI4Bharat IndicVoices dataset from Hugging Face.

Languages supported:
- Hindi          -> hi
- Indian English -> en-IN  (Note: IndicVoices covers 22 Scheduled Indian languages; en-IN is flagged as unavailable)
- Telugu         -> te
- Tamil          -> ta
- Malayalam      -> ml
- Kannada        -> kn

Safety guarantees:
- Never downloads without explicit confirmation ("CONFIRM DOWNLOAD").
- Never uses streaming=True for actual download.
- Resumable: skips verified existing files, replaces corrupted files.
- Preserves metadata alongside audio.
- Audio is saved as standard WAV/FLAC files in datasets/raw/indicvoices/<lang_code>/.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
_SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = _SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ---------------------------------------------------------------------------
# Configuration & Language Mappings
# ---------------------------------------------------------------------------
DEFAULT_REPO = "ai4bharat/IndicVoices"
ALTERNATIVE_REPO = "ai4bharat/indicvoices_r"

# Mapping from target language to config names in both repo formats
LANGUAGE_TARGETS: Dict[str, Dict[str, Any]] = {
    "hi": {
        "display_name": "Hindi",
        "code": "hi",
        "config_indicvoices": "hindi",
        "config_indicvoices_r": "Hindi",
        "preferred_split_indicvoices": "valid",
        "preferred_split_indicvoices_r": "test",
        "available_in_indicvoices": True,
    },
    "en-IN": {
        "display_name": "Indian English",
        "code": "en-IN",
        "config_indicvoices": None,
        "config_indicvoices_r": None,
        "preferred_split_indicvoices": None,
        "preferred_split_indicvoices_r": None,
        "available_in_indicvoices": False,
        "note": "Not available in official AI4Bharat IndicVoices (which covers 22 Scheduled Indian languages only)",
    },
    "te": {
        "display_name": "Telugu",
        "code": "te",
        "config_indicvoices": "telugu",
        "config_indicvoices_r": "Telugu",
        "preferred_split_indicvoices": "valid",
        "preferred_split_indicvoices_r": "test",
        "available_in_indicvoices": True,
    },
    "ta": {
        "display_name": "Tamil",
        "code": "ta",
        "config_indicvoices": "tamil",
        "config_indicvoices_r": "Tamil",
        "preferred_split_indicvoices": "valid",
        "preferred_split_indicvoices_r": "test",
        "available_in_indicvoices": True,
    },
    "ml": {
        "display_name": "Malayalam",
        "code": "ml",
        "config_indicvoices": "malayalam",
        "config_indicvoices_r": "Malayalam",
        "preferred_split_indicvoices": "valid",
        "preferred_split_indicvoices_r": "test",
        "available_in_indicvoices": True,
    },
    "kn": {
        "display_name": "Kannada",
        "code": "kn",
        "config_indicvoices": "kannada",
        "config_indicvoices_r": "Kannada",
        "preferred_split_indicvoices": "valid",
        "preferred_split_indicvoices_r": "test",
        "available_in_indicvoices": True,
    },
}

# Known metadata sample counts & bytes from Hugging Face dataset cards
KNOWN_DATASET_INFO: Dict[str, Dict[str, Dict[str, Dict[str, Any]]]] = {
    "ai4bharat/IndicVoices": {
        "hindi": {"valid": {"num_examples": 5530, "num_bytes": 462713983}, "train": {"num_examples": 445160, "num_bytes": 40537736691}},
        "telugu": {"valid": {"num_examples": 3295, "num_bytes": 231498307}, "train": {"num_examples": 269306, "num_bytes": 30426152574}},
        "tamil": {"valid": {"num_examples": 5276, "num_bytes": 553418831}, "train": {"num_examples": 422963, "num_bytes": 58606318877}},
        "malayalam": {"valid": {"num_examples": 4524, "num_bytes": 549094992}, "train": {"num_examples": 339508, "num_bytes": 38973079431}},
        "kannada": {"valid": {"num_examples": 4126, "num_bytes": 507597548}, "train": {"num_examples": 313221, "num_bytes": 43997335033}},
    },
    "ai4bharat/indicvoices_r": {
        "Hindi": {"test": {"num_examples": 376, "num_bytes": 634066169}, "train": {"num_examples": 26318, "num_bytes": 49253683927}},
        "Telugu": {"test": {"num_examples": 339, "num_bytes": 616485791}, "train": {"num_examples": 47208, "num_bytes": 92460055349}},
        "Tamil": {"test": {"num_examples": 293, "num_bytes": 499088144}, "train": {"num_examples": 39292, "num_bytes": 68139171799}},
        "Malayalam": {"test": {"num_examples": 397, "num_bytes": 621717372}, "train": {"num_examples": 31106, "num_bytes": 57312827276}},
        "Kannada": {"test": {"num_examples": 342, "num_bytes": 620186097}, "train": {"num_examples": 16986, "num_bytes": 30237369216}},
    },
}

# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------
def format_bytes(n_bytes: float) -> str:
    """Format bytes to human readable string."""
    if n_bytes < 1024:
        return f"{n_bytes:.0f} B"
    elif n_bytes < 1024 ** 2:
        return f"{n_bytes / 1024:.1f} KB"
    elif n_bytes < 1024 ** 3:
        return f"{n_bytes / (1024 ** 2):.1f} MB"
    else:
        return f"{n_bytes / (1024 ** 3):.2f} GB"


def compute_sha256(data_bytes: bytes) -> str:
    """Compute SHA-256 hex digest of raw bytes."""
    return hashlib.sha256(data_bytes).hexdigest()


def verify_audio_file(file_path: Path) -> bool:
    """Check if file exists, is non-empty, and can be read by soundfile."""
    if not file_path.exists() or file_path.stat().st_size == 0:
        return False
    try:
        import soundfile as sf
        info = sf.info(str(file_path))
        return info.samplerate > 0 and info.frames > 0
    except Exception:
        return False


def get_download_plan(
    repo_id: str = DEFAULT_REPO,
    samples_per_lang: int = 1000,
) -> Dict[str, Any]:
    """Calculate download plan and estimated sizes for all six languages."""
    plan: Dict[str, Any] = {
        "repo_id": repo_id,
        "samples_per_lang": samples_per_lang,
        "languages": {},
        "total_selected_samples": 0,
        "total_estimated_bytes": 0.0,
    }

    known_repo_info = KNOWN_DATASET_INFO.get(repo_id, {})
    is_indicvoices_r = "indicvoices_r" in repo_id.lower()

    for lang_key, target in LANGUAGE_TARGETS.items():
        lang_name = target["display_name"]
        lang_code = target["code"]

        if not target["available_in_indicvoices"]:
            plan["languages"][lang_key] = {
                "name": lang_name,
                "code": lang_code,
                "config": "N/A",
                "split": "N/A",
                "available_samples": 0,
                "selected_samples": 0,
                "estimated_bytes": 0.0,
                "status": "UNAVAILABLE",
                "note": target.get("note", "Not present in dataset"),
            }
            continue

        config_name = target["config_indicvoices_r"] if is_indicvoices_r else target["config_indicvoices"]
        preferred_split = target["preferred_split_indicvoices_r"] if is_indicvoices_r else target["preferred_split_indicvoices"]

        config_info = known_repo_info.get(config_name, {})
        split_info = config_info.get(preferred_split, {})

        num_available = split_info.get("num_examples", 0)
        num_bytes = split_info.get("num_bytes", 0.0)

        # If available in preferred split is smaller than requested, use available
        selected = min(samples_per_lang, num_available) if num_available > 0 else 0

        # Estimate bytes proportionally
        est_bytes = (num_bytes / num_available * selected) if num_available > 0 else 0.0

        plan["languages"][lang_key] = {
            "name": lang_name,
            "code": lang_code,
            "config": config_name,
            "split": preferred_split,
            "available_samples": num_available,
            "selected_samples": selected,
            "estimated_bytes": est_bytes,
            "status": "READY",
            "note": None,
        }

        plan["total_selected_samples"] += selected
        plan["total_estimated_bytes"] += est_bytes

    return plan


def print_download_plan(plan: Dict[str, Any]) -> None:
    """Print standard formatted download plan."""
    print("=" * 60)
    print("INDICVOICES DOWNLOAD PLAN")
    print(f"Repository: {plan['repo_id']}")
    print("=" * 60)

    for lang_key, info in plan["languages"].items():
        print(f"\n{info['name']} ({info['code']}):")
        print(f"  Configuration:     {info['config']}")
        print(f"  Split:             {info['split']}")
        print(f"  Available Samples: {info['available_samples']}")
        print(f"  Selected Samples:  {info['selected_samples']}")
        if info["estimated_bytes"] > 0:
            print(f"  Estimated size:    {format_bytes(info['estimated_bytes'])}")
        else:
            print(f"  Estimated size:    {format_bytes(0)} ({info['status']})")
        if info.get("note"):
            print(f"  Note:              {info['note']}")

    print("\n" + "-" * 60)
    print(f"TOTAL SAMPLES:           {plan['total_selected_samples']}")
    print(f"TOTAL ESTIMATED STORAGE: {format_bytes(plan['total_estimated_bytes'])}")
    print("-" * 60)


# ---------------------------------------------------------------------------
# Downloader Implementation
# ---------------------------------------------------------------------------
def download_language_subset(
    lang_info: Dict[str, Any],
    repo_id: str,
    output_base_dir: Path,
    target_count: int,
) -> Dict[str, Any]:
    """Download a subset of audio files for a single language."""
    from datasets import load_dataset
    import soundfile as sf

    lang_code = lang_info["code"]
    lang_name = lang_info["name"]
    config_name = lang_info["config"]
    split_name = lang_info["split"]

    stats = {
        "language": lang_name,
        "config": config_name,
        "requested": target_count,
        "downloaded": 0,
        "skipped": 0,
        "failed": 0,
        "bytes_written": 0,
    }

    if not lang_info.get("available_samples") or target_count <= 0:
        print(f"  [SKIPPED] {lang_name} ({lang_code}) is not available or has 0 selected samples.")
        return stats

    lang_dir = output_base_dir / lang_code
    lang_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = lang_dir / "metadata.jsonl"

    # Load existing manifest for resumability
    existing_records: Dict[str, Dict[str, Any]] = {}
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        rec = json.loads(line)
                        fpath = rec.get("file_path")
                        if fpath and Path(fpath).exists() and verify_audio_file(Path(fpath)):
                            item_id = rec.get("id") or Path(fpath).stem
                            existing_records[item_id] = rec
        except Exception as e:
            print(f"  [WARN] Failed to read existing manifest: {e}")

    print(f"  Loading dataset configuration '{config_name}', split '{split_name}'...")
    try:
        # Load dataset without streaming
        ds = load_dataset(repo_id, config_name, split=split_name)
    except Exception as e:
        print(f"  [ERROR] Failed to load dataset {repo_id}/{config_name}: {e}")
        stats["failed"] = target_count
        return stats

    total_in_ds = len(ds)
    limit = min(target_count, total_in_ds)

    print(f"  Processing {limit} samples for {lang_name}...")

    manifest_file = open(manifest_path, "a", encoding="utf-8")

    try:
        for idx in range(limit):
            item = ds[idx]

            # Generate stable ID
            item_id = str(item.get("id") or f"{lang_code}_{idx:06d}")
            audio_field = item.get("audio") or item.get("audio_filepath")

            out_filename = f"{item_id}.wav"
            out_filepath = lang_dir / out_filename

            # Check resumability
            if item_id in existing_records and verify_audio_file(out_filepath):
                stats["skipped"] += 1
                if idx % 100 == 0 or idx == limit - 1:
                    print(f"    [{idx+1}/{limit}] Downloading... (Completed: {stats['downloaded']}, Skipped: {stats['skipped']}, Failed: {stats['failed']})", end="\r")
                continue

            try:
                # Extract audio
                if isinstance(audio_field, dict):
                    audio_bytes = audio_field.get("bytes")
                    audio_array = audio_field.get("array")
                    sr = audio_field.get("sampling_rate", 16000)

                    if audio_bytes:
                        with open(out_filepath, "wb") as af:
                            af.write(audio_bytes)
                    elif audio_array is not None:
                        sf.write(str(out_filepath), audio_array, sr)
                    else:
                        raise ValueError("No audio bytes or array found in item")
                elif isinstance(audio_field, str) and Path(audio_field).exists():
                    with open(audio_field, "rb") as src, open(out_filepath, "wb") as dst:
                        dst.write(src.read())
                else:
                    raise ValueError(f"Unrecognized audio field format: {type(audio_field)}")

                # Validate downloaded file
                if not verify_audio_file(out_filepath):
                    raise ValueError("Downloaded file failed soundfile verification")

                file_size = out_filepath.stat().st_size
                stats["downloaded"] += 1
                stats["bytes_written"] += file_size

                # Extract and record metadata
                info_sf = sf.info(str(out_filepath))
                meta_record = {
                    "id": item_id,
                    "file_path": str(out_filepath.resolve()),
                    "language": lang_name,
                    "language_code": lang_code,
                    "speaker_id": item.get("speaker_id"),
                    "gender": item.get("gender"),
                    "age_group": item.get("age_group"),
                    "district": item.get("district"),
                    "state": item.get("state"),
                    "text": item.get("text") or item.get("normalized") or item.get("verbatim"),
                    "duration_seconds": info_sf.duration,
                    "sample_rate": info_sf.samplerate,
                    "channels": info_sf.channels,
                    "file_size_bytes": file_size,
                    "checksum": compute_sha256(out_filepath.read_bytes()),
                }
                manifest_file.write(json.dumps(meta_record, ensure_ascii=False) + "\n")
                manifest_file.flush()

            except Exception as item_err:
                stats["failed"] += 1
                if out_filepath.exists():
                    try:
                        out_filepath.unlink()
                    except Exception:
                        pass
                print(f"\n    [WARN] Failed sample {item_id}: {item_err}")

            if (idx + 1) % 50 == 0 or idx == limit - 1:
                print(f"    [{idx+1}/{limit}] Progress: {stats['downloaded']} downloaded, {stats['skipped']} skipped, {stats['failed']} failed", end="\r")

    finally:
        manifest_file.close()

    print(f"\n  [DONE] {lang_name}: {stats['downloaded']} downloaded, {stats['skipped']} skipped, {stats['failed']} failed ({format_bytes(stats['bytes_written'])})")
    return stats


def run_download(
    repo_id: str = DEFAULT_REPO,
    samples_per_lang: int = 1000,
    output_base: Optional[str] = None,
) -> int:
    """Execute complete download across all six target languages."""
    base_dir = Path(output_base) if output_base else PROJECT_ROOT / "datasets" / "raw" / "indicvoices"
    base_dir.mkdir(parents=True, exist_ok=True)

    plan = get_download_plan(repo_id, samples_per_lang)
    print_download_plan(plan)

    print("\nStarting download...")
    total_stats = []

    for idx, (lang_key, lang_info) in enumerate(plan["languages"].items()):
        print(f"\n[{idx+1}/6] {lang_info['name']}")
        stats = download_language_subset(
            lang_info=lang_info,
            repo_id=repo_id,
            output_base_dir=base_dir,
            target_count=lang_info["selected_samples"],
        )
        total_stats.append(stats)

    # Final summary table
    print("\n" + "=" * 65)
    print("INDICVOICES DOWNLOAD COMPLETE")
    print("=" * 65)
    print(f"{'Language':<16} | {'Config':<10} | {'Requested':<9} | {'Downloaded':<10} | {'Skipped':<7} | {'Failed':<6} | {'Storage'}")
    print("-" * 65)
    tot_dl = 0
    tot_sk = 0
    tot_fl = 0
    tot_bytes = 0

    for s in total_stats:
        print(f"{s['language']:<16} | {str(s['config']):<10} | {s['requested']:<9} | {s['downloaded']:<10} | {s['skipped']:<7} | {s['failed']:<6} | {format_bytes(s['bytes_written'])}")
        tot_dl += s["downloaded"]
        tot_sk += s["skipped"]
        tot_fl += s["failed"]
        tot_bytes += s["bytes_written"]

    print("-" * 65)
    print(f"Total audio files downloaded: {tot_dl}")
    print(f"Total files skipped (existing): {tot_sk}")
    print(f"Total failures:               {tot_fl}")
    print(f"Total storage used:           {format_bytes(tot_bytes)}")
    print(f"Output directory:             {base_dir.resolve()}")
    print("=" * 65)

    return 0


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="VOXSHIELD IndicVoices Downloader — inspects and downloads target language subsets with safety gates."
    )
    parser.add_argument(
        "--repo",
        type=str,
        default=DEFAULT_REPO,
        help=f"Hugging Face repository ID (default: {DEFAULT_REPO})",
    )
    parser.add_argument(
        "--samples-per-lang",
        type=int,
        default=1000,
        help="Target number of clips per language for initial representative subset (default: 1000)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Custom base output directory (default: datasets/raw/indicvoices)",
    )
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="Inspect dataset configurations and display download plan without downloading",
    )
    parser.add_argument(
        "--confirm",
        type=str,
        default=None,
        help="Provide confirmation string directly ('CONFIRM DOWNLOAD')",
    )

    args = parser.parse_args()

    plan = get_download_plan(repo_id=args.repo, samples_per_lang=args.samples_per_lang)

    # If --inspect flag is passed or no confirmation, show plan
    if args.inspect:
        print_download_plan(plan)
        print("\n[INSPECTION ONLY] No files were downloaded.")
        return 0

    print_download_plan(plan)

    # Confirmation Gate
    print("\nReady to download these six languages.")
    print("Type exactly:\n\nCONFIRM DOWNLOAD\n\nto begin.\nOtherwise the program must exit without downloading anything.\n")

    confirmation = args.confirm
    if not confirmation:
        if sys.stdin.isatty():
            try:
                confirmation = input("Enter confirmation: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nAborted.")
                return 1
        else:
            print("[GATE] Non-interactive execution without --confirm 'CONFIRM DOWNLOAD'. Exiting safely without downloading.")
            return 0

    if confirmation != "CONFIRM DOWNLOAD":
        print(f"[GATE REJECTED] Received '{confirmation}', expected exact 'CONFIRM DOWNLOAD'. Exiting safely.")
        return 1

    return run_download(
        repo_id=args.repo,
        samples_per_lang=args.samples_per_lang,
        output_base=args.output_dir,
    )


if __name__ == "__main__":
    sys.exit(main())
