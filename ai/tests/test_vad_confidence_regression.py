"""
Regression tests for VAD confidence calculation bounds.
Ensures that low-energy audio in the NON_SPEECH branch never yields negative confidence
and always satisfies the VADResult Pydantic schema constraint (0.0 <= confidence <= 1.0).
"""

import numpy as np
import pytest
from ai.app.audio.vad import VoiceActivityDetector
from ai.app.core.types import VADState, VADResult


def test_vad_low_energy_non_speech_confidence_bounds():
    """
    Test that low-energy audio (energy_rms < 0.004) entering the NON_SPEECH branch
    calculates a valid confidence in [0.0, 1.0] without raising a Pydantic ValidationError.
    """
    vad = VoiceActivityDetector(sample_rate=16000)

    # Generate low-energy audio with various frequencies to trigger non-speech branch
    t = np.linspace(0, 0.25, 4000, endpoint=False)
    
    # Test across multiple low amplitude scales that previously caused negative confidence
    for amplitude in [10, 50, 100, 200, 500]:
        samples = (np.sin(2 * np.pi * 440 * t) * amplitude).astype(np.float32) / 32768.0
        
        result = vad.process_samples(samples)
        
        assert isinstance(result, VADResult)
        assert result.confidence >= 0.0, f"Confidence {result.confidence} was negative for amplitude {amplitude}"
        assert result.confidence <= 1.0, f"Confidence {result.confidence} exceeded 1.0 for amplitude {amplitude}"
        assert 0.0 <= result.speech_probability <= 1.0


def test_vad_synthetic_tone_confidence_bounds():
    """
    Test that the synthetic test tone used by the frontend (amplitude 12000)
    produces a valid VADResult within bounds.
    """
    vad = VoiceActivityDetector(sample_rate=16000)
    t = np.linspace(0, 0.25, 4000, endpoint=False)
    samples = (np.sin(2 * np.pi * 440 * t) * 12000).astype(np.float32) / 32768.0

    result = vad.process_samples(samples)

    assert isinstance(result, VADResult)
    assert 0.0 <= result.confidence <= 1.0
    assert 0.0 <= result.speech_probability <= 1.0


def test_vad_high_energy_speech_sample():
    """
    Test normal high-energy audio to ensure normal SPEECH detection
    and confidence calculation remain intact.
    """
    vad = VoiceActivityDetector(sample_rate=16000)
    t = np.linspace(0, 0.25, 4000, endpoint=False)
    samples = (np.sin(2 * np.pi * 300 * t) * 28000).astype(np.float32) / 32768.0

    result = vad.process_samples(samples)

    assert isinstance(result, VADResult)
    assert result.state == VADState.SPEECH
    assert 0.0 <= result.confidence <= 1.0
    assert result.confidence >= 0.5


def test_vad_silence_sample():
    """
    Test absolute silence to verify baseline non-speech behavior.
    """
    vad = VoiceActivityDetector(sample_rate=16000)
    samples = np.zeros(4000, dtype=np.float32)

    result = vad.process_samples(samples)

    assert isinstance(result, VADResult)
    assert result.state == VADState.NON_SPEECH
    assert 0.0 <= result.confidence <= 1.0
