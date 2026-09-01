"""VOXSHIELD Dataset Quality Audit CLI
Analyzes a local dataset folder or manifest CSV and generates a markdown/JSON quality report.

Usage:
    python ai/scripts/dataset_quality_report.py --manifest datasets/metadata/dataset_manifest.csv
    python ai/scripts/dataset_quality_report.py --dir datasets/raw --output docs/dataset_audit.md
"""

from __future__ import annotations
import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if sys.stdout.encoding != "utf-8" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from ai.app.datasets.manifest import ManifestReader
from ai.app.datasets.quality import QualityReporter
from ai.app.datasets.adapters import GenericAudioAdapter


def main() -> int:
    parser = argparse.ArgumentParser(description="VOXSHIELD Dataset Quality Audit Tool")
    parser.add_argument("--manifest", type=str, default="datasets/metadata/dataset_manifest.csv", help="Path to manifest CSV")
    parser.add_argument("--dir", type=str, default=None, help="Path to audio directory to scan directly if no manifest")
    parser.add_argument("--output", type=str, default=None, help="Path to write output markdown report (optional)")

    args = parser.parse_args()

    records = []
    if args.manifest and Path(args.manifest).exists():
        records = ManifestReader.read_manifest(args.manifest)
    elif args.dir and Path(args.dir).exists():
        adapter = GenericAudioAdapter(args.dir)
        records = adapter.process()

    metrics = QualityReporter.compute_metrics(records)
    md_report = QualityReporter.generate_markdown_report(metrics)

    print(md_report)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(md_report)
        print(f"\nReport written to: {out_path.resolve()}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
