"""VOXSHIELD Dataset Manifest Generator
Scans downloaded dataset directories and produces unified manifest CSV files
using the Phase 7.1 dataset foundation adapters and schemas.

Does NOT modify raw files. Only reads and generates manifest outputs.

Usage:
    python ai/scripts/generate_dataset_manifest.py --dataset asvspoof2021
    python ai/scripts/generate_dataset_manifest.py --dataset indicvoices
    python ai/scripts/generate_dataset_manifest.py --dataset indic_parler_tts
    python ai/scripts/generate_dataset_manifest.py --all
    python ai/scripts/generate_dataset_manifest.py --all --output datasets/manifests/unified_manifest.csv
    python ai/scripts/generate_dataset_manifest.py --dataset asvspoof2021 --no-hash  # skip SHA-256 (faster)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional

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
# Imports from Phase 7.1 dataset foundation
# ---------------------------------------------------------------------------
from ai.app.datasets.adapters import (
    ASVSpoofAdapter,
    GenericAudioAdapter,
    IndicParlerTTSAdapter,
    IndicVoicesAdapter,
)
from ai.app.datasets.manifest import ManifestGenerator, ManifestWriter
from ai.app.datasets.quality import QualityReporter
from ai.app.datasets.types import ManifestRecord

# ---------------------------------------------------------------------------
# Dataset registry
# ---------------------------------------------------------------------------
DATASET_REGISTRY = {
    "asvspoof2021": "datasets/raw/asvspoof2021",
    "indicvoices": "datasets/raw/indicvoices",
    "indic_parler_tts": "datasets/raw/indic_parler_tts",
}

DEFAULT_MANIFEST_DIR = "datasets/manifests"
LEGACY_MANIFEST_PATH = "datasets/metadata/dataset_manifest.csv"


# ---------------------------------------------------------------------------
# Per-dataset manifest generation
# ---------------------------------------------------------------------------

def generate_for_dataset(
    dataset_name: str,
    project_root: Path,
    output_dir: Path,
    compute_hash: bool = True,
    protocol_file: Optional[str] = None,
) -> List[ManifestRecord]:
    """
    Scan a dataset directory using the appropriate Phase 7.1 adapter and write
    a per-dataset manifest CSV. Returns the list of ManifestRecord instances.
    """
    rel_dir = DATASET_REGISTRY.get(dataset_name)
    if rel_dir is None:
        print(f"  [ERROR] Unknown dataset: {dataset_name}", file=sys.stderr)
        return []

    abs_dir = project_root / rel_dir

    print(f"\n{'='*60}")
    print(f"  Generating manifest for: {dataset_name}")
    print(f"  Source directory       : {abs_dir}")
    print(f"{'='*60}")

    if not abs_dir.exists() or not any(True for _ in abs_dir.rglob("*") if _.is_file()):
        print(f"  [SKIP] {dataset_name} — directory is empty or does not exist.")
        print(f"  See datasets/DOWNLOAD_GUIDE.md to download this dataset.")
        return []

    # Select adapter based on dataset name
    if dataset_name == "asvspoof2021":
        adapter = ASVSpoofAdapter(str(abs_dir), protocol_file_path=protocol_file)
    elif dataset_name == "indicvoices":
        adapter = IndicVoicesAdapter(str(abs_dir))
    elif dataset_name == "indic_parler_tts":
        adapter = IndicParlerTTSAdapter(str(abs_dir))
    else:
        adapter = GenericAudioAdapter(str(abs_dir))

    print(f"  Scanning files (compute_hash={compute_hash})...")
    records = adapter.process(compute_hash=compute_hash)
    print(f"  Records generated      : {len(records)}")

    if not records:
        print(f"  [WARN] No valid audio records found in {abs_dir}")
        return []

    # Write per-dataset manifest
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / f"{dataset_name}_manifest.csv"

    out_path, leakage_report = ManifestGenerator.generate_and_save(
        records, str(manifest_path), check_leakage=True
    )

    print(f"  Manifest written to    : {out_path}")
    if leakage_report.is_clean:
        print(f"  Leakage check          : CLEAN")
    else:
        print(f"  [WARNING] Leakage check: {leakage_report.total_violations} violation(s) detected!")
        for v in leakage_report.violations[:5]:
            print(f"    - {v.description}")

    # Print quality summary
    metrics = QualityReporter.compute_metrics(records)
    print(f"  Total audio files      : {metrics.total_files}")
    print(f"  Valid files            : {metrics.valid_files}")
    if metrics.total_duration_seconds > 0:
        hrs = metrics.total_duration_seconds / 3600
        print(f"  Total duration         : {hrs:.2f} hours ({metrics.total_duration_seconds:.0f} seconds)")
    print(f"  Label distribution     : {dict(metrics.label_distribution)}")
    print(f"  Language distribution  : {dict(metrics.language_distribution)}")
    print(f"  Sample rates           : {dict(metrics.sample_rate_distribution)}")

    return records


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="VOXSHIELD Manifest Generator — builds unified manifest CSVs from downloaded datasets."
    )

    parser.add_argument(
        "--dataset",
        choices=list(DATASET_REGISTRY.keys()),
        default=None,
        help="Generate manifest for a specific dataset",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Generate manifests for all registered datasets",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Path to write unified manifest CSV (combines all datasets). Default: datasets/manifests/unified_manifest.csv",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=DEFAULT_MANIFEST_DIR,
        help=f"Directory to write per-dataset manifests (default: {DEFAULT_MANIFEST_DIR})",
    )
    parser.add_argument(
        "--protocol",
        type=str,
        default=None,
        help="Path to ASVspoof protocol/keys file (optional; auto-detected if not specified)",
    )
    parser.add_argument(
        "--no-hash",
        action="store_true",
        help="Skip SHA-256 hash computation (faster, but checksums will be empty)",
    )
    parser.add_argument(
        "--also-update-legacy",
        action="store_true",
        help=f"Also write results to the legacy manifest at {LEGACY_MANIFEST_PATH}",
    )

    args = parser.parse_args()

    if not args.dataset and not args.all:
        parser.print_help()
        print("\n[ERROR] Specify --dataset <name> or --all", file=sys.stderr)
        return 1

    compute_hash = not args.no_hash
    output_dir = PROJECT_ROOT / args.output_dir

    datasets_to_process = list(DATASET_REGISTRY.keys()) if args.all else [args.dataset]

    all_records: List[ManifestRecord] = []

    for dataset_name in datasets_to_process:
        records = generate_for_dataset(
            dataset_name=dataset_name,
            project_root=PROJECT_ROOT,
            output_dir=output_dir,
            compute_hash=compute_hash,
            protocol_file=args.protocol,
        )
        all_records.extend(records)

    # -----------------------------------------------------------------------
    # Unified manifest (if --all or --output specified)
    # -----------------------------------------------------------------------
    if all_records and (args.all or args.output):
        unified_path = Path(args.output) if args.output else output_dir / "unified_manifest.csv"
        unified_path.parent.mkdir(parents=True, exist_ok=True)

        print(f"\n{'='*60}")
        print(f"  Generating unified manifest")
        print(f"  Total records          : {len(all_records)}")

        out_path, leakage_report = ManifestGenerator.generate_and_save(
            all_records, str(unified_path), check_leakage=True
        )
        print(f"  Unified manifest at    : {out_path}")

        if leakage_report.is_clean:
            print(f"  Cross-dataset leakage  : CLEAN")
        else:
            print(f"  [WARNING] Leakage      : {leakage_report.total_violations} violation(s)!")
            for v in leakage_report.violations[:10]:
                print(f"    - {v.description}")

        if args.also_update_legacy:
            legacy = PROJECT_ROOT / LEGACY_MANIFEST_PATH
            legacy.parent.mkdir(parents=True, exist_ok=True)
            out_path2, _ = ManifestGenerator.generate_and_save(
                all_records, str(legacy), check_leakage=False
            )
            print(f"  Legacy manifest at     : {out_path2}")

        # Quality report
        metrics = QualityReporter.compute_metrics(all_records)
        md_report = QualityReporter.generate_markdown_report(metrics)
        quality_report_path = output_dir / "quality_report.md"
        with open(quality_report_path, "w", encoding="utf-8") as f:
            f.write(md_report)
        print(f"  Quality report at      : {quality_report_path}")
        print(f"{'='*60}")

    if not all_records:
        print("\n[INFO] No records generated. No datasets have been downloaded yet.")
        print("       See datasets/DOWNLOAD_GUIDE.md to begin downloading.")

    print("\n[DONE] Manifest generation complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
