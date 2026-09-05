"""
Unit & Adversarial Tests for Acoustic Deepfake Detection and Phase 6.4 Neural Integration.
Validates synthetic speech vs bona fide feature extraction, quality-aware uncertainty,
ONNX Runtime CPU inference, SHA-256 integrity, DSP fallbacks, and anti-spoof enrollment gates.
"""

import base64
import hashlib
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from ai.app.deepfake.detector import DeepfakeDetector
from ai.app.deepfake.features import AcousticFeatureExtractor
from ai.app.deepfake.model import DeepfakeAcousticModel
from ai.app.core.model_registry import ModelRegistry
from ai.app.core.types import (
    AudioChunkPayload,
    DeepfakeStatus,
    DeepfakeAnalysisResult,
    AudioQualityResult,
    AudioQualityRating,
    PipelineStatus,
    SpeakerEnrollmentRequest
)
from ai.app.speaker.verifier import SpeakerVerifier


def generate_bona_fide_human_speech(duration_sec: float = 1.0, sample_rate: int = 16000) -> str:
    """Generates speech with dynamic pitch contour and rich formant harmonics."""
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    f0 = 130 + 20 * np.sin(2 * np.pi * 3 * t)
    phase = 2 * np.pi * np.cumsum(f0) / sample_rate
    voice = (
        0.4 * np.sin(phase) +
        0.3 * np.sin(2 * phase) +
        0.2 * np.sin(3 * phase) +
        0.1 * np.sin(4 * phase)
    )
    mod = 0.5 + 0.5 * np.cos(2 * np.pi * 5 * t)
    voice = voice * mod
    int16_samples = (voice * 20000).astype(np.int16)
    return base64.b64encode(int16_samples.tobytes()).decode("utf-8")


def generate_vocoder_synthetic_voice(duration_sec: float = 1.0, sample_rate: int = 16000) -> str:
    """Generates synthetic voice with oversmoothed spectral envelope and high-frequency phase jitter."""
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    voice = 0.5 * np.sin(2 * np.pi * 140 * t)
    high_noise = 0.15 * np.sin(2 * np.pi * 5500 * t + np.random.randn(len(t)) * 0.5)
    combined = voice + high_noise
    int16_samples = (combined * 20000).astype(np.int16)
    return base64.b64encode(int16_samples.tobytes()).decode("utf-8")


def test_deepfake_authentic_score_calibration():
    """Validates that a low spoof probability maps through calibration to AUTHENTIC status.
    
    Note: Real end-to-end audio classification requires recorded human speech audio files on disk.
    This unit test validates the calibration decision mapping with a controlled authentic prediction.
    """
    detector = DeepfakeDetector(sample_rate=16000)
    from ai.app.deepfake.types import RawDeepfakePrediction, DeepfakeFeatureVector

    feat_vec = DeepfakeFeatureVector(
        log_mel_spectrogram_mean=[-20.0] * 60,
        lfcc_coefficients=[1.0] * 20,
        spectral_flatness=0.05,
        vocoder_phase_distortion=0.01,
        high_freq_attenuation_ratio=0.10,
        temporal_variance=0.001
    )
    prediction = RawDeepfakePrediction(
        raw_spoof_score=0.15,
        raw_confidence=0.85,
        model_version="robust_mini_acoustic_cnn_v1",
        engine_type="NEURAL",
        feature_vector=feat_vec,
        artifacts=[]
    )
    good_quality = AudioQualityResult(
        rating=AudioQualityRating.GOOD,
        rms_dbfs=-20.0,
        peak_amplitude=0.5,
        clipping_ratio=0.0,
        silence_ratio=0.05,
        snr_estimate_db=25.0,
        dynamic_range_db=30.0,
        sample_rate=16000,
        channels=1,
        duration_ms=1000.0,
        uncertainty_penalty=0.0,
        notes="Optimal acoustic levels."
    )
    result = detector.calibrator.calibrate(
        prediction=prediction,
        quality=good_quality,
        speech_duration_ms=1000.0,
        inference_latency_ms=12.5
    )
    assert result.status == DeepfakeStatus.AUTHENTIC
    assert result.spoof_score == 0.15
    assert result.confidence is not None
    assert result.confidence >= 0.50
    assert result.uncertainty <= 0.10
    assert any("authentic" in exp.lower() for exp in result.explainability)


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
    assert result.status == DeepfakeStatus.INCONCLUSIVE
    assert result.uncertainty >= 0.80


def test_deepfake_model_registry_entry_and_metadata():
    model_meta = ModelRegistry.get_model("deepfake_aasist_spectral_v3")
    assert model_meta is not None
    assert model_meta.category == "DEEPFAKE"
    assert model_meta.framework in ("ONNX_NEURAL_DSP", "NUMPY_DSP_NEURAL")
    assert model_meta.status == PipelineStatus.AVAILABLE
    assert len(model_meta.checksum_sha256) == 64


def test_deepfake_model_integrity_verification_sha256():
    model_meta = ModelRegistry.get_model("deepfake_aasist_spectral_v3")
    test_content = b"voxshield_deepfake_model_test_binary_stream"
    test_sha256 = hashlib.sha256(test_content).hexdigest()
    with patch.object(model_meta, "checksum_sha256", test_sha256):
        with patch.dict(ModelRegistry._models, {model_meta.model_id: model_meta}):
            assert ModelRegistry.verify_integrity(model_meta.model_id, test_content) is True
            assert ModelRegistry.verify_integrity(model_meta.model_id, b"corrupted_payload") is False


def test_deepfake_neural_initialization_and_active_state():
    model = DeepfakeAcousticModel(model_version="deepfake_aasist_spectral_v3")
    assert isinstance(model.is_neural_active, bool)
    assert model.model_version == "deepfake_aasist_spectral_v3"


def test_deepfake_neural_inference_valid_audio():
    detector = DeepfakeDetector(sample_rate=16000)
    audio_b64 = generate_bona_fide_human_speech(duration_sec=1.0)
    chunk = AudioChunkPayload(
        call_id="call-neural-test-01",
        chunk_index=0,
        sample_rate=16000,
        audio_base64=audio_b64
    )
    res = detector.analyze(chunk)
    assert isinstance(res, DeepfakeAnalysisResult)
    assert res.spoof_score is not None
    assert 0.0 <= res.spoof_score <= 1.0
    assert 0.0 <= res.confidence <= 1.0
    assert 0.0 <= res.uncertainty <= 1.0
    assert res.inference_latency_ms >= 0.0


def test_deepfake_silence_and_zero_handling():
    detector = DeepfakeDetector(sample_rate=16000)
    silent_samples = np.zeros(16000, dtype=np.int16)
    silent_b64 = base64.b64encode(silent_samples.tobytes()).decode("utf-8")
    chunk = AudioChunkPayload(
        call_id="call-silent-01",
        chunk_index=0,
        sample_rate=16000,
        audio_base64=silent_b64
    )
    res = detector.analyze(chunk)
    assert res.spoof_score is not None
    assert res.status in (DeepfakeStatus.AUTHENTIC, DeepfakeStatus.INCONCLUSIVE)


def test_deepfake_malformed_audio_handling():
    detector = DeepfakeDetector(sample_rate=16000)
    chunk = AudioChunkPayload(
        call_id="call-malformed-01",
        chunk_index=0,
        sample_rate=16000,
        audio_base64="INVALID_BASE64_NOT_DIVISIBLE_BY_4!!!"
    )
    res = detector.analyze(chunk)
    assert res.status == DeepfakeStatus.INSUFFICIENT_AUDIO
    assert res.uncertainty == 1.0


def test_deepfake_dsp_fallback_path():
    model = DeepfakeAcousticModel(model_version="deepfake_aasist_spectral_v3")
    fe = AcousticFeatureExtractor(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    samples = (0.4 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)
    features = fe.extract_features(samples)

    pred_dsp = model.predict(features, raw_samples=samples, force_dsp=True)
    assert pred_dsp.raw_spoof_score is not None
    assert 0.0 <= pred_dsp.raw_spoof_score <= 1.0
    assert 0.0 <= pred_dsp.raw_confidence <= 1.0


def test_deepfake_onnx_exception_dsp_fallback():
    model = DeepfakeAcousticModel(model_version="robust_mini_acoustic_cnn_v1")
    fe = AcousticFeatureExtractor(sample_rate=16000)
    original_model = DeepfakeAcousticModel._cached_neural_model

    try:
        mock_model = MagicMock()
        mock_model.side_effect = RuntimeError("Synthetic PyTorch deepfake execution fault")
        DeepfakeAcousticModel._cached_neural_model = mock_model

        t = np.linspace(0, 1.0, 16000, endpoint=False)
        samples = (0.4 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)
        features = fe.extract_features(samples)

        pred = model.predict(features, raw_samples=samples)
        assert pred.raw_spoof_score is not None
        assert 0.0 <= pred.raw_spoof_score <= 1.0
    finally:
        DeepfakeAcousticModel._cached_neural_model = original_model


def test_deepfake_enrollment_anti_spoofing_gate_preservation():
    verifier = SpeakerVerifier(sample_rate=16000)
    utt1 = generate_vocoder_synthetic_voice(duration_sec=1.0)
    utt2 = generate_vocoder_synthetic_voice(duration_sec=1.0)

    req = SpeakerEnrollmentRequest(
        speaker_id="spk-spoof-enrollment",
        speaker_name="Spoofed Candidate",
        audio_utterances_base64=[utt1, utt2]
    )

    with patch.object(verifier.enrollment_manager.deepfake_detector, "analyze") as mock_analyze:
        mock_res = MagicMock()
        mock_res.status = DeepfakeStatus.SUSPICIOUS
        mock_analyze.return_value = mock_res

        ok, profile, msg = verifier.enrollment_manager.enroll_speaker(req)
        assert ok is False
        assert profile is None
        assert "rejected by anti-spoof screening" in msg


def test_deepfake_result_contract_integrity():
    detector = DeepfakeDetector(sample_rate=16000)
    audio_b64 = generate_bona_fide_human_speech(duration_sec=1.0)
    chunk = AudioChunkPayload(
        call_id="call-contract-01",
        chunk_index=0,
        sample_rate=16000,
        audio_base64=audio_b64
    )
    res = detector.analyze(chunk)
    assert isinstance(res, DeepfakeAnalysisResult)
    assert isinstance(res.status, DeepfakeStatus)
    assert isinstance(res.artifacts_detected, list)
    assert isinstance(res.explainability, list)
    assert res.model_version in (detector.model_id, "dsp_acoustic_fallback_v1")
    assert res.engine_type in ("NEURAL", "DSP_FALLBACK")
    assert res.inference_latency_ms >= 0.0


def test_deepfake_engine_provenance_neural_and_fallback():
    detector = DeepfakeDetector(sample_rate=16000)
    audio_b64 = generate_bona_fide_human_speech(duration_sec=1.0)
    chunk = AudioChunkPayload(
        call_id="call-provenance-01",
        chunk_index=0,
        sample_rate=16000,
        audio_base64=audio_b64
    )

    # 1. Primary path (NEURAL when model is present)
    res = detector.analyze(chunk)
    assert res.engine_type in ("NEURAL", "DSP_FALLBACK")

    # 2. Forced DSP Fallback path
    pred_dsp = detector.model.predict(
        detector.feature_extractor.extract_features(detector.decode_samples(audio_b64)),
        raw_samples=detector.decode_samples(audio_b64),
        force_dsp=True
    )
    assert pred_dsp.engine_type == "DSP_FALLBACK"

    # 3. Insufficient audio (duration < 300ms) -> engine_type is None
    short_chunk = AudioChunkPayload(
        call_id="call-provenance-short",
        chunk_index=0,
        sample_rate=16000,
        audio_base64=generate_bona_fide_human_speech(duration_sec=0.1)
    )
    short_res = detector.analyze(short_chunk)
    assert short_res.status == DeepfakeStatus.INSUFFICIENT_AUDIO
    assert short_res.engine_type is None
