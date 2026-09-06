"""
Replay Attack Detection Types
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from ai.app.core.types import ReplayStatus


class ReplayFeatureVector(BaseModel):
    spectral_decay_slope: float
    high_freq_cutoff_ratio: float
    reverberation_decay_time_ms: float
    channel_impulse_distortion: float
    is_narrowband: bool = False
    effective_bandwidth_hz: float = 8000.0
    spectral_flatness: float = 0.0
    spectral_centroid_hz: float = 0.0
    spectral_bandwidth_hz: float = 0.0
    # Task 2.2: Temporal modulation features (4-20 Hz band)
    modulation_energy_ratio_4_20hz: float = 0.0
    modulation_spectral_entropy: float = 0.0
    dominant_modulation_hz: float = 0.0
    # Task 2.2: Cepstral / homomorphic spectral features
    cepstral_peak_prominence: float = 0.0
    cepstral_energy_ratio: float = 0.0

