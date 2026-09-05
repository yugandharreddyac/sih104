"""
Phase 1 Tests: Channel-Aware Deepfake Operating Thresholds
Validates:
1. Explicit WIDEBAND -> WIDEBAND -> threshold 0.685
2. Explicit TELEPHONY -> TELEPHONY -> threshold 0.525
3. AUTO + explicit telephony codec -> TELEPHONY -> threshold 0.525
4. AUTO + explicit non-telephony/unknown codec -> acoustic / WIDEBAND fallback (0.685)
5. AUTO + strong telephone-band acoustic evidence -> TELEPHONY -> threshold 0.525
6. AUTO + ambiguous acoustic evidence -> WIDEBAND -> threshold 0.685
7. POOR quality safety gate -> INCONCLUSIVE (never SUSPICIOUS)
8. Duration < 300ms safety gate -> INSUFFICIENT_AUDIO
9. Backward-compatible payload (no channel_type, no codec) -> safe WIDEBAND default
- threshold_applied & channel_type_applied presence & accuracy
- explainability audit trail
"""

import base64
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))


import numpy as np

try:
    # pyrefly: ignore [missing-import]
    import pytest
except ImportError:
    pytest = None

from ai.app.core.types import (
    AudioChunkPayload,
    AudioQualityRating,
    AudioQualityResult,
    ChannelType,
    DeepfakeAnalysisResult,
    DeepfakeStatus,
)
from ai.app.deepfake.calibration import (
    DeepfakeCalibrator,
    WIDEBAND_THRESHOLD,
    TELEPHONY_THRESHOLD,
    is_telephony_codec,
)
from ai.app.deepfake.detector import DeepfakeDetector
from ai.app.audio.quality import AudioQualityAnalyzer


def make_pcm_base64(duration_ms: float = 1000.0, sample_rate: int = 16000, freq: float = 440.0) -> str:
    """Generates synthetic tone PCM base64 string for a given duration."""
    n_samples = int(sample_rate * (duration_ms / 1000.0))
    if n_samples == 0:
        return ""
    t = np.linspace(0, duration_ms / 1000.0, n_samples, endpoint=False)
    samples = 0.5 * np.sin(2 * np.pi * freq * t)
    int16_samples = (samples * 32767).astype(np.int16)
    return base64.b64encode(int16_samples.tobytes()).decode("utf-8")


def make_wideband_pcm_base64(duration_ms: float = 1000.0, sample_rate: int = 16000) -> str:
    """Generates deterministic wideband audio PCM base64 with spectral content spanning across 5 kHz."""
    n_samples = int(sample_rate * (duration_ms / 1000.0))
    if n_samples == 0:
        return ""
    t = np.linspace(0, duration_ms / 1000.0, n_samples, endpoint=False)
    samples = 0.3 * np.sin(2 * np.pi * 1000.0 * t) + 0.3 * np.sin(2 * np.pi * 5000.0 * t)
    int16_samples = (samples * 32767).astype(np.int16)
    return base64.b64encode(int16_samples.tobytes()).decode("utf-8")


def make_quality_result(
    rating: AudioQualityRating = AudioQualityRating.GOOD,
    duration_ms: float = 1000.0,
    rms_dbfs: float = -20.0,
    snr_estimate_db: float = 25.0,
    silence_ratio: float = 0.05,
    spectral_bandwidth_hz: float = 7000.0,
    high_frequency_ratio: float = 0.18,
    uncertainty_penalty: float = 0.0,
) -> AudioQualityResult:
    return AudioQualityResult(
        rating=rating,
        rms_dbfs=rms_dbfs,
        peak_amplitude=0.6,
        clipping_ratio=0.0,
        silence_ratio=silence_ratio,
        snr_estimate_db=snr_estimate_db,
        dynamic_range_db=30.0,
        sample_rate=16000,
        channels=1,
        duration_ms=duration_ms,
        uncertainty_penalty=uncertainty_penalty,
        notes="Test quality fixture",
        spectral_bandwidth_hz=spectral_bandwidth_hz,
        high_frequency_ratio=high_frequency_ratio,
    )


# ============================================================================
# 1. Explicit WIDEBAND
# ============================================================================
def test_scenario_1_explicit_wideband():
    calibrator = DeepfakeCalibrator()
    ch, th, reason = calibrator.resolve_threshold(channel_type=ChannelType.WIDEBAND)
    assert ch == ChannelType.WIDEBAND
    assert th == WIDEBAND_THRESHOLD
    assert "explicit metadata" in reason

    # Detector end-to-end
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-wb-1",
        chunk_index=0,
        audio_base64=make_pcm_base64(1000.0),
        channel_type=ChannelType.WIDEBAND,
    )
    result = detector.analyze(chunk)
    assert result.channel_type_applied == ChannelType.WIDEBAND
    assert result.threshold_applied == WIDEBAND_THRESHOLD
    assert any("Applied channel type: WIDEBAND" in exp for exp in result.explainability)
    assert any(str(WIDEBAND_THRESHOLD) in exp for exp in result.explainability)


# ============================================================================
# 2. Explicit TELEPHONY
# ============================================================================
def test_scenario_2_explicit_telephony():
    calibrator = DeepfakeCalibrator()
    ch, th, reason = calibrator.resolve_threshold(channel_type=ChannelType.TELEPHONY)
    assert ch == ChannelType.TELEPHONY
    assert th == TELEPHONY_THRESHOLD
    assert "explicit metadata" in reason

    # Detector end-to-end
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-tel-2",
        chunk_index=0,
        audio_base64=make_pcm_base64(1000.0),
        channel_type=ChannelType.TELEPHONY,
    )
    result = detector.analyze(chunk)
    assert result.channel_type_applied == ChannelType.TELEPHONY
    assert result.threshold_applied == TELEPHONY_THRESHOLD
    assert any("Applied channel type: TELEPHONY" in exp for exp in result.explainability)
    assert any(str(TELEPHONY_THRESHOLD) in exp for exp in result.explainability)


# ============================================================================
# 3. AUTO + Explicit Telephony Codec
# ============================================================================
def test_scenario_3_auto_telephony_codec():
    calibrator = DeepfakeCalibrator()
    for codec in ["g711", "pcma", "PCMU", "alaw", "amr-nb", "audio/g729", "gsm"]:
        ch, th, reason = calibrator.resolve_threshold(channel_type=ChannelType.AUTO, codec=codec)
        assert ch == ChannelType.TELEPHONY, f"Failed for codec {codec}"
        assert th == TELEPHONY_THRESHOLD
        assert "telephony codec metadata" in reason

    # Detector end-to-end
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-codec-3",
        chunk_index=0,
        audio_base64=make_pcm_base64(1000.0),
        channel_type=ChannelType.AUTO,
        codec="g711u",
    )
    result = detector.analyze(chunk)
    assert result.channel_type_applied == ChannelType.TELEPHONY
    assert result.threshold_applied == TELEPHONY_THRESHOLD
    assert any("Applied channel type: TELEPHONY" in exp for exp in result.explainability)


# ============================================================================
# 4. AUTO + Explicit Non-Telephony / Unknown Codec
# ============================================================================
def test_scenario_4_auto_non_telephony_codec():
    calibrator = DeepfakeCalibrator()
    quality = make_quality_result(spectral_bandwidth_hz=7200.0, high_frequency_ratio=0.15)
    for codec in ["opus", "pcm_s16le", "aac", "flac", "unknown_codec_xyz"]:
        ch, th, reason = calibrator.resolve_threshold(
            channel_type=ChannelType.AUTO,
            codec=codec,
            quality=quality,
        )
        assert ch == ChannelType.WIDEBAND, f"Expected WIDEBAND for {codec}"
        assert th == WIDEBAND_THRESHOLD

    # Detector end-to-end
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-non-tel-4",
        chunk_index=0,
        audio_base64=make_pcm_base64(1000.0),
        channel_type=ChannelType.AUTO,
        codec="opus",
    )
    result = detector.analyze(chunk, quality=quality)
    assert result.channel_type_applied == ChannelType.WIDEBAND
    assert result.threshold_applied == WIDEBAND_THRESHOLD


# ============================================================================
# 5. AUTO + Strong Telephone-Band Acoustic Evidence
# ============================================================================
def test_scenario_5_auto_strong_narrowband_evidence():
    calibrator = DeepfakeCalibrator()
    # Strong telephone band: bandwidth <= 3800 Hz, HF ratio < 0.05, RMS >= -42, SNR >= 8
    narrowband_quality = make_quality_result(
        rating=AudioQualityRating.GOOD,
        rms_dbfs=-22.0,
        snr_estimate_db=20.0,
        silence_ratio=0.05,
        spectral_bandwidth_hz=3400.0,
        high_frequency_ratio=0.015,
    )
    assert AudioQualityAnalyzer.is_telephony_bandwidth(narrowband_quality) is True

    ch, th, reason = calibrator.resolve_threshold(
        channel_type=ChannelType.AUTO,
        codec=None,
        quality=narrowband_quality,
    )
    assert ch == ChannelType.TELEPHONY
    assert th == TELEPHONY_THRESHOLD
    assert "acoustic bandwidth evidence" in reason

    # Detector end-to-end
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-acoustic-tel-5",
        chunk_index=0,
        audio_base64=make_pcm_base64(1000.0),
        channel_type=ChannelType.AUTO,
    )
    result = detector.analyze(chunk, quality=narrowband_quality)
    assert result.channel_type_applied == ChannelType.TELEPHONY
    assert result.threshold_applied == TELEPHONY_THRESHOLD
    assert any("Applied channel type: TELEPHONY" in exp for exp in result.explainability)


# ============================================================================
# 6. AUTO + Ambiguous Acoustic Evidence
# ============================================================================
def test_scenario_6_auto_ambiguous_evidence():
    calibrator = DeepfakeCalibrator()
    # Ambiguous: bandwidth looks narrowband, but HF ratio is elevated (> 0.05)
    ambiguous_quality = make_quality_result(
        spectral_bandwidth_hz=3700.0,
        high_frequency_ratio=0.09,  # too much HF energy to be telephony
    )
    assert AudioQualityAnalyzer.is_telephony_bandwidth(ambiguous_quality) is False

    ch, th, reason = calibrator.resolve_threshold(
        channel_type=ChannelType.AUTO,
        codec=None,
        quality=ambiguous_quality,
    )
    assert ch == ChannelType.WIDEBAND
    assert th == WIDEBAND_THRESHOLD
    assert "defaulted to WIDEBAND" in reason

    # Detector end-to-end
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-ambig-6",
        chunk_index=0,
        audio_base64=make_pcm_base64(1000.0),
        channel_type=ChannelType.AUTO,
    )
    result = detector.analyze(chunk, quality=ambiguous_quality)
    assert result.channel_type_applied == ChannelType.WIDEBAND
    assert result.threshold_applied == WIDEBAND_THRESHOLD


# ============================================================================
# 7. POOR Quality -> INCONCLUSIVE (Never SUSPICIOUS)
# ============================================================================
def test_scenario_7_poor_quality_safety_gate():
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-poor-7",
        chunk_index=0,
        audio_base64=make_pcm_base64(1000.0),
        channel_type=ChannelType.TELEPHONY,  # Even with lower threshold (0.525)
    )
    poor_quality = make_quality_result(
        rating=AudioQualityRating.POOR,
        rms_dbfs=-55.0,
        snr_estimate_db=2.0,
        uncertainty_penalty=0.85,
    )
    result = detector.analyze(chunk, quality=poor_quality)
    # Must be INCONCLUSIVE and never SUSPICIOUS
    assert result.status == DeepfakeStatus.INCONCLUSIVE
    assert result.status != DeepfakeStatus.SUSPICIOUS
    assert result.channel_type_applied == ChannelType.TELEPHONY
    assert result.threshold_applied == TELEPHONY_THRESHOLD
    assert any("Audio quality is POOR" in exp for exp in result.explainability)


# ============================================================================
# 8. Duration < 300 ms -> INSUFFICIENT_AUDIO
# ============================================================================
def test_scenario_8_duration_under_300ms():
    detector = DeepfakeDetector()
    short_chunk = AudioChunkPayload(
        call_id="call-short-8",
        chunk_index=0,
        audio_base64=make_pcm_base64(200.0),  # 200 ms < 300 ms
        channel_type=ChannelType.TELEPHONY,
    )
    result = detector.analyze(short_chunk)
    assert result.status == DeepfakeStatus.INSUFFICIENT_AUDIO
    assert result.spoof_score is None
    assert result.channel_type_applied == ChannelType.TELEPHONY
    assert result.threshold_applied == TELEPHONY_THRESHOLD
    assert any("Insufficient speech duration" in exp for exp in result.explainability)


# ============================================================================
# 9. Backward-Compatible Payload (No channel_type, No codec)
# ============================================================================
def test_scenario_9_backward_compatibility():
    detector = DeepfakeDetector()
    chunk_legacy = AudioChunkPayload(
        call_id="call-legacy-9",
        chunk_index=0,
        audio_base64=make_wideband_pcm_base64(1000.0),
        # channel_type and codec omitted
    )
    result = detector.analyze(chunk_legacy)
    assert result.status in [DeepfakeStatus.AUTHENTIC, DeepfakeStatus.INCONCLUSIVE, DeepfakeStatus.SUSPICIOUS]
    assert result.channel_type_applied == ChannelType.WIDEBAND
    assert result.threshold_applied == WIDEBAND_THRESHOLD
    assert result.threshold_applied == 0.685
    assert len(result.explainability) > 0


# ============================================================================
# Direct Audit Trail & Field Verification
# ============================================================================
def test_fields_and_auditability():
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-audit-10",
        chunk_index=0,
        audio_base64=make_pcm_base64(800.0),
        channel_type=ChannelType.TELEPHONY,
    )
    result = detector.analyze(chunk)
    assert hasattr(result, "channel_type_applied")
    assert hasattr(result, "threshold_applied")
    assert result.channel_type_applied == ChannelType.TELEPHONY
    assert result.threshold_applied == 0.525
    found_channel_exp = any("Applied channel type: TELEPHONY" in e for e in result.explainability)
    found_thresh_exp = any("Applied spoof threshold: 0.525" in e for e in result.explainability)
    assert found_channel_exp is True
    assert found_thresh_exp is True


if __name__ == "__main__":
    import unittest
    # Run tests using standard test runner
    pytest_tests = [
        test_scenario_1_explicit_wideband,
        test_scenario_2_explicit_telephony,
        test_scenario_3_auto_telephony_codec,
        test_scenario_4_auto_non_telephony_codec,
        test_scenario_5_auto_strong_narrowband_evidence,
        test_scenario_6_auto_ambiguous_evidence,
        test_scenario_7_poor_quality_safety_gate,
        test_scenario_8_duration_under_300ms,
        test_scenario_9_backward_compatibility,
        test_fields_and_auditability,
    ]
    passed = 0
    for t in pytest_tests:
        try:
            t()
            passed += 1
            print(f"PASS: {t.__name__}")
        except Exception as ex:
            print(f"FAIL: {t.__name__}: {ex}")
            raise ex
    print(f"\nSuccessfully passed all {passed}/{len(pytest_tests)} tests.")
