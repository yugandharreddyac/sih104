"""
Audio Injection & Manipulation Indicator Engine (Master 2)
Detects transport/injection anomalies, unnatural splicing boundaries,
abrupt spectral flux discontinuities, unnatural digital zero insertion, and repeated synthetic packet blocks.
Deterministic, feature-based acoustic analysis with approximate temporal localization.
"""

import numpy as np
from typing import Dict, List, Optional, Tuple
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
                explainability.append(
                    f"Abrupt waveform step ({round(step, 2)}) at chunk boundary [0.0ms] indicates possible audio splicing or stream injection."
                )

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

        # 2. Splicing Boundary Detection (Sudden mid-chunk impulse step)
        first_diff = np.abs(np.diff(samples))
        max_step = float(np.max(first_diff)) if len(first_diff) > 0 else 0.0
        splicing_detected = max_step > 0.70
        if splicing_detected:
            cues += 1
            max_idx = int(np.argmax(first_diff))
            offset_ms = round((max_idx / self.sample_rate) * 1000.0, 1)
            indicators.append(f"Severe mid-frame amplitude impulse step ({round(max_step, 2)})")
            explainability.append(
                f"High amplitude impulse step ({round(max_step, 2)}) without natural vocal onset localized at {offset_ms}ms suggests spliced audio."
            )

        # 3. Synthetic Repeated Block / Identical Packet Detection
        packet_repetition = False
        half = len(samples) // 2
        if half > 200:
            diff_norm = np.linalg.norm(samples[:half] - samples[half:2*half])
            if diff_norm < 1e-4 and np.max(np.abs(samples)) > 0.05:
                packet_repetition = True
                cues += 2
                indicators.append("Identical audio block repetition detected (packet loop/injection)")
                explainability.append(
                    "Identical repeated audio frame detected across sub-blocks, characteristic of stream injection or loop replay."
                )

        # 4. Abrupt Spectral Discontinuity / Spectral Flux Jump Analysis
        flux_cue, flux_info = self._detect_spectral_flux_discontinuity(samples)
        if flux_cue:
            cues += 1
            indicators.append(flux_info["indicator"])
            explainability.append(flux_info["explanation"])

        # 5. Unnatural Digital Silence Insertion Detection
        silence_cue, silence_info = self._detect_unnatural_digital_silence(samples)
        if silence_cue:
            cues += 1
            indicators.append(silence_info["indicator"])
            explainability.append(silence_info["explanation"])

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

    def _detect_spectral_flux_discontinuity(self, samples: np.ndarray) -> Tuple[bool, Dict[str, str]]:
        """
        Calculates spectral flux between short adjacent windows to detect unnatural acoustic cuts.
        """
        win_len = int(self.sample_rate * 0.025)  # 25ms window (400 samples at 16kHz)
        hop_len = win_len // 2

        if len(samples) < win_len * 3:
            return False, {}

        # Compute STFT magnitude for each frame
        num_frames = (len(samples) - win_len) // hop_len
        if num_frames < 3:
            return False, {}

        magnitudes = []
        for i in range(num_frames):
            frame = samples[i * hop_len: i * hop_len + win_len] * np.hanning(win_len)
            spec = np.abs(np.fft.rfft(frame))
            spec_norm = spec / (np.linalg.norm(spec) + 1e-6)
            magnitudes.append(spec_norm)

        # Calculate spectral flux between consecutive frames
        fluxes = []
        for i in range(1, len(magnitudes)):
            diff = magnitudes[i] - magnitudes[i - 1]
            flux = float(np.sum(diff ** 2))
            fluxes.append(flux)

        if not fluxes:
            return False, {}

        max_flux = float(np.max(fluxes))
        median_flux = float(np.median(fluxes))

        # Check for abnormal flux jump (> 4.5x median flux and > 0.85 absolute with active signal)
        if max_flux > 0.85 and median_flux > 0.01 and (max_flux / median_flux) > 4.5:
            max_frame_idx = int(np.argmax(fluxes)) + 1
            offset_ms = round((max_frame_idx * hop_len / self.sample_rate) * 1000.0, 1)
            return True, {
                "indicator": f"Abrupt spectral flux discontinuity at ~{offset_ms}ms (flux={round(max_flux, 2)})",
                "explanation": f"Abrupt spectral envelope jump ({round(max_flux, 2)}) at ~{offset_ms}ms indicates potential acoustic splice."
            }

        return False, {}

    def _detect_unnatural_digital_silence(self, samples: np.ndarray) -> Tuple[bool, Dict[str, str]]:
        """
        Detects unnatural digital zero-insertion cuts (absolute silence < 1e-6)
        embedded inside active ambient audio.
        """
        silence_thresh = 1e-5
        is_silent = np.abs(samples) < silence_thresh
        zero_run_len = int(self.sample_rate * 0.030)  # 30ms

        if len(samples) < zero_run_len * 2:
            return False, {}

        # Check if overall audio has audible ambient sound
        rms = float(np.sqrt(np.mean(samples ** 2)))
        if rms < 0.04:  # Whole chunk is quiet, normal background silence
            return False, {}

        # Look for contiguous run of pure zero inside the audio
        run = 0
        max_run = 0
        start_idx = 0
        best_start = 0

        for idx, s in enumerate(is_silent):
            if s:
                if run == 0:
                    start_idx = idx
                run += 1
                if run > max_run:
                    max_run = run
                    best_start = start_idx
            else:
                run = 0

        if max_run >= zero_run_len and best_start > 100 and (best_start + max_run) < (len(samples) - 100):
            offset_ms = round((best_start / self.sample_rate) * 1000.0, 1)
            duration_ms = round((max_run / self.sample_rate) * 1000.0, 1)
            return True, {
                "indicator": f"Un-dithered digital zero cut ({duration_ms}ms) at ~{offset_ms}ms",
                "explanation": f"Absolute mathematical silence ({duration_ms}ms) within active speech at ~{offset_ms}ms indicates artificial splicing."
            }

        return False, {}
