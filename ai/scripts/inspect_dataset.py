"""VOXSHIELD Dataset Inspector
Deep-scans a downloaded dataset directory and reports file counts, audio properties,
supported formats, sample rates, channels, estimated durations, and missing metadata.

Does NOT modify, rename, resample, or delete any files.

Usage:
    python ai/scripts/inspect_dataset.py --dataset asvspoof2021
    python ai/scripts/inspect_dataset.py --dataset indicvoices
    python ai/scripts/inspect_dataset.py --dataset indic_parler_tts
    python ai/scripts/inspect_dataset.py --dir datasets/raw/asvspoof2021
    python ai/scripts/inspect_dataset.py --dir datasets/raw --all
    python ai/scripts/inspect_dataset.py --dataset asvspoof2021 --output docs/asvspoof_inspection.md
"""

from __future__ import annotations

import argparse
import sys
import wave
import struct
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
_SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = _SCRIPT_DIR.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if sys.stdout.encoding != "utf-8" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Known dataset configurations
# ---------------------------------------------------------------------------
DATASET_REGISTRY: Dict[str, str] = {
    "asvspoof2021": "datasets/raw/asvspoof2021",
    "indicvoices": "datasets/raw/indicvoices",
    "indic_parler_tts": "datasets/raw/indic_parler_tts",
}

AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".m4a", ".aac"}

KNOWN_PROTOCOL_NAMES = {"trial_metadata.txt", "keys.txt", "protocol.txt", "metadata.csv", "metadata.json"}

EXPECTED_LANGUAGES_INDICVOICES = {"hi", "te", "ta", "bn", "mr", "en", "en-IN"}
EXPECTED_LANGUAGES_PARLER = {"hi", "te", "ta", "bn", "mr", "en", "en-IN"}


# ---------------------------------------------------------------------------
# Audio probing utilities (no external dependencies)
# ---------------------------------------------------------------------------

def _probe_wav(path: Path) -> Optional[Tuple[int, int, float]]:
    """Return (sample_rate, channels, duration_seconds) for a WAV file, or None if unreadable."""
    try:
        with wave.open(str(path), "rb") as wf:
            n_channels = wf.getnchannels()
            sample_rate = wf.getframerate()
            n_frames = wf.getnframes()
            duration = n_frames / float(sample_rate) if sample_rate > 0 else 0.0
            return sample_rate, n_channels, duration
    except Exception:
        return None


def _probe_flac_basic(path: Path) -> Optional[Tuple[int, int, float]]:
    """
    Minimal FLAC header parse to extract sample_rate, channels, duration.
    Reads only the STREAMINFO block — no external library required.
    Returns None if the file is not a valid FLAC or probing fails.
    """
    try:
        with open(str(path), "rb") as f:
            marker = f.read(4)
            if marker != b"fLaC":
                return None
            # Read METADATA_BLOCK_HEADER
            header = f.read(4)
            if len(header) < 4:
                return None
            block_type = header[0] & 0x7F
            block_length = struct.unpack(">I", b"\x00" + header[1:])[0]
            if block_type != 0:  # 0 = STREAMINFO
                return None
            if block_length < 18:
                return None
            data = f.read(block_length)
            if len(data) < 18:
                return None
            # STREAMINFO layout (bits):
            # 0-15: min_block_size (16)
            # 16-31: max_block_size (16)
            # 32-55: min_frame_size (24)
            # 56-79: max_frame_size (24)
            # 80-99: sample_rate (20)
            # 100-102: channels - 1 (3)
            # 103-107: bits per sample - 1 (5)
            # 108-143: total_samples (36)
            # 144-271: MD5 signature (128)
            bits = int.from_bytes(data[:18], "big")
            # Shift to access relevant fields
            # bits 80-99 = sample_rate (in 144-bit number, bit 0 = MSB)
            # total 144 bits - offset 80 = 64 bits from right
            sample_rate = (bits >> (144 - 100)) & 0xFFFFF
            channels = ((bits >> (144 - 103)) & 0x7) + 1
            total_samples = (bits >> (144 - 144)) & 0xFFFFFFFFF
            duration = total_samples / float(sample_rate) if sample_rate > 0 else 0.0
            return sample_rate, channels, duration
    except Exception:
        return None


def _probe_audio(path: Path) -> Optional[Tuple[int, int, float]]:
    """Auto-probe audio file by extension. Returns (sample_rate, channels, duration) or None."""
    ext = path.suffix.lower()
    if ext == ".wav":
        return _probe_wav(path)
    elif ext == ".flac":
        return _probe_flac_basic(path)
    else:
        # For mp3/ogg/m4a — attempt WAV probe as fallback (will usually fail)
        # Report as unprobed rather than error
        return None


def _format_bytes(n_bytes: int) -> str:
    if n_bytes < 1024:
        return f"{n_bytes} B"
    elif n_bytes < 1024 ** 2:
        return f"{n_bytes / 1024:.1f} KB"
    elif n_bytes < 1024 ** 3:
        return f"{n_bytes / 1024 ** 2:.1f} MB"
    else:
        return f"{n_bytes / 1024 ** 3:.2f} GB"


def _format_duration(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    if h > 0:
        return f"{h}h {m}m {s:.1f}s"
    elif m > 0:
        return f"{m}m {s:.1f}s"
    else:
        return f"{s:.2f}s"


# ---------------------------------------------------------------------------
# Core inspection logic
# ---------------------------------------------------------------------------

def inspect_directory(root_dir: Path, dataset_name: str = "unknown", max_probe: int = 500) -> str:
    """
    Scan root_dir for audio files, report:
    - file counts per format
    - sample rate distribution
    - channel distribution
    - estimated total duration
    - subdirectory / language structure
    - metadata / protocol file detection
    - missing metadata warnings

    Probes up to max_probe files for audio properties (to avoid long runtimes on large datasets).
    """
    lines: List[str] = []

    lines.append("=" * 65)
    lines.append(f"  VOXSHIELD Dataset Inspector — {dataset_name.upper()}")
    lines.append("=" * 65)
    lines.append(f"  Directory : {root_dir}")
    lines.append("")

    if not root_dir.exists():
        lines.append("  [ERROR] Directory does not exist. Dataset not yet downloaded.")
        lines.append("  See datasets/DOWNLOAD_GUIDE.md for download instructions.")
        lines.append("=" * 65)
        return "\n".join(lines)

    # -----------------------------------------------------------------------
    # 1. File discovery
    # -----------------------------------------------------------------------
    all_files: List[Path] = [p for p in root_dir.rglob("*") if p.is_file()]
    audio_files: List[Path] = [p for p in all_files if p.suffix.lower() in AUDIO_EXTENSIONS]
    non_audio_files: List[Path] = [p for p in all_files if p.suffix.lower() not in AUDIO_EXTENSIONS]

    total_bytes = sum(p.stat().st_size for p in audio_files if p.exists())

    lines.append(f"[1/5] File Discovery")
    lines.append(f"  Total files found      : {len(all_files)}")
    lines.append(f"  Audio files            : {len(audio_files)}")
    lines.append(f"  Non-audio files        : {len(non_audio_files)}")
    lines.append(f"  Total audio size       : {_format_bytes(total_bytes)}")

    if len(audio_files) == 0:
        lines.append("")
        lines.append("  [NOT DOWNLOADED] No audio files found. Directory is empty.")
        lines.append("  Refer to datasets/DOWNLOAD_GUIDE.md to begin downloading.")
        lines.append("")
    lines.append("")

    # -----------------------------------------------------------------------
    # 2. Format distribution
    # -----------------------------------------------------------------------
    format_counts: Dict[str, int] = defaultdict(int)
    for p in audio_files:
        format_counts[p.suffix.lower()] += 1

    lines.append("[2/5] Format Distribution")
    if format_counts:
        for ext, cnt in sorted(format_counts.items()):
            lines.append(f"  {ext:<10} : {cnt} files")
    else:
        lines.append("  No audio files found.")
    lines.append("")

    # -----------------------------------------------------------------------
    # 3. Audio property sampling (up to max_probe files)
    # -----------------------------------------------------------------------
    sample_rates: Dict[int, int] = defaultdict(int)
    channels_dist: Dict[int, int] = defaultdict(int)
    total_duration: float = 0.0
    probed = 0
    unprobed = 0
    corrupt = 0

    probe_targets = audio_files[:max_probe]

    lines.append(f"[3/5] Audio Properties (probing up to {max_probe} files)")

    for p in probe_targets:
        result = _probe_audio(p)
        if result is None:
            # Could be unsupported format or corrupt
            if p.stat().st_size == 0:
                corrupt += 1
            else:
                unprobed += 1
        else:
            sr, ch, dur = result
            if sr > 0:
                sample_rates[sr] += 1
            channels_dist[ch] += 1
            total_duration += dur
            probed += 1

    skipped = max(0, len(audio_files) - max_probe)

    lines.append(f"  Files probed           : {probed}")
    lines.append(f"  Files unprobed (format): {unprobed}")
    lines.append(f"  Files corrupt/empty    : {corrupt}")
    lines.append(f"  Files skipped (limit)  : {skipped}")
    lines.append("")
    lines.append("  Sample Rate Distribution:")
    if sample_rates:
        for sr, cnt in sorted(sample_rates.items()):
            flag = "" if sr == 16000 else "  <-- non-standard for VOXSHIELD"
            lines.append(f"    {sr} Hz : {cnt} files{flag}")
    else:
        lines.append("    No sample rate data available.")
    lines.append("")
    lines.append("  Channel Distribution:")
    if channels_dist:
        for ch, cnt in sorted(channels_dist.items()):
            label = "Mono" if ch == 1 else ("Stereo" if ch == 2 else f"{ch}-channel")
            lines.append(f"    {label} ({ch}ch) : {cnt} files")
    else:
        lines.append("    No channel data available.")
    lines.append("")
    if probed > 0:
        avg_dur = total_duration / probed
        lines.append(f"  Total probed duration  : {_format_duration(total_duration)}")
        lines.append(f"  Avg clip duration      : {avg_dur:.2f}s")
        if skipped > 0 and probed > 0:
            est_total = total_duration * (len(audio_files) / probed)
            lines.append(f"  Estimated total        : {_format_duration(est_total)} (extrapolated)")
    else:
        lines.append("  Duration               : Not available (no files probed)")
    lines.append("")

    # -----------------------------------------------------------------------
    # 4. Subdirectory / language structure
    # -----------------------------------------------------------------------
    lines.append("[4/5] Directory / Language Structure")
    subdirs = [p for p in root_dir.iterdir() if p.is_dir()] if root_dir.exists() else []
    if subdirs:
        for sd in sorted(subdirs):
            sub_audio = [p for p in sd.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS]
            sub_bytes = sum(p.stat().st_size for p in sub_audio)
            lines.append(f"  {sd.name:<20} : {len(sub_audio)} audio files  ({_format_bytes(sub_bytes)})")
    else:
        lines.append("  No subdirectories found (flat structure or empty directory).")
    lines.append("")

    # -----------------------------------------------------------------------
    # 5. Metadata / protocol file detection
    # -----------------------------------------------------------------------
    lines.append("[5/5] Metadata / Protocol File Detection")
    metadata_found: List[Path] = []
    for p in non_audio_files:
        if p.name.lower() in {n.lower() for n in KNOWN_PROTOCOL_NAMES} or p.suffix.lower() in {".csv", ".json", ".txt", ".tsv"}:
            metadata_found.append(p)

    if metadata_found:
        for mf in metadata_found:
            rel = mf.relative_to(root_dir) if mf.is_relative_to(root_dir) else mf
            lines.append(f"  [FOUND]   {rel}  ({_format_bytes(mf.stat().st_size)})")
    else:
        lines.append("  [MISSING] No protocol / metadata files detected.")
        if dataset_name == "asvspoof2021":
            lines.append("  Expected : trial_metadata.txt or keys/ directory")
        elif dataset_name in ("indicvoices", "indic_parler_tts"):
            lines.append("  Expected : metadata.csv, metadata.json, or similar per-language metadata")
    lines.append("")

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    lines.append("=" * 65)
    if len(audio_files) == 0:
        lines.append("  DATASET STATUS: NOT DOWNLOADED")
    elif corrupt > 0:
        lines.append(f"  DATASET STATUS: PARTIAL — {corrupt} corrupt/empty files detected")
    else:
        lines.append(f"  DATASET STATUS: {len(audio_files)} audio files present")
    lines.append("=" * 65)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="VOXSHIELD Dataset Inspector — scans and reports on downloaded dataset files."
    )

    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--dataset",
        choices=list(DATASET_REGISTRY.keys()),
        help="Named dataset to inspect (uses configured path from dataset registry)",
    )
    group.add_argument(
        "--dir",
        type=str,
        help="Path to a dataset directory to inspect directly",
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Inspect all registered datasets (use with --dir pointing to datasets/raw/ or omit --dir)",
    )
    parser.add_argument(
        "--max-probe",
        type=int,
        default=500,
        help="Maximum number of audio files to probe for properties (default: 500)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Write inspection report to this file path",
    )

    args = parser.parse_args()

    reports: List[str] = []

    if args.all or (not args.dataset and not args.dir):
        for name, rel in DATASET_REGISTRY.items():
            abs_dir = PROJECT_ROOT / rel
            report = inspect_directory(abs_dir, name, max_probe=args.max_probe)
            reports.append(report)
            print(report)
            print()
    elif args.dataset:
        rel = DATASET_REGISTRY[args.dataset]
        abs_dir = PROJECT_ROOT / rel
        report = inspect_directory(abs_dir, args.dataset, max_probe=args.max_probe)
        reports.append(report)
        print(report)
    elif args.dir:
        target = Path(args.dir).resolve()
        report = inspect_directory(target, target.name, max_probe=args.max_probe)
        reports.append(report)
        print(report)

    if args.output and reports:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("\n\n".join(reports))
        print(f"\nReport written to: {out_path.resolve()}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
