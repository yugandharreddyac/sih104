"""
Audio Injection & Manipulation Indicator Engine
Detects transport/injection anomalies, unnatural splicing boundaries,
abrupt spectral discontinuities, and repeated synthetic packet blocks.
"""

import numpy as np
from typing import List, Optional
from ai.app.core.types import ManipulationLevel, ManipulationAnalysisResult


class AudioManipulationDetector:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self._prev_boundary_sample: Optional[float] = None

    def analyze(self, samples: np.ndarray) -> ManipulationAnalysisResult:
        """
        Evaluates audio chunk for injection, splicing, or packet manipulation cues.
        """
        if len(samples) < 160:
            return ManipulationAnalysisResult(
                level=ManipulationLevel.NO_INDICATOR,
                discontinuity_score=0.0,
                splicing_detected=False,
                packet_repetition_detected=False,
                indicators=[],
                explainability=["Chunk too short for manipulation boundary evaluation."]
            )

        indicators: List[str] = []
        explainability: List[str] = []
        cues = 0

        # 1. Boundary Discontinuity Check
        discontinuity_score = 0.0
        if self._prev_boundary_sample is not None and len(samples) > 0:
            step = abs(samples[0] - self._prev_boundary_sample)
            if step > 0.45:  # Abrupt amplitude step jump > 45% full-scale
                cues += 1
                discontinuity_score = round(step, 3)
                indicators.append(f"Abrupt cross-chunk waveform discontinuity step ({round(step, 2)})")
                explainability.append("Abrupt waveform step at frame boundary indicates possible audio splicing or stream injection.")

        self._prev_boundary_sample = float(samples[-1]) if len(samples) > 0 else None

        # 2. Splicing Boundary Detection (Sudden mid-chunk zero-crossing drop or phase inversion)
        first_diff = np.abs(np.diff(samples))
        max_step = float(np.max(first_diff)) if len(first_diff) > 0 else 0.0
        splicing_detected = max_step > 0.70
        if splicing_detected:
            cues += 1
            indicators.append(f"Severe mid-frame amplitude impulse step ({round(max_step, 2)})")
            explainability.append("High amplitude impulse step without natural vocal onset suggests spliced audio segments.")

        # 3. Synthetic Repeated Block / Identical Packet Detection
        # Check if first half of chunk is identical to second half (replay/loop attack)
        packet_repetition = False
        half = len(samples) // 2
        if half > 200:
            diff_norm = np.linalg.norm(samples[:half] - samples[half:2*half])
            if diff_norm < 1e-4 and np.max(np.abs(samples)) > 0.05:
                packet_repetition = True
                cues += 2
                indicators.append("Identical audio block repetition detected (packet loop/injection)")
                explainability.append("Identical repeated audio frame detected, characteristic of stream injection or loop replay.")

        # Assign Manipulation Level
        if cues >= 2 or packet_repetition:
            level = ManipulationLevel.STRONG_INDICATOR
        elif cues == 1:
            level = ManipulationLevel.MODERATE_INDICATOR
        elif max_step > 0.40:
            level = ManipulationLevel.WEAK_INDICATOR
        else:
            level = ManipulationLevel.NO_INDICATOR
            explainability.append("No transport injection, unnatural splicing, or packet repetition detected.")

        return ManipulationAnalysisResult(
            level=level,
            discontinuity_score=discontinuity_score,
            splicing_detected=splicing_detected,
            packet_repetition_detected=packet_repetition,
            indicators=indicators,
            explainability=explainability
        )
