"""
Unit & Adversarial Tests for Acoustic Deepfake Detection (Phase 3)
Validates synthetic speech vs bona fide feature extraction, quality-aware uncertainty, and calibration.
"""

import base64
import numpy as np
import pytest
from ai.app.deepfake.detector import DeepfakeDetector
from ai.app.deepfake.features import AcousticFeatureExtractor
from ai.app.core.types import AudioChunkPayload, DeepfakeStatus, AudioQualityResult, AudioQualityRating


def generate_bona_fide_human_speech(duration_sec: float = 1.0, sample_rate: int = 16000) -> str:
    """Generates synthetic speech with natural dynamic pitch contour and rich formant harmonics."""
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    # Dynamic F0 fundamental contour (120Hz to 160Hz) + formants at 500, 1500, 2500Hz
    f0 = 130 + 20 * np.sin(2 * np.pi * 3 * t)
    phase = 2 * np.pi * np.cumsum(f0) / sample_rate
    voice = (
        0.4 * np.sin(phase) +
        0.3 * np.sin(2 * phase) +
        0.2 * np.sin(3 * phase) +
        0.1 * np.sin(4 * phase)
    )
    # Add natural vocal tract modulation
    mod = 0.5 + 0.5 * np.cos(2 * np.pi * 5 * t)
    voice = voice * mod
    int16_samples = (voice * 20000).astype(np.int16)
    return base64.b64encode(int16_samples.tobytes()).decode("utf-8")


def generate_vocoder_synthetic_voice(duration_sec: float = 1.0, sample_rate: int = 16000) -> str:
    """Generates synthetic voice with oversmoothed spectral envelope and high-frequency phase jitter."""
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    # Rigid monotonic pitch (140Hz)
    voice = 0.5 * np.sin(2 * np.pi * 140 * t)
    # Add high-frequency vocoder phase artifact
    high_noise = 0.15 * np.sin(2 * np.pi * 5500 * t + np.random.randn(len(t)) * 0.5)
    combined = voice + high_noise
    int16_samples = (combined * 20000).astype(np.int16)
    return base64.b64encode(int16_samples.tobytes()).decode("utf-8")


def test_bona_fide_human_speech_classification():
    detector = DeepfakeDetector(sample_rate=16000)
    audio_b64 = generate_bona_fide_human_speech(duration_sec=1.0)
    chunk = AudioChunkPayload(
        call_id="call-bona-fide-01",
        chunk_index=0,
        sample_rate=16000,
        audio_base64=audio_b64
    )
    result = detector.analyze(chunk)
    assert result.status in [DeepfakeStatus.AUTHENTIC, DeepfakeStatus.INCONCLUSIVE]
    assert result.spoof_score is not None
    assert result.spoof_score < 0.65
    assert result.inference_latency_ms > 0.0


def test_vocoder_synthetic_detection():
    detector = DeepfakeDetector(sample_rate=16000)
    audio_b64 = generate_vocoder_synthetic_voice(duration_sec=1.0)
    chunk = AudioChunkPayload(
        call_id="call-synthetic-02",
        chunk_index=1,
        sample_rate=16000,
        audio_base64=audio_b64
    )
    result = detector.analyze(chunk)
    assert result.spoof_score is not None
    assert result.spoof_score >= 0.35
    assert len(result.explainability) > 0


def test_quality_degradation_increases_uncertainty_never_spoofs():
    detector = DeepfakeDetector(sample_rate=16000)
    audio_b64 = generate_bona_fide_human_speech(duration_sec=1.0)
    chunk = AudioChunkPayload(
        call_id="call-poor-quality-03",
        chunk_index=2,
        sample_rate=16000,
        audio_base64=audio_b64
    )
    poor_quality = AudioQualityResult(
        rating=AudioQualityRating.POOR,
        rms_dbfs=-55.0,
        peak_amplitude=0.99,
        clipping_ratio=0.12,
        silence_ratio=0.2,
        snr_estimate_db=3.0,
        dynamic_range_db=4.0,
        sample_rate=16000,
        channels=1,
        duration_ms=1000.0,
        uncertainty_penalty=0.85,
        notes="Severe clipping and low SNR."
    )
    result = detector.analyze(chunk, quality=poor_quality)
    # MUST yield INCONCLUSIVE with high uncertainty, NOT a false positive SUSPICIOUS
    assert result.status == DeepfakeStatus.INCONCLUSIVE
    assert result.uncertainty >= 0.80
