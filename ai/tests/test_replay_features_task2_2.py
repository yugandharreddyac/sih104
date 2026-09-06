"""
Unit Tests for Task 2.2 — Temporal Modulation & Cepstral / Homomorphic Features

NOTE ON TEST METHODOLOGY:
Synthetic test signals demonstrate mathematical correctness, stability, scaling,
and bounds of the DSP implementation only. They do NOT constitute scientific or
real-world physical replay classification accuracy benchmarks.
"""

import numpy as np
import pytest

from ai.app.replay.features import ReplayFeatureExtractor
from ai.app.replay.types import ReplayFeatureVector
from ai.app.replay.detector import ReplayDetector
from ai.app.core.types import AudioChunkPayload, ReplayStatus


def test_clean_deterministic_synthetic_speech():
    """Validates feature extraction on a clean deterministic harmonic signal at 16 kHz."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    # Voiced vowel-like harmonic carrier: F0=150 Hz + harmonics
    samples = (
        0.3 * np.sin(2 * np.pi * 150.0 * t) +
        0.2 * np.sin(2 * np.pi * 300.0 * t) +
        0.15 * np.sin(2 * np.pi * 450.0 * t) +
        0.1 * np.sin(2 * np.pi * 600.0 * t)
    ).astype(np.float32)

    feats = extractor.extract_features(samples)

    assert isinstance(feats, ReplayFeatureVector)
    assert 0.0 <= feats.modulation_energy_ratio_4_20hz <= 1.0
    assert 0.0 <= feats.modulation_spectral_entropy <= 1.0
    assert feats.dominant_modulation_hz >= 0.0
    assert 0.0 <= feats.cepstral_peak_prominence <= 20.0
    assert 0.0 <= feats.cepstral_energy_ratio <= 1.0


def test_repeated_deterministic_execution_gives_identical_values():
    """Validates that consecutive extractions on identical samples produce bitwise identical outputs."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    t = np.linspace(0, 0.5, 8000, endpoint=False)
    samples = (0.35 * np.sin(2 * np.pi * 220.0 * t) + 0.15 * np.sin(2 * np.pi * 880.0 * t)).astype(np.float32)

    f1 = extractor.extract_features(samples)
    f2 = extractor.extract_features(samples)

    assert f1.modulation_energy_ratio_4_20hz == f2.modulation_energy_ratio_4_20hz
    assert f1.modulation_spectral_entropy == f2.modulation_spectral_entropy
    assert f1.dominant_modulation_hz == f2.dominant_modulation_hz
    assert f1.cepstral_peak_prominence == f2.cepstral_peak_prominence
    assert f1.cepstral_energy_ratio == f2.cepstral_energy_ratio


def test_different_signal_durations():
    """Validates extraction across multiple signal durations (250ms, 500ms, 1000ms, 2000ms)."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)

    for dur_sec in [0.25, 0.5, 1.0, 2.0]:
        n_samples = int(dur_sec * 16000)
        t = np.linspace(0, dur_sec, n_samples, endpoint=False)
        samples = (0.4 * np.sin(2 * np.pi * 200.0 * t)).astype(np.float32)

        feats = extractor.extract_features(samples)
        assert np.isfinite(feats.modulation_energy_ratio_4_20hz)
        assert np.isfinite(feats.modulation_spectral_entropy)
        assert np.isfinite(feats.dominant_modulation_hz)
        assert np.isfinite(feats.cepstral_peak_prominence)
        assert np.isfinite(feats.cepstral_energy_ratio)


def test_8khz_telephony_input():
    """Validates feature extraction on 8 kHz telephony-rate audio."""
    extractor = ReplayFeatureExtractor(sample_rate=8000)
    t = np.linspace(0, 1.0, 8000, endpoint=False)
    # Bandlimited telephone tone
    samples = (0.4 * np.sin(2 * np.pi * 400.0 * t) + 0.2 * np.sin(2 * np.pi * 1200.0 * t)).astype(np.float32)

    feats = extractor.extract_features(samples)
    assert feats.is_narrowband is True
    assert 0.0 <= feats.modulation_energy_ratio_4_20hz <= 1.0
    assert 0.0 <= feats.modulation_spectral_entropy <= 1.0
    assert 0.0 <= feats.cepstral_peak_prominence <= 20.0
    assert 0.0 <= feats.cepstral_energy_ratio <= 1.0


def test_16khz_wideband_input():
    """Validates feature extraction on 16 kHz wideband audio."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    samples = (0.3 * np.sin(2 * np.pi * 500.0 * t) + 0.2 * np.sin(2 * np.pi * 3500.0 * t)).astype(np.float32)

    feats = extractor.extract_features(samples)
    assert np.isfinite(feats.modulation_energy_ratio_4_20hz)
    assert np.isfinite(feats.cepstral_peak_prominence)


def test_very_short_input_returns_safe_defaults():
    """Signals shorter than 320 samples return safe zero defaults without raising exceptions."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    short_samples = np.array([0.1, -0.1, 0.2, -0.2] * 20, dtype=np.float32)  # 80 samples

    feats = extractor.extract_features(short_samples)
    assert feats.modulation_energy_ratio_4_20hz == 0.0
    assert feats.modulation_spectral_entropy == 0.0
    assert feats.dominant_modulation_hz == 0.0
    assert feats.cepstral_peak_prominence == 0.0
    assert feats.cepstral_energy_ratio == 0.0


def test_silence_input():
    """Pure zero-energy silence returns bounded zero features."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    silent_samples = np.zeros(16000, dtype=np.float32)

    feats = extractor.extract_features(silent_samples)
    assert feats.modulation_energy_ratio_4_20hz == 0.0
    assert feats.modulation_spectral_entropy == 0.0
    assert feats.dominant_modulation_hz == 0.0
    assert feats.cepstral_peak_prominence == 0.0
    assert feats.cepstral_energy_ratio == 0.0


def test_near_silence_input():
    """Extremely quiet signal (RMS < 1e-4) returns safe zero defaults."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    quiet_samples = (1e-6 * np.ones(16000, dtype=np.float32))

    feats = extractor.extract_features(quiet_samples)
    assert feats.modulation_energy_ratio_4_20hz == 0.0
    assert feats.cepstral_peak_prominence == 0.0


def test_nan_input_sanitized_safely():
    """Audio containing NaNs is sanitized without causing NaNs in feature outputs."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    samples = np.zeros(16000, dtype=np.float32)
    samples[100:200] = np.nan
    samples[500:5000] = 0.3 * np.sin(2 * np.pi * 300.0 * np.linspace(0, 1, 4500))

    feats = extractor.extract_features(samples)
    assert np.isfinite(feats.modulation_energy_ratio_4_20hz)
    assert np.isfinite(feats.modulation_spectral_entropy)
    assert np.isfinite(feats.dominant_modulation_hz)
    assert np.isfinite(feats.cepstral_peak_prominence)
    assert np.isfinite(feats.cepstral_energy_ratio)


def test_inf_input_sanitized_safely():
    """Audio containing +/- Infs is sanitized safely."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    samples = np.zeros(16000, dtype=np.float32)
    samples[50:80] = np.inf
    samples[80:110] = -np.inf
    samples[200:8000] = 0.2 * np.sin(2 * np.pi * 400.0 * np.linspace(0, 0.5, 7800))

    feats = extractor.extract_features(samples)
    assert np.isfinite(feats.modulation_energy_ratio_4_20hz)
    assert np.isfinite(feats.cepstral_peak_prominence)


def test_constant_dc_signal():
    """A constant non-zero DC signal has zero envelope modulation and zero cepstral peak prominence."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    dc_samples = 0.3 * np.ones(16000, dtype=np.float32)

    feats = extractor.extract_features(dc_samples)
    assert feats.modulation_energy_ratio_4_20hz == 0.0
    assert feats.dominant_modulation_hz == 0.0


def test_modulated_synthetic_signal():
    """
    A 1000 Hz carrier amplitude-modulated at 8 Hz (within 4-20 Hz band)
    must produce elevated modulation energy in the 4-20 Hz band.
    """
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    # Carrier 1000 Hz, AM at 8 Hz with 50% modulation depth
    carrier = np.sin(2 * np.pi * 1000.0 * t)
    modulator = 0.5 * (1.0 + np.sin(2 * np.pi * 8.0 * t))
    modulated_signal = (carrier * modulator).astype(np.float32)

    feats = extractor.extract_features(modulated_signal)
    assert feats.modulation_energy_ratio_4_20hz > 0.30
    assert 6.0 <= feats.dominant_modulation_hz <= 10.0


def test_spectrally_filtered_reverberant_synthetic_signal():
    """
    A reverberant decayed signal with smeared envelope and distortion
    extracts finite modulation and cepstral features.
    """
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    envelope = np.exp(-t * 2.0)
    sig = (envelope * (0.4 * np.sin(2 * np.pi * 500.0 * t) + 0.2 * (np.sin(2 * np.pi * 500.0 * t) ** 3))).astype(np.float32)

    feats = extractor.extract_features(sig)
    assert np.isfinite(feats.modulation_energy_ratio_4_20hz)
    assert np.isfinite(feats.modulation_spectral_entropy)
    assert np.isfinite(feats.cepstral_peak_prominence)
    assert np.isfinite(feats.cepstral_energy_ratio)


def test_feature_outputs_strictly_finite_and_bounded():
    """All 5 new scalar metrics are strictly finite and respect their mathematical bounds."""
    extractor = ReplayFeatureExtractor(sample_rate=16000)
    rng = np.random.RandomState(42)
    random_samples = rng.normal(0, 0.2, 16000).astype(np.float32)

    feats = extractor.extract_features(random_samples)
    assert np.isfinite(feats.modulation_energy_ratio_4_20hz)
    assert 0.0 <= feats.modulation_energy_ratio_4_20hz <= 1.0

    assert np.isfinite(feats.modulation_spectral_entropy)
    assert 0.0 <= feats.modulation_spectral_entropy <= 1.0

    assert np.isfinite(feats.dominant_modulation_hz)
    assert feats.dominant_modulation_hz >= 0.0

    assert np.isfinite(feats.cepstral_peak_prominence)
    assert 0.0 <= feats.cepstral_peak_prominence <= 20.0

    assert np.isfinite(feats.cepstral_energy_ratio)
    assert 0.0 <= feats.cepstral_energy_ratio <= 1.0


def test_detector_corroboration_integration():
    """
    Validates that modulation and cepstral anomalies act as corroborating evidence
    without independently triggering confirmed REPLAY on otherwise clean audio.
    """
    import base64
    detector = ReplayDetector(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)

    # Direct clean tone: no physical playback cues
    clean_samples = (0.4 * np.sin(2 * np.pi * 400.0 * t)).astype(np.float32)
    int16 = (clean_samples * 20000).astype(np.int16)
    audio_b64 = base64.b64encode(int16.tobytes()).decode("utf-8")

    chunk = AudioChunkPayload(call_id="call-corrob-test", chunk_index=0, audio_base64=audio_b64)
    res = detector.detect_replay(chunk)

    # Invariant: Must NOT be REPLAY in absence of physical cues
    assert res.status == ReplayStatus.NOT_REPLAY
    assert res.replay_probability <= 0.25
    assert hasattr(res, "modulation_anomaly")
    assert hasattr(res, "cepstral_anomaly")
