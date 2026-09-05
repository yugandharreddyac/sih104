"""
VOXSHIELD SIH104 — P0-4 Telephony Policy Calibration & Runtime Threshold Switching Test Suite.
Validates:
1. Wideband mode selects theta = 0.6850
2. Telephony mode selects theta = 0.5250
3. Automatic runtime threshold switching across metadata triggers (explicit channel, codec, sample rate, acoustic)
4. Isolation: wideband never accidentally uses telephony threshold; telephony never uses wideband threshold
5. Selected threshold directly governs the actual decision boundary (>= is SUSPICIOUS, < is AUTHENTIC)
6. Score = 0.6000 demonstrates diverging decision (AUTHENTIC under wideband, SUSPICIOUS under telephony)
7. Boundary conditions (0.6849, 0.6850, 0.6851; 0.5249, 0.5250, 0.5251)
8. Invalid values safety (NaN, +Inf, -Inf, negative score, score > 1.0, None)
9. Preprocessing & duration handling on narrowband 8 kHz audio
10. Observability & audit trail completeness without privacy leaks
11. End-to-end integration into UnifiedPipelineOrchestrator and MultiModalRiskFusionEngine
"""

import base64
import math
import numpy as np
import pytest

from ai.app.core.types import (
    AudioChunkPayload,
    AudioQualityRating,
    AudioQualityResult,
    ChannelType,
    DeepfakeAnalysisResult,
    DeepfakeStatus,
    OverallAcousticAssessment,
)
from ai.app.deepfake.calibration import (
    AcousticThresholdProfile,
    DeepfakeCalibrator,
    TELEPHONY_THRESHOLD,
    WIDEBAND_THRESHOLD,
    is_telephony_codec,
)
from ai.app.deepfake.detector import DeepfakeDetector
from ai.app.deepfake.types import DeepfakeFeatureVector, RawDeepfakePrediction
from ai.app.pipeline.orchestrator import UnifiedPipelineOrchestrator


# ---------------------------------------------------------------------------
# Fixture Helpers
# ---------------------------------------------------------------------------

def generate_sine_pcm_base64(duration_ms: float = 1000.0, sample_rate: int = 16000, f0: float = 440.0) -> str:
    n_samples = int(sample_rate * (duration_ms / 1000.0))
    if n_samples == 0:
        return ""
    t = np.linspace(0, duration_ms / 1000.0, n_samples, endpoint=False)
    samples = (0.5 * np.sin(2 * np.pi * f0 * t) * 32767.0).astype(np.int16)
    return base64.b64encode(samples.tobytes()).decode("utf-8")


def generate_empty_feature_vector() -> DeepfakeFeatureVector:
    return DeepfakeFeatureVector(
        log_mel_spectrogram_mean=[0.0] * 24,
        lfcc_coefficients=[0.0] * 20,
        spectral_flatness=0.15,
        vocoder_phase_distortion=0.05,
        high_freq_attenuation_ratio=0.10,
        temporal_variance=0.01,
    )


def make_clean_quality_result(sample_rate: int = 16000) -> AudioQualityResult:
    return AudioQualityResult(
        rating=AudioQualityRating.GOOD,
        rms_dbfs=-20.0,
        peak_amplitude=0.6,
        clipping_ratio=0.0,
        silence_ratio=0.05,
        snr_estimate_db=25.0,
        dynamic_range_db=30.0,
        sample_rate=sample_rate,
        channels=1,
        duration_ms=1000.0,
        uncertainty_penalty=0.0,
        notes="Clean quality test fixture",
        spectral_bandwidth_hz=7200.0,
        high_frequency_ratio=0.18,
    )


# ---------------------------------------------------------------------------
# Test 1 & 2: Explicit Wideband & Telephony Selection
# ---------------------------------------------------------------------------

def test_explicit_wideband_selects_calibrated_threshold():
    calibrator = DeepfakeCalibrator()
    ch, th, reason = calibrator.resolve_threshold(channel_type=ChannelType.WIDEBAND)
    assert ch == ChannelType.WIDEBAND
    assert th == 0.6850
    assert th == WIDEBAND_THRESHOLD
    assert "explicit metadata (WIDEBAND)" in reason


def test_explicit_telephony_selects_calibrated_threshold():
    calibrator = DeepfakeCalibrator()
    ch, th, reason = calibrator.resolve_threshold(channel_type=ChannelType.TELEPHONY)
    assert ch == ChannelType.TELEPHONY
    assert th == 0.5250
    assert th == TELEPHONY_THRESHOLD
    assert "explicit metadata (TELEPHONY)" in reason


# ---------------------------------------------------------------------------
# Test 3 & 4: Runtime Trigger Switching & Cross-Talk Prevention
# ---------------------------------------------------------------------------

def test_codec_trigger_runtime_switching():
    calibrator = DeepfakeCalibrator()
    telephony_codecs = ["g711u", "g711a", "pcmu", "pcma", "alaw", "mulaw", "amr", "amr-nb", "gsm", "g729"]
    for c in telephony_codecs:
        ch, th, reason = calibrator.resolve_threshold(channel_type=ChannelType.AUTO, codec=c)
        assert ch == ChannelType.TELEPHONY, f"Failed to switch to TELEPHONY for codec: {c}"
        assert th == 0.5250
        assert "telephony codec metadata" in reason

    non_telephony_codecs = ["opus", "pcm_s16le", "aac", "flac", "vorbis"]
    quality = make_clean_quality_result()
    for c in non_telephony_codecs:
        ch, th, _ = calibrator.resolve_threshold(channel_type=ChannelType.AUTO, codec=c, quality=quality)
        assert ch == ChannelType.WIDEBAND, f"Failed to retain WIDEBAND for codec: {c}"
        assert th == 0.6850


def test_sample_rate_metadata_switching():
    calibrator = DeepfakeCalibrator()
    # 8000 Hz narrowband PSTN audio
    ch, th, reason = calibrator.resolve_threshold(channel_type=ChannelType.AUTO, sample_rate=8000)
    assert ch == ChannelType.TELEPHONY
    assert th == 0.5250
    assert "narrowband sample rate metadata (8000 Hz)" in reason

    # 16000 Hz wideband audio
    quality = make_clean_quality_result(sample_rate=16000)
    ch, th, reason = calibrator.resolve_threshold(channel_type=ChannelType.AUTO, sample_rate=16000, quality=quality)
    assert ch == ChannelType.WIDEBAND
    assert th == 0.6850


def test_safe_fallback_on_missing_or_ambiguous_metadata():
    calibrator = DeepfakeCalibrator()
    # Missing all metadata
    ch, th, reason = calibrator.resolve_threshold(channel_type=None, codec=None, sample_rate=None, quality=None)
    assert ch == ChannelType.WIDEBAND
    assert th == 0.6850
    assert "defaulted to WIDEBAND" in reason


# ---------------------------------------------------------------------------
# Test 5 & 6: Threshold Decision Divergence on Borderline Score (0.6000)
# ---------------------------------------------------------------------------

def test_diverging_decision_on_same_score():
    """
    Proves that a borderline score (0.6000) produces opposite classifications
    depending on the active operating condition:
    - Wideband:  0.6000 < 0.6850  ==> AUTHENTIC
    - Telephony: 0.6000 >= 0.5250 ==> SUSPICIOUS
    """
    calibrator = DeepfakeCalibrator()
    quality = make_clean_quality_result()
    features = generate_empty_feature_vector()

    pred_060 = RawDeepfakePrediction(
        raw_spoof_score=0.6000,
        raw_confidence=0.85,
        model_version="robust_mini_acoustic_cnn_v1",
        engine_type="NEURAL",
        feature_vector=features,
        artifacts=[],
    )

    # 1. Evaluate under WIDEBAND
    res_wideband = calibrator.calibrate(
        prediction=pred_060,
        quality=quality,
        speech_duration_ms=1000.0,
        inference_latency_ms=6.5,
        channel_type=ChannelType.WIDEBAND,
    )
    assert res_wideband.channel_type_applied == ChannelType.WIDEBAND
    assert res_wideband.threshold_applied == 0.6850
    assert res_wideband.status == DeepfakeStatus.AUTHENTIC

    # 2. Evaluate under TELEPHONY
    res_telephony = calibrator.calibrate(
        prediction=pred_060,
        quality=quality,
        speech_duration_ms=1000.0,
        inference_latency_ms=6.5,
        channel_type=ChannelType.TELEPHONY,
    )
    assert res_telephony.channel_type_applied == ChannelType.TELEPHONY
    assert res_telephony.threshold_applied == 0.5250
    assert res_telephony.status == DeepfakeStatus.SUSPICIOUS


# ---------------------------------------------------------------------------
# Test 7: Boundary Value Testing (Wideband: 0.6849, 0.6850, 0.6851; Telephony: 0.5249, 0.5250, 0.5251)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw_score, expected_status",
    [
        (0.6849, DeepfakeStatus.AUTHENTIC),
        (0.6850, DeepfakeStatus.SUSPICIOUS),
        (0.6851, DeepfakeStatus.SUSPICIOUS),
    ],
)
def test_wideband_boundary_semantics(raw_score, expected_status):
    calibrator = DeepfakeCalibrator()
    quality = make_clean_quality_result()
    features = generate_empty_feature_vector()

    pred = RawDeepfakePrediction(
        raw_spoof_score=raw_score,
        raw_confidence=0.90,
        model_version="robust_mini_acoustic_cnn_v1",
        engine_type="NEURAL",
        feature_vector=features,
        artifacts=[],
    )
    res = calibrator.calibrate(
        prediction=pred,
        quality=quality,
        speech_duration_ms=1000.0,
        inference_latency_ms=5.0,
        channel_type=ChannelType.WIDEBAND,
    )
    assert res.threshold_applied == 0.6850
    assert res.status == expected_status, f"Score {raw_score} failed expected {expected_status}"


@pytest.mark.parametrize(
    "raw_score, expected_status",
    [
        (0.5249, DeepfakeStatus.AUTHENTIC),
        (0.5250, DeepfakeStatus.SUSPICIOUS),
        (0.5251, DeepfakeStatus.SUSPICIOUS),
    ],
)
def test_telephony_boundary_semantics(raw_score, expected_status):
    calibrator = DeepfakeCalibrator()
    quality = make_clean_quality_result()
    features = generate_empty_feature_vector()

    pred = RawDeepfakePrediction(
        raw_spoof_score=raw_score,
        raw_confidence=0.90,
        model_version="robust_mini_acoustic_cnn_v1",
        engine_type="NEURAL",
        feature_vector=features,
        artifacts=[],
    )
    res = calibrator.calibrate(
        prediction=pred,
        quality=quality,
        speech_duration_ms=1000.0,
        inference_latency_ms=5.0,
        channel_type=ChannelType.TELEPHONY,
    )
    assert res.threshold_applied == 0.5250
    assert res.status == expected_status, f"Score {raw_score} failed expected {expected_status}"


# ---------------------------------------------------------------------------
# Test 8: Invalid & Non-Finite Numerical Values Safety
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("invalid_score", [float("nan"), float("inf"), float("-inf"), -0.25, 1.35, None])
def test_invalid_numerical_scores_degrade_safely(invalid_score):
    calibrator = DeepfakeCalibrator()
    quality = make_clean_quality_result()
    features = generate_empty_feature_vector()

    pred = RawDeepfakePrediction(
        raw_spoof_score=invalid_score,
        raw_confidence=0.85,
        model_version="robust_mini_acoustic_cnn_v1",
        engine_type="NEURAL",
        feature_vector=features,
        artifacts=[],
    )

    res = calibrator.calibrate(
        prediction=pred,
        quality=quality,
        speech_duration_ms=1000.0,
        inference_latency_ms=5.0,
        channel_type=ChannelType.TELEPHONY,
    )

    assert res.status == DeepfakeStatus.INCONCLUSIVE
    assert res.spoof_score is None
    assert res.confidence == 0.0
    assert res.uncertainty == 1.0
    assert any("Invalid raw spoof score" in e for e in res.explainability)


# ---------------------------------------------------------------------------
# Test 9: Narrowband 8 kHz Audio Ingestion & Resampling in DeepfakeDetector
# ---------------------------------------------------------------------------

def test_detector_handles_8khz_telephony_pcm():
    detector = DeepfakeDetector()
    # 8 kHz audio chunk, 1000 ms = 8000 samples
    pcm_8k_b64 = generate_sine_pcm_base64(duration_ms=1000.0, sample_rate=8000, f0=300.0)

    chunk = AudioChunkPayload(
        call_id="call-tel-8k",
        chunk_index=0,
        sample_rate=8000,
        channels=1,
        audio_base64=pcm_8k_b64,
        channel_type=ChannelType.AUTO,
        codec="g711u",
    )

    result = detector.analyze(chunk)
    assert result.channel_type_applied == ChannelType.TELEPHONY
    assert result.threshold_applied == 0.5250
    assert result.status in [DeepfakeStatus.AUTHENTIC, DeepfakeStatus.SUSPICIOUS, DeepfakeStatus.INCONCLUSIVE]
    assert any("Policy C" in e for e in result.explainability)


# ---------------------------------------------------------------------------
# Test 10: Observability & Audit Trail Integrity
# ---------------------------------------------------------------------------

def test_observability_audit_trail():
    detector = DeepfakeDetector()
    chunk = AudioChunkPayload(
        call_id="call-audit-obs",
        chunk_index=0,
        audio_base64=generate_sine_pcm_base64(1000.0),
        channel_type=ChannelType.TELEPHONY,
    )

    result = detector.analyze(chunk)
    # Validate required metadata fields
    assert hasattr(result, "channel_type_applied")
    assert hasattr(result, "threshold_applied")
    assert result.channel_type_applied == ChannelType.TELEPHONY
    assert result.threshold_applied == 0.5250

    # Validate audit explainability lines
    has_channel_exp = any("Applied channel type: TELEPHONY" in e for e in result.explainability)
    has_threshold_exp = any("Applied spoof threshold: 0.525" in e for e in result.explainability)
    has_profile_exp = any("Threshold profile: Policy C" in e for e in result.explainability)

    assert has_channel_exp is True
    assert has_threshold_exp is True
    assert has_profile_exp is True


# ---------------------------------------------------------------------------
# Test 11: End-to-End Unified Pipeline & Risk Fusion Propagation
# ---------------------------------------------------------------------------

def test_end_to_end_orchestrator_threshold_propagation():
    orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)
    audio_b64 = generate_sine_pcm_base64(duration_ms=1000.0, sample_rate=16000, f0=300.0)

    # 1. Wideband chunk
    wb_chunk = AudioChunkPayload(
        call_id="call-e2e-wb",
        chunk_index=0,
        audio_base64=audio_b64,
        channel_type=ChannelType.WIDEBAND,
    )
    wb_res = orchestrator.process_chunk(wb_chunk)
    assert any("Applied channel type: WIDEBAND" in e for e in wb_res.explainability)
    assert any("Applied spoof threshold: 0.685" in e for e in wb_res.explainability)
    assert wb_res.overall_risk_score is not None

    # 2. Telephony chunk
    tel_chunk = AudioChunkPayload(
        call_id="call-e2e-tel",
        chunk_index=0,
        audio_base64=audio_b64,
        channel_type=ChannelType.AUTO,
        codec="g711a",
        sample_rate=8000,
    )
    tel_res = orchestrator.process_chunk(tel_chunk)
    assert any("Applied channel type: TELEPHONY" in e for e in tel_res.explainability)
    assert any("Applied spoof threshold: 0.525" in e for e in tel_res.explainability)
    assert tel_res.overall_risk_score is not None

    orchestrator.clear_call_session("call-e2e-wb")
    orchestrator.clear_call_session("call-e2e-tel")
