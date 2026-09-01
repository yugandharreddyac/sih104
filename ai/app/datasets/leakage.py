"""VOXSHIELD Data Leakage Protection Engine
Inspects dataset manifests and partitions to detect train/test/validation data contamination,
including speaker ID overlap, session ID overlap, and exact audio binary duplicates across splits.
"""

from __future__ import annotations
from collections import defaultdict
from typing import Dict, List, Set, Tuple

from ai.app.datasets.types import (
    LeakageReport,
    LeakageViolation,
    ManifestRecord,
    SplitType,
)


class LeakageDetector:
    """Detects train/test/validation leakage without silently mutating data."""

    @classmethod
    def check_records(cls, records: List[ManifestRecord]) -> LeakageReport:
        """Analyze a list of ManifestRecord instances and generate a comprehensive LeakageReport."""
        violations: List[LeakageViolation] = []
        speaker_overlaps: Dict[str, List[str]] = {}
        session_overlaps: Dict[str, List[str]] = {}
        checksum_overlaps: Dict[str, List[str]] = {}

        # Mappings of identifier -> dict of split -> list of file paths
        speakers_to_splits: Dict[str, Dict[str, List[str]]] = defaultdict(lambda: defaultdict(list))
        sessions_to_splits: Dict[str, Dict[str, List[str]]] = defaultdict(lambda: defaultdict(list))
        checksums_to_splits: Dict[str, Dict[str, List[str]]] = defaultdict(lambda: defaultdict(list))

        for rec in records:
            split = rec.split.lower() if rec.split else SplitType.UNASSIGNED.value

            # Ignore UNASSIGNED splits for leakage comparisons unless comparing against assigned splits
            if split == SplitType.UNASSIGNED.value:
                continue

            if rec.speaker_id and rec.speaker_id.strip():
                spk = rec.speaker_id.strip()
                speakers_to_splits[spk][split].append(rec.file_path)

            if rec.session_id and rec.session_id.strip():
                sess = rec.session_id.strip()
                sessions_to_splits[sess][split].append(rec.file_path)

            if rec.checksum and rec.checksum.strip():
                chk = rec.checksum.strip()
                checksums_to_splits[chk][split].append(rec.file_path)

        # 1. Check Speaker Overlap Across Splits
        for spk, split_map in speakers_to_splits.items():
            splits_present = sorted(list(split_map.keys()))
            if len(splits_present) > 1:
                # Violation: same speaker present in multiple splits
                all_files = [f for paths in split_map.values() for f in paths]
                desc = f"Speaker ID '{spk}' appears across splits: {', '.join(splits_present)} ({len(all_files)} files)"
                violations.append(
                    LeakageViolation(
                        violation_type="speaker_overlap",
                        identifier=spk,
                        splits_involved=splits_present,
                        file_paths=all_files,
                        description=desc,
                    )
                )
                speaker_overlaps[spk] = splits_present

        # 2. Check Session Overlap Across Splits
        for sess, split_map in sessions_to_splits.items():
            splits_present = sorted(list(split_map.keys()))
            if len(splits_present) > 1:
                all_files = [f for paths in split_map.values() for f in paths]
                desc = f"Session ID '{sess}' appears across splits: {', '.join(splits_present)} ({len(all_files)} files)"
                violations.append(
                    LeakageViolation(
                        violation_type="session_overlap",
                        identifier=sess,
                        splits_involved=splits_present,
                        file_paths=all_files,
                        description=desc,
                    )
                )
                session_overlaps[sess] = splits_present

        # 3. Check Exact Audio Checksum Duplication Across Splits
        for chk, split_map in checksums_to_splits.items():
            splits_present = sorted(list(split_map.keys()))
            if len(splits_present) > 1:
                all_files = [f for paths in split_map.values() for f in paths]
                desc = f"Identical audio checksum '{chk[:12]}...' appears across splits: {', '.join(splits_present)} ({len(all_files)} files)"
                violations.append(
                    LeakageViolation(
                        violation_type="duplicate_checksum",
                        identifier=chk,
                        splits_involved=splits_present,
                        file_paths=all_files,
                        description=desc,
                    )
                )
                checksum_overlaps[chk] = splits_present

        is_clean = len(violations) == 0

        return LeakageReport(
            is_clean=is_clean,
            total_violations=len(violations),
            violations=violations,
            speaker_overlaps=speaker_overlaps,
            session_overlaps=session_overlaps,
            checksum_overlaps=checksum_overlaps,
        )
