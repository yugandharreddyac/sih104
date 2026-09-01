"""
Unified Pipeline Orchestrator Types (Phase 6.6)
Defines structured multi-modal analysis contracts for real-time live streaming call analysis.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone

from ai.app.core.types import (
    LanguageCode,
    RiskLevel,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ReplayStatus,
    AudioQualityRating,
    VADState
)


class UnifiedPipelineResult(BaseModel):
    call_id: str
    stream_id: Optional[str] = None
    chunk_index: int
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # Language Metadata
    language_code: LanguageCode
    language_display: str
    language_confidence: float
    language_source: str
    mixed_language_detected: bool = False

    # ASR & Transcript Metadata
    transcript: str
    redacted_transcript: str
    asr_confidence: float
    asr_uncertainty: float
    asr_engine_status: str

    # Acoustic & Biometric Telemetry
    speaker_status: SpeakerVerificationStatus
    speaker_similarity_score: Optional[float] = None
    speaker_confidence: Optional[float] = None
    speaker_claimed_id: Optional[str] = None
    speaker_engine_status: str

    deepfake_status: DeepfakeStatus
    deepfake_spoof_score: Optional[float] = None
    deepfake_confidence: Optional[float] = None
    deepfake_artifacts: List[str] = Field(default_factory=list)
    deepfake_engine_status: str

    replay_status: ReplayStatus
    replay_score: Optional[float] = None

    audio_quality_rating: AudioQualityRating
    vad_state: VADState

    # Multi-Modal Risk Fusion & Decision
    overall_risk_score: float
    risk_level: RiskLevel
    risk_confidence: float
    risk_uncertainty: float
    risk_dimensions: Dict[str, float] = Field(default_factory=dict)
    risk_velocity: float = 0.0
    risk_trajectory_trend: str = "STABLE"
    policy_recommendation: Optional[str] = None

    # Pipeline Health & Isolation Tracking
    component_statuses: Dict[str, str] = Field(default_factory=dict)
    component_errors: Dict[str, str] = Field(default_factory=dict)
    pipeline_latency_ms: float
    explainability: List[str] = Field(default_factory=list)
