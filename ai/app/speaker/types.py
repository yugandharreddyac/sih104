"""
Speaker Biometric & Verification Specific Types
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from ai.app.core.types import SpeakerVerificationStatus, SpeakerProfile


class SpeakerEmbeddingVector(BaseModel):
    speaker_id: Optional[str] = None
    embedding: List[float]
    dimension: int = 128
    energy_norm: float
    model_version: str
    engine_type: str = "DSP_FALLBACK"


class EnrollmentValidationResult(BaseModel):
    is_valid: bool
    audio_quality_rating: str
    anti_spoof_passed: bool
    rejection_reason: Optional[str] = None
    samples_evaluated: int
    duration_seconds: float
