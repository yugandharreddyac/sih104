"""VOXSHIELD Dataset Manifest Generator & Reader
Provides serialization, deserialization, and schema validation for datasets/metadata/dataset_manifest.csv.
"""

from __future__ import annotations
import csv
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ai.app.datasets.leakage import LeakageDetector
from ai.app.datasets.types import (
    LeakageReport,
    ManifestRecord,
)

MANIFEST_COLUMNS: List[str] = [
    "file_path",
    "dataset",
    "split",
    "label",
    "language",
    "language_code",
    "speaker_id",
    "generator_id",
    "session_id",
    "sample_rate",
    "duration_seconds",
    "source_metadata",
    "license",
    "checksum",
]


class ManifestWriter:
    """Writes ManifestRecord instances into compliant CSV manifest files."""

    @classmethod
    def write_manifest(
        cls,
        records: List[ManifestRecord],
        output_path: str,
        overwrite: bool = True,
    ) -> str:
        """Write manifest records to CSV file using standard MANIFEST_COLUMNS schema."""
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)

        if out.exists() and not overwrite:
            raise FileExistsError(f"Manifest destination already exists: {output_path}")

        with open(out, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=MANIFEST_COLUMNS)
            writer.writeheader()
            for rec in records:
                writer.writerow(rec.to_dict())

        return str(out.resolve())


class ManifestReader:
    """Reads and parses dataset_manifest.csv files into typed ManifestRecord instances."""

    @classmethod
    def read_manifest(cls, manifest_path: str) -> List[ManifestRecord]:
        """Parse manifest CSV into List of ManifestRecord instances."""
        path = Path(manifest_path)
        if not path.exists():
            return []

        records: List[ManifestRecord] = []
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row or not row.get("file_path"):
                    continue
                records.append(ManifestRecord.from_dict(row))

        return records


class ManifestGenerator:
    """Orchestrates dataset scanning, record generation, leakage verification, and CSV export."""

    @classmethod
    def generate_and_save(
        cls,
        records: List[ManifestRecord],
        output_path: str,
        check_leakage: bool = True,
    ) -> Tuple[str, LeakageReport]:
        """Save records to manifest CSV and optionally verify split leakage."""
        leakage_report = LeakageReport(is_clean=True)
        if check_leakage and records:
            leakage_report = LeakageDetector.check_records(records)

        saved_path = ManifestWriter.write_manifest(records, output_path, overwrite=True)
        return saved_path, leakage_report
