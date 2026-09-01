"""
Voice Activity Detection (VAD) Engine
Phase 2: Real acoustic multi-feature speech detector (Energy RMS + Zero-Crossing Rate + Spectral Centroid).
Distinguishes SPEECH, NON_SPEECH, and UNCERTAIN with real measured latency.
"""

import time
import numpy as np
from typing import Tuple
from ai.app.core.types import VADState, VADResult, PipelineStatus


class VoiceActivityDetector:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.status = PipelineStatus.AVAILABLE
        self.model_version = "acoustic_multi_feature_vad_v2"
        # Speech band frequencies
        self.min_speech_freq = 250.0  # Hz
        self.max_speech_freq = 3600.0  # Hz
        # Adaptive noise floor baseline
        self.noise_floor_rms = 0.005

    def process_samples(self, samples: np.ndarray) -> VADResult:
        """
        Analyzes 1D float32 audio samples in [-1.0, 1.0] and computes acoustic VAD metrics.
        """
        start_time = time.perf_counter()

        if len(samples) == 0:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            return VADResult(
                state=VADState.NON_SPEECH,
                speech_probability=0.0,
                energy_rms=0.0,
                zero_crossing_rate=0.0,
                spectral_centroid=0.0,
                confidence=1.0,
                processing_latency_ms=round(elapsed_ms, 3)
            )

        # 1. Short-Time Energy (RMS)
        energy_rms = float(np.sqrt(np.mean(samples ** 2)))

        # Update adaptive noise floor slowly
        if energy_rms < self.noise_floor_rms * 1.5:
            self.noise_floor_rms = 0.95 * self.noise_floor_rms + 0.05 * max(energy_rms, 1e-5)

        # 2. Zero-Crossing Rate (ZCR)
        signs = np.sign(samples)
        # Handle zeros
        signs[signs == 0] = 1
        zcr = float(np.sum(np.abs(np.diff(signs))) / (2 * len(samples)))

        # 3. Spectral Centroid via FFT
        fft_data = np.abs(np.fft.rfft(samples))
        freqs = np.fft.rfftfreq(len(samples), 1.0 / self.sample_rate)
        fft_sum = np.sum(fft_data)
        if fft_sum > 1e-6:
            spectral_centroid = float(np.sum(freqs * fft_data) / fft_sum)
            # Energy in speech band (300Hz - 3400Hz)
            speech_band_mask = (freqs >= self.min_speech_freq) & (freqs <= self.max_speech_freq)
            speech_band_ratio = float(np.sum(fft_data[speech_band_mask]) / fft_sum)
        else:
            spectral_centroid = 0.0
            speech_band_ratio = 0.0

        # 4. Multi-Feature Speech Probability Formulation
        # SNR relative to estimated noise floor
        snr = energy_rms / max(self.noise_floor_rms, 1e-4)
        snr_score = float(np.clip((snr - 1.5) / 5.0, 0.0, 1.0))

        # ZCR scoring: Typical conversational voiced/unvoiced speech ZCR is between 0.03 and 0.35
        if 0.02 <= zcr <= 0.40:
            zcr_score = 1.0 - abs(zcr - 0.15) / 0.25
        else:
            zcr_score = 0.1
        zcr_score = float(np.clip(zcr_score, 0.0, 1.0))

        # Band concentration score
        band_score = float(np.clip(speech_band_ratio * 1.4, 0.0, 1.0))

        # Weighted speech probability (Logistics formulation)
        raw_score = 0.50 * snr_score + 0.25 * band_score + 0.25 * zcr_score
        # If absolute energy is near zero silence, force low
        if energy_rms < 0.003:
            raw_score *= (energy_rms / 0.003)

        speech_probability = float(np.clip(raw_score, 0.0, 1.0))

        # State Decision Boundaries
        if speech_probability >= 0.55 and energy_rms > 0.01:
            state = VADState.SPEECH
            confidence = min(1.0, 0.5 + (speech_probability - 0.55) * 1.1)
        elif speech_probability <= 0.30 or energy_rms < 0.004:
            state = VADState.NON_SPEECH
            confidence = min(1.0, 0.5 + (0.30 - speech_probability) * 1.5)
        else:
            state = VADState.UNCERTAIN
            confidence = 0.45

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        return VADResult(
            state=state,
            speech_probability=round(speech_probability, 4),
            energy_rms=round(energy_rms, 5),
            zero_crossing_rate=round(zcr, 4),
            spectral_centroid=round(spectral_centroid, 1),
            confidence=round(confidence, 3),
            processing_latency_ms=round(elapsed_ms, 3)
        )
