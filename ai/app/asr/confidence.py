"""
ASR Confidence & Uncertainty Calculator
Propagates audio quality degradations into ASR uncertainty penalties.
"""

from typing import Tuple
from ai.app.core.types import AudioQualityResult, AudioQualityRating


class ASRConfidenceCalculator:
    def calculate_confidence(
        self,
        base_confidence: float,
        quality: AudioQualityResult = None
    ) -> Tuple[float, float]:
        """
        Calculates (calibrated_confidence, uncertainty).
        """
        if quality is None:
            return round(base_confidence, 3), round(1.0 - base_confidence, 3)

        quality_penalty = quality.uncertainty_penalty

        if quality.rating == AudioQualityRating.POOR:
            calibrated_conf = max(0.15, base_confidence * 0.40)
            uncertainty = max(0.75, 1.0 - calibrated_conf)
        elif quality.rating == AudioQualityRating.DEGRADED:
            calibrated_conf = max(0.35, base_confidence * (1.0 - quality_penalty * 0.5))
            uncertainty = max(0.35, 1.0 - calibrated_conf)
        else:
            calibrated_conf = base_confidence
            uncertainty = 1.0 - calibrated_conf

        return round(calibrated_conf, 3), round(uncertainty, 3)
