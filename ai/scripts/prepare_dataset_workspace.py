"""VOXSHIELD Dataset Workspace Preparation Script
Verifies and reports on the dataset workspace directory structure.
Does NOT download, delete, rename, resample, or modify any files.

Usage:
    python ai/scripts/prepare_dataset_workspace.py
    python ai/scripts/prepare_dataset_workspace.py --config datasets/dataset_config.yaml
    python ai/scripts/prepare_dataset_workspace.py --fix-dirs   # create any missing directories
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# ---------------------------------------------------------------------------
# Bootstrap: ensure project root is on sys.path regardless of CWD
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
# Constants — default expected workspace structure
# ---------------------------------------------------------------------------
EXPECTED_DIRS: List[str] = [
    "datasets/raw",
    "datasets/raw/asvspoof2021",
    "datasets/raw/indicvoices",
    "datasets/raw/indic_parler_tts",
    "datasets/processed",
    "datasets/manifests",
    "datasets/splits",
    "datasets/metadata",
]

EXPECTED_FILES: List[str] = [
    "datasets/README.md",
    "datasets/DOWNLOAD_GUIDE.md",
    "datasets/PROVENANCE.md",
    "datasets/DATASET_STATUS.md",
    "datasets/dataset_config.yaml",
    "datasets/metadata/dataset_manifest.csv",
]

DATASET_DIRS: Dict[str, str] = {
    "asvspoof2021": "datasets/raw/asvspoof2021",
    "indicvoices": "datasets/raw/indicvoices",
    "indic_parler_tts": "datasets/raw/indic_parler_tts",
    "processed": "datasets/processed",
    "manifests": "datasets/manifests",
    "splits": "datasets/splits",
}

AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".m4a", ".aac"}

# Disk space thresholds
WARN_DISK_FREE_GB = 20.0
CRITICAL_DISK_FREE_GB = 5.0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_disk_space(path: Path) -> Tuple[float, float, float]:
    """Return (total_gb, used_gb, free_gb) for the filesystem containing path."""
    usage = shutil.disk_usage(str(path))
    gb = 1024 ** 3
    return usage.total / gb, usage.used / gb, usage.free / gb


def _count_audio_files(directory: Path) -> Tuple[int, int]:
    """Return (audio_file_count, total_bytes) for audio files under directory."""
    if not directory.exists():
        return 0, 0
    count = 0
    total_bytes = 0
    for p in directory.rglob("*"):
        if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS:
            count += 1
            try:
                total_bytes += p.stat().st_size
            except OSError:
                pass
    return count, total_bytes


def _format_bytes(n_bytes: int) -> str:
    if n_bytes < 1024:
        return f"{n_bytes} B"
    elif n_bytes < 1024 ** 2:
        return f"{n_bytes / 1024:.1f} KB"
    elif n_bytes < 1024 ** 3:
        return f"{n_bytes / 1024**2:.1f} MB"
    else:
        return f"{n_bytes / 1024**3:.2f} GB"


# ---------------------------------------------------------------------------
# Main workspace check logic
# ---------------------------------------------------------------------------

def run_workspace_check(project_root: Path, fix_dirs: bool = False) -> int:
    """
    Check the dataset workspace structure.
    Returns 0 on success, 1 if any required directory or file is missing.
    """
    print("=" * 65)
    print("  VOXSHIELD — Dataset Workspace Preparation Check")
    print("=" * 65)
    print(f"  Project root : {project_root}")
    print()

    exit_code = 0
    missing_dirs: List[str] = []
    missing_files: List[str] = []

    # -----------------------------------------------------------------------
    # 1. Check / create directories
    # -----------------------------------------------------------------------
    print("[1/4] Checking directory structure...")
    for rel_dir in EXPECTED_DIRS:
        abs_dir = project_root / rel_dir
        if abs_dir.exists():
            print(f"  [OK]      {rel_dir}/")
        else:
            if fix_dirs:
                abs_dir.mkdir(parents=True, exist_ok=True)
                print(f"  [CREATED] {rel_dir}/")
            else:
                print(f"  [MISSING] {rel_dir}/  <-- run with --fix-dirs to create")
                missing_dirs.append(rel_dir)
                exit_code = 1
    print()

    # -----------------------------------------------------------------------
    # 2. Check documentation / config files
    # -----------------------------------------------------------------------
    print("[2/4] Checking workspace documentation files...")
    for rel_file in EXPECTED_FILES:
        abs_file = project_root / rel_file
        if abs_file.exists():
            size = abs_file.stat().st_size
            print(f"  [OK]      {rel_file} ({_format_bytes(size)})")
        else:
            print(f"  [MISSING] {rel_file}")
            missing_files.append(rel_file)
            exit_code = 1
    print()

    # -----------------------------------------------------------------------
    # 3. Dataset file counts
    # -----------------------------------------------------------------------
    print("[3/4] Dataset audio file inventory...")
    for name, rel_dir in DATASET_DIRS.items():
        abs_dir = project_root / rel_dir
        count, total_bytes = _count_audio_files(abs_dir)
        if count == 0:
            print(f"  [EMPTY]   {rel_dir:<45} 0 audio files  (NOT DOWNLOADED)")
        else:
            print(f"  [FOUND]   {rel_dir:<45} {count} files  ({_format_bytes(total_bytes)})")
    print()

    # -----------------------------------------------------------------------
    # 4. Disk space
    # -----------------------------------------------------------------------
    print("[4/4] Disk space check...")
    try:
        total_gb, used_gb, free_gb = _check_disk_space(project_root)
        print(f"  Total  : {total_gb:.1f} GB")
        print(f"  Used   : {used_gb:.1f} GB")
        print(f"  Free   : {free_gb:.1f} GB")

        if free_gb < CRITICAL_DISK_FREE_GB:
            print(f"\n  [CRITICAL] Only {free_gb:.1f} GB free! Cannot safely download any dataset.")
            exit_code = 1
        elif free_gb < WARN_DISK_FREE_GB:
            print(f"\n  [WARNING]  {free_gb:.1f} GB free. Recommended: >= {WARN_DISK_FREE_GB} GB before downloading.")
        else:
            print(f"\n  [OK]       Sufficient disk space for initial subset download (~5 GB needed).")
    except Exception as exc:
        print(f"  [WARN] Could not measure disk space: {exc}")
    print()

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print("=" * 65)
    if missing_dirs:
        print(f"  MISSING DIRS  : {len(missing_dirs)}")
        for d in missing_dirs:
            print(f"    - {d}")
    if missing_files:
        print(f"  MISSING FILES : {len(missing_files)}")
        for f in missing_files:
            print(f"    - {f}")

    if exit_code == 0:
        print("  WORKSPACE STATUS: READY")
        print()
        print("  Next step: Start the first dataset download.")
        print("  See datasets/DOWNLOAD_GUIDE.md for instructions.")
    else:
        print("  WORKSPACE STATUS: INCOMPLETE — resolve issues above before downloading.")
    print("=" * 65)

    return exit_code


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="VOXSHIELD Dataset Workspace Preparation — verifies directory structure and reports file inventory."
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to dataset_config.yaml (optional; structure is inferred from project root)",
    )
    parser.add_argument(
        "--fix-dirs",
        action="store_true",
        help="Create any missing directories (does not download or modify data files)",
    )
    parser.add_argument(
        "--root",
        type=str,
        default=None,
        help="Override project root path (default: auto-detected from script location)",
    )

    args = parser.parse_args()

    project_root = Path(args.root).resolve() if args.root else PROJECT_ROOT
    if not project_root.exists():
        print(f"[ERROR] Project root does not exist: {project_root}", file=sys.stderr)
        return 1

    return run_workspace_check(project_root, fix_dirs=args.fix_dirs)


if __name__ == "__main__":
    sys.exit(main())
