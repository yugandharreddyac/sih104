"""VOXSHIELD Dataset Ingestion & Validation Package
Exposes core dataset types, adapters, validators, leakage detection, and quality reporters.
"""

from ai.app.datasets.types import (
    AudioLabel,
    AudioValidationResult,
    DatasetName,
    DatasetQualityMetrics,
    LeakageReport,
    LeakageViolation,
    ManifestRecord,
    SplitType,
)
from ai.app.datasets.validator import (
    AudioFileValidator,
    SUPPORTED_AUDIO_EXTENSIONS,
)
from ai.app.datasets.adapters import (
    BaseDatasetAdapter,
    GenericAudioAdapter,
    ASVSpoofAdapter,
    IndicVoicesAdapter,
    IndicParlerTTSAdapter,
)
from ai.app.datasets.leakage import LeakageDetector
from ai.app.datasets.manifest import (
    MANIFEST_COLUMNS,
    ManifestGenerator,
    ManifestReader,
    ManifestWriter,
)
from ai.app.datasets.quality import QualityReporter

__all__ = [
    "AudioLabel",
    "AudioValidationResult",
    "DatasetName",
    "DatasetQualityMetrics",
    "LeakageReport",
    "LeakageViolation",
    "ManifestRecord",
    "SplitType",
    "AudioFileValidator",
    "SUPPORTED_AUDIO_EXTENSIONS",
    "BaseDatasetAdapter",
    "GenericAudioAdapter",
    "ASVSpoofAdapter",
    "IndicVoicesAdapter",
    "IndicParlerTTSAdapter",
    "LeakageDetector",
    "MANIFEST_COLUMNS",
    "ManifestGenerator",
    "ManifestReader",
    "ManifestWriter",
    "QualityReporter",
]
