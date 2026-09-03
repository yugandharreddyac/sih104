"""
Deepfake Detection Specific Type Definitions
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from ai.app.core.types import DeepfakeStatus


class DeepfakeFeatureVector(BaseModel):
    log_mel_spectrogram_mean: List[float]
    lfcc_coefficients: List[float]
    spectral_flatness: float
    vocoder_phase_distortion: float
    high_freq_attenuation_ratio: float
    temporal_variance: float


class RawDeepfakePrediction(BaseModel):
    raw_spoof_score: float = Field(..., ge=0.0, le=1.0)
    raw_confidence: float = Field(..., ge=0.0, le=1.0)
    model_version: str
    engine_type: str = "DSP_FALLBACK"
    feature_vector: DeepfakeFeatureVector
    artifacts: List[str]
