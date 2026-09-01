"""VOXSHIELD Dataset Quality Reporter
Analyzes dataset manifests and local audio files to produce empirical quality audits,
duration distributions, class balance summaries, and data leakage warnings.
"""

from __future__ import annotations
import math
from collections import Counter
from typing import Dict, List, Optional

from ai.app.datasets.leakage import LeakageDetector
from ai.app.datasets.types import (
    DatasetQualityMetrics,
    ManifestRecord,
)


class QualityReporter:
    """Computes rigorous empirical metrics for dataset quality and split balance."""

    @classmethod
    def compute_metrics(
        cls,
        records: List[ManifestRecord],
        invalid_files_count: int = 0,
    ) -> DatasetQualityMetrics:
        """Compute statistical properties, distributions, and leakage warnings from manifest records."""
        if not records and invalid_files_count == 0:
            return DatasetQualityMetrics()

        total_files = len(records) + invalid_files_count
        valid_files = len(records)

        durations: List[float] = [r.duration_seconds for r in records if r.duration_seconds is not None]
        total_duration = sum(durations) if durations else 0.0

        dur_min = min(durations) if durations else 0.0
        dur_max = max(durations) if durations else 0.0
        dur_mean = (total_duration / len(durations)) if durations else 0.0

        # Percentile calculations
        dur_sorted = sorted(durations)
        dur_median = 0.0
        dur_p95 = 0.0
        if dur_sorted:
            mid = len(dur_sorted) // 2
            dur_median = dur_sorted[mid] if len(dur_sorted) % 2 != 0 else (dur_sorted[mid - 1] + dur_sorted[mid]) / 2.0
            p95_idx = min(int(math.ceil(0.95 * len(dur_sorted))) - 1, len(dur_sorted) - 1)
            dur_p95 = dur_sorted[max(0, p95_idx)]

        # Distributions
        sample_rates = [r.sample_rate for r in records if r.sample_rate is not None]
        sr_dist: Dict[int, int] = dict(Counter(sample_rates))

        languages = [r.language or (r.language_code or "Unknown") for r in records]
        lang_dist: Dict[str, int] = dict(Counter(languages))

        labels = [r.label for r in records if r.label]
        label_dist: Dict[str, int] = dict(Counter(labels))

        splits = [r.split for r in records if r.split]
        split_dist: Dict[str, int] = dict(Counter(splits))

        speakers = {r.speaker_id for r in records if r.speaker_id and r.speaker_id.strip()}
        generators = {r.generator_id for r in records if r.generator_id and r.generator_id.strip()}

        # Leakage check
        leakage_rep = LeakageDetector.check_records(records)
        leakage_warnings = [v.description for v in leakage_rep.violations]

        return DatasetQualityMetrics(
            total_files=total_files,
            valid_files=valid_files,
            invalid_files=invalid_files_count,
            total_duration_seconds=round(total_duration, 4),
            duration_min_seconds=round(dur_min, 4),
            duration_max_seconds=round(dur_max, 4),
            duration_mean_seconds=round(dur_mean, 4),
            duration_median_seconds=round(dur_median, 4),
            duration_p95_seconds=round(dur_p95, 4),
            sample_rate_distribution=sr_dist,
            language_distribution=lang_dist,
            label_distribution=label_dist,
            split_distribution=split_dist,
            unique_speakers_count=len(speakers),
            unique_generators_count=len(generators),
            leakage_warnings=leakage_warnings,
        )

    @classmethod
    def generate_markdown_report(cls, metrics: DatasetQualityMetrics, title: str = "VOXSHIELD Dataset Quality Report") -> str:
        """Generate a clean, structured Markdown representation of dataset metrics."""
        lines = [
            f"# {title}",
            "",
            "## 1. Summary Statistics",
            f"- **Total Audio Files Discovered:** {metrics.total_files}",
            f"- **Valid & Readable Audio Files:** {metrics.valid_files}",
            f"- **Corrupted / Invalid Files:** {metrics.invalid_files}",
            f"- **Cumulative Audio Duration:** {metrics.total_duration_seconds:.2f} seconds ({metrics.total_duration_seconds / 3600.0:.2f} hours)",
            f"- **Unique Identified Speakers:** {metrics.unique_speakers_count}",
            f"- **Unique Identified Synthetic Generators:** {metrics.unique_generators_count}",
            "",
            "## 2. Duration Distribution (Seconds)",
            f"| Min | Mean | Median | P95 | Max |",
            f"| :--- | :--- | :--- | :--- | :--- |",
            f"| {metrics.duration_min_seconds:.2f}s | {metrics.duration_mean_seconds:.2f}s | {metrics.duration_median_seconds:.2f}s | {metrics.duration_p95_seconds:.2f}s | {metrics.duration_max_seconds:.2f}s |",
            "",
            "## 3. Label Breakdown (Real vs Synthetic)",
        ]

        if metrics.label_distribution:
            lines.append("| Label | Count | Percentage |")
            lines.append("| :--- | :--- | :--- |")
            for lbl, count in sorted(metrics.label_distribution.items()):
                pct = (count / metrics.valid_files * 100.0) if metrics.valid_files > 0 else 0.0
                lines.append(f"| `{lbl}` | {count} | {pct:.1f}% |")
        else:
            lines.append("*No labeled records present.*")

        lines.extend([
            "",
            "## 4. Partition Splits",
        ])

        if metrics.split_distribution:
            lines.append("| Split | Count | Percentage |")
            lines.append("| :--- | :--- | :--- |")
            for sp, count in sorted(metrics.split_distribution.items()):
                pct = (count / metrics.valid_files * 100.0) if metrics.valid_files > 0 else 0.0
                lines.append(f"| `{sp}` | {count} | {pct:.1f}% |")
        else:
            lines.append("*No partitioned records present.*")

        lines.extend([
            "",
            "## 5. Language Breakdown",
        ])

        if metrics.language_distribution:
            lines.append("| Language | Count |")
            lines.append("| :--- | :--- |")
            for lang, count in sorted(metrics.language_distribution.items()):
                lines.append(f"| {lang} | {count} |")
        else:
            lines.append("*No language metadata present.*")

        lines.extend([
            "",
            "## 6. Sampling Rate Distribution",
        ])

        if metrics.sample_rate_distribution:
            lines.append("| Sampling Frequency (Hz) | Count |")
            lines.append("| :--- | :--- |")
            for sr, count in sorted(metrics.sample_rate_distribution.items()):
                lines.append(f"| {sr} Hz | {count} |")
        else:
            lines.append("*No sampling rate data present.*")

        lines.extend([
            "",
            "## 7. Data Leakage Assessment",
        ])

        if metrics.leakage_warnings:
            lines.append("> [!WARNING]")
            lines.append("> **Data Leakage Violations Detected:**")
            for warn in metrics.leakage_warnings:
                lines.append(f"> - {warn}")
        else:
            lines.append("> [!NOTE]")
            lines.append("> **No cross-split data leakage detected.** Speaker IDs, session IDs, and audio binaries are strictly separated.")

        lines.append("")
        return "\n".join(lines)
