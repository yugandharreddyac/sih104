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
