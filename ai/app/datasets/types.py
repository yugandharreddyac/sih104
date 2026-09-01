"""VOXSHIELD Dataset Types & Data Contracts
Defines standard enums, dataclasses, and schemas for dataset ingestion, manifest generation,
and quality auditing.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class DatasetName(str, Enum):
    ASVSPOOF2021 = "asvspoof2021"
    INDICVOICES = "indicvoices"
    INDIC_PARLER_TTS = "indic_parler_tts"
    CUSTOM = "custom"
    UNKNOWN = "unknown"


class SplitType(str, Enum):
    TRAIN = "train"
    VALIDATION = "validation"
    TEST = "test"
    UNASSIGNED = "unassigned"


class AudioLabel(str, Enum):
    BONA_FIDE = "bona_fide"
    SPOOF = "spoof"
    UNKNOWN = "unknown"


@dataclass
class ManifestRecord:
    """Represents a single audio sample record in the unified dataset manifest."""
    file_path: str
    dataset: str = DatasetName.UNKNOWN.value
    split: str = SplitType.UNASSIGNED.value
    label: str = AudioLabel.UNKNOWN.value
    language: Optional[str] = None
    language_code: Optional[str] = None
    speaker_id: Optional[str] = None
    generator_id: Optional[str] = None
    session_id: Optional[str] = None
    sample_rate: Optional[int] = None
    duration_seconds: Optional[float] = None
    source_metadata: Optional[str] = None
    license: Optional[str] = None
    checksum: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize record to dictionary suitable for CSV row mapping."""
        return {
            "file_path": self.file_path,
            "dataset": self.dataset or "",
            "split": self.split or "",
            "label": self.label or "",
            "language": self.language or "",
            "language_code": self.language_code or "",
            "speaker_id": self.speaker_id or "",
            "generator_id": self.generator_id or "",
            "session_id": self.session_id or "",
            "sample_rate": self.sample_rate if self.sample_rate is not None else "",
            "duration_seconds": f"{self.duration_seconds:.4f}" if self.duration_seconds is not None else "",
            "source_metadata": self.source_metadata or "",
            "license": self.license or "",
            "checksum": self.checksum or "",
        }

    @classmethod
    def from_dict(cls, row: Dict[str, Any]) -> "ManifestRecord":
        """Deserialize record from dictionary or CSV row mapping."""
        sample_rate_val = row.get("sample_rate")
        sr: Optional[int] = None
        if sample_rate_val not in (None, "", "None", "NULL"):
            try:
                sr = int(float(sample_rate_val))
            except (ValueError, TypeError):
                sr = None

        duration_val = row.get("duration_seconds")
        dur: Optional[float] = None
        if duration_val not in (None, "", "None", "NULL"):
            try:
                dur = float(duration_val)
            except (ValueError, TypeError):
                dur = None

        def clean_str(val: Any) -> Optional[str]:
            if val in (None, "", "None", "NULL"):
                return None
            return str(val).strip()

        return cls(
            file_path=str(row.get("file_path", "")).strip(),
            dataset=str(row.get("dataset", DatasetName.UNKNOWN.value)).strip() or DatasetName.UNKNOWN.value,
            split=str(row.get("split", SplitType.UNASSIGNED.value)).strip() or SplitType.UNASSIGNED.value,
            label=str(row.get("label", AudioLabel.UNKNOWN.value)).strip() or AudioLabel.UNKNOWN.value,
            language=clean_str(row.get("language")),
            language_code=clean_str(row.get("language_code")),
            speaker_id=clean_str(row.get("speaker_id")),
            generator_id=clean_str(row.get("generator_id")),
            session_id=clean_str(row.get("session_id")),
            sample_rate=sr,
            duration_seconds=dur,
            source_metadata=clean_str(row.get("source_metadata")),
            license=clean_str(row.get("license")),
            checksum=clean_str(row.get("checksum")),
        )


@dataclass
class AudioValidationResult:
    """Diagnostic outcome of validating an individual audio binary."""
    file_path: str
    is_valid: bool
    sample_rate: Optional[int] = None
    duration_seconds: Optional[float] = None
    channels: Optional[int] = None
    file_size_bytes: int = 0
    checksum: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class LeakageViolation:
    """Detailed record of an identified data leakage violation."""
    violation_type: str  # e.g., "speaker_overlap", "session_overlap", "duplicate_checksum"
    identifier: str
    splits_involved: List[str]
    file_paths: List[str] = field(default_factory=list)
    description: str = ""


@dataclass
class LeakageReport:
    """Comprehensive leakage assessment across dataset splits."""
    is_clean: bool = True
    total_violations: int = 0
    violations: List[LeakageViolation] = field(default_factory=list)
    speaker_overlaps: Dict[str, List[str]] = field(default_factory=dict)
    session_overlaps: Dict[str, List[str]] = field(default_factory=dict)
    checksum_overlaps: Dict[str, List[str]] = field(default_factory=dict)


class DatasetQualityMetrics(BaseModel):
    """Aggregate statistics and health metrics for an indexed dataset."""
    total_files: int = Field(0, description="Total number of discovered files")
    valid_files: int = Field(0, description="Number of playable, non-corrupted audio files")
    invalid_files: int = Field(0, description="Number of unreadable/corrupted files")
    total_duration_seconds: float = Field(0.0, description="Cumulative audio duration in seconds")
    duration_min_seconds: float = Field(0.0)
    duration_max_seconds: float = Field(0.0)
    duration_mean_seconds: float = Field(0.0)
    duration_median_seconds: float = Field(0.0)
    duration_p95_seconds: float = Field(0.0)
    sample_rate_distribution: Dict[int, int] = Field(default_factory=dict)
    language_distribution: Dict[str, int] = Field(default_factory=dict)
    label_distribution: Dict[str, int] = Field(default_factory=dict)
    split_distribution: Dict[str, int] = Field(default_factory=dict)
    unique_speakers_count: int = Field(0)
    unique_generators_count: int = Field(0)
    leakage_warnings: List[str] = Field(default_factory=list)
