"""
Audio Injection & Manipulation Indicator Engine
Detects transport/injection anomalies, unnatural splicing boundaries,
abrupt spectral discontinuities, and repeated synthetic packet blocks.
"""

import numpy as np
from typing import Dict, List, Optional
from ai.app.core.types import ManipulationLevel, ManipulationAnalysisResult


class AudioManipulationDetector:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self._prev_boundary_sample: Optional[float] = None
        self._prev_sequence_number: Optional[int] = None
        self._session_boundaries: Dict[str, float] = {}
        self._session_sequences: Dict[str, int] = {}

    def reset(self, session_id: Optional[str] = None) -> None:
        """Resets boundary continuity history for a specific session or globally."""
        if session_id:
            self._session_boundaries.pop(session_id, None)
            self._session_sequences.pop(session_id, None)
        else:
            self._prev_boundary_sample = None
            self._prev_sequence_number = None
            self._session_boundaries.clear()
            self._session_sequences.clear()

    def analyze(
        self,
        samples: np.ndarray,
        sequence_number: Optional[int] = None,
        has_sequence_gap: Optional[bool] = None,
        session_id: Optional[str] = None
    ) -> ManipulationAnalysisResult:
        """
        Evaluates audio chunk for injection, splicing, or packet manipulation cues.
        Suppresses cross-chunk boundary step analysis when a known network packet gap is detected.
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

        # Retrieve prior state (session-specific if provided, else default instance state)
        if session_id:
            prev_sample = self._session_boundaries.get(session_id)
            prev_seq = self._session_sequences.get(session_id)
        else:
            prev_sample = self._prev_boundary_sample
            prev_seq = self._prev_sequence_number

        # Determine if a network packet / sequence gap occurred
        is_gap = False
        if has_sequence_gap is True:
            is_gap = True
        elif has_sequence_gap is False:
            is_gap = False
        elif prev_seq is not None and sequence_number is not None:
            # Automatic gap detection when sequence_number jumps by more than 1 or is non-consecutive
            if sequence_number != prev_seq + 1:
                is_gap = True

        # 1. Boundary Discontinuity Check
        discontinuity_score = 0.0
        if is_gap:
            explainability.append(
                f"Network packet gap detected (seq={sequence_number}, prev_seq={prev_seq}); "
                "cross-chunk boundary amplitude analysis suppressed."
            )
        elif prev_sample is not None and len(samples) > 0:
            step = abs(samples[0] - prev_sample)
            if step > 0.45:  # Abrupt amplitude step jump > 45% full-scale
                cues += 1
                discontinuity_score = round(step, 3)
                indicators.append(f"Abrupt cross-chunk waveform discontinuity step ({round(step, 2)})")
                explainability.append("Abrupt waveform step at frame boundary indicates possible audio splicing or stream injection.")

        # Update boundary history for subsequent consecutive chunks
        curr_trailing_sample = float(samples[-1]) if len(samples) > 0 else None
        if session_id:
            if curr_trailing_sample is not None:
                self._session_boundaries[session_id] = curr_trailing_sample
            if sequence_number is not None:
                self._session_sequences[session_id] = sequence_number
        else:
            self._prev_boundary_sample = curr_trailing_sample
            self._prev_sequence_number = sequence_number

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
