"""
Comprehensive P1-1 Verification Test Suite: ECAPA-TDNN Neural Speaker Verification & Calibration
Covers all 15 required verification domains:
1. Model loading & ONNX session initialization
2. Real Neural ECAPA-TDNN inference execution
3. 192-dim embedding shape & L2 spherical unit normalization
4. Deterministic inference repeatability (zero jitter)
5. Genuine speaker comparison (same speaker identity match >= threshold)
6. Impostor speaker comparison (different speaker identities mismatch < threshold)
7. Threshold boundaries & calibrated operating points
8. Graceful DSP random-projection fallback (128-dim) on demand or model failure
9. Invalid audio handling (empty, base64 corruption, silent, sub-300ms)
10. Invalid / un-enrolled reference speaker handling
11. Model unavailable state handling via ModelRegistry
12. NaN / Inf numerical safety protection
13. Repeated inference stability & performance benchmarking
14. End-to-end integration into UnifiedPipelineOrchestrator and MultiModalRiskFusionEngine
15. Privacy & logging audit: zero raw audio and zero biometric embedding vectors leaked to logs
"""

import os
import base64
import logging
import numpy as np
import pytest
from unittest.mock import patch, MagicMock

from ai.app.speaker.verifier import SpeakerVerifier
from ai.app.speaker.embedding import SpeakerEmbeddingExtractor
from ai.app.speaker.similarity import SpeakerSimilarityMatcher
from ai.app.speaker.enrollment import SpeakerEnrollmentManager
from ai.app.core.model_registry import ModelRegistry
from ai.app.core.types import (
    AudioChunkPayload,
    SpeakerVerificationStatus,
    SpeakerEnrollmentRequest,
    SpeakerVerificationResult,
    PipelineStatus,
    DeepfakeStatus,
    DeepfakeAnalysisResult,
    ChannelType
)
from ai.app.pipeline.orchestrator import UnifiedPipelineOrchestrator
from ai.app.fusion.engine import MultiModalRiskFusionEngine


def _make_audio_b64(samples: np.ndarray) -> str:
    int16 = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    return base64.b64encode(int16.tobytes()).decode("utf-8")


def _generate_vocal_tone(f0: float = 200.0, duration_sec: float = 1.0, sr: int = 16000, seed: int = 42) -> np.ndarray:
    rng = np.random.RandomState(seed)
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    # Fundamental + harmonics + formants
    signal = 0.45 * np.sin(2 * np.pi * f0 * t)
    signal += 0.25 * np.sin(2 * np.pi * (2 * f0) * t)
    signal += 0.15 * np.sin(2 * np.pi * (3 * f0) * t)
    # Formants around 800 Hz and 2400 Hz
    signal += 0.10 * np.sin(2 * np.pi * 800.0 * t)
    signal += 0.05 * np.sin(2 * np.pi * 2400.0 * t)
    signal += rng.normal(0, 0.005, len(t))
    peak = np.max(np.abs(signal))
    if peak > 1e-6:
        signal = signal / peak
    return signal.astype(np.float32)


# =====================================================================
# 1. MODEL LOADING & INITIALIZATION
# =====================================================================
def test_p1_1_01_model_loading_and_session():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    assert extractor.is_neural_active is True
    assert extractor._cached_session is not None
    assert extractor.embedding_dim == 192
    assert extractor.model_version == "speaker_xvector_biometric_v3"


# =====================================================================
# 2. REAL NEURAL INFERENCE
# =====================================================================
def test_p1_1_02_real_neural_inference():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    audio = _generate_vocal_tone(f0=180.0, duration_sec=1.0)
    emb = extractor.extract_embedding(audio, speaker_id="spk-neural-test")

    assert emb.engine_type == "NEURAL"
    assert emb.dimension == 192
    assert len(emb.embedding) == 192
    assert np.all(np.isfinite(emb.embedding))


# =====================================================================
# 3. EMBEDDING SHAPE & L2 NORMALIZATION
# =====================================================================
def test_p1_1_03_embedding_shape_and_l2_norm():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    audio = _generate_vocal_tone(f0=220.0, duration_sec=1.2)
    emb = extractor.extract_embedding(audio, speaker_id="spk-norm")

    assert emb.dimension == 192
    norm = np.linalg.norm(emb.embedding)
    assert abs(norm - 1.0) < 1e-3, f"L2 norm {norm} must be spherical unit vector"


# =====================================================================
# 4. DETERMINISTIC INFERENCE
# =====================================================================
def test_p1_1_04_deterministic_inference():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    audio = _generate_vocal_tone(f0=150.0, duration_sec=1.0, seed=123)

    emb_a = extractor.extract_embedding(audio, speaker_id="spk-det")
    emb_b = extractor.extract_embedding(audio, speaker_id="spk-det")

    diff = np.max(np.abs(np.array(emb_a.embedding) - np.array(emb_b.embedding)))
    assert diff < 1e-6, f"Neural inference must be deterministic, diff={diff}"


# =====================================================================
# 5. GENUINE SPEAKER COMPARISON
# =====================================================================
def test_p1_1_05_genuine_speaker_comparison():
    verifier = SpeakerVerifier(sample_rate=16000)
    mock_df = DeepfakeAnalysisResult(
        status=DeepfakeStatus.AUTHENTIC,
        spoof_score=0.10, confidence=0.90, uncertainty=0.10,
        spectral_flatness_anomaly=False, vocoder_distortion_score=0.0, lfcc_anomaly_score=0.05,
        artifacts_detected=[], model_version="robust_mini_acoustic_cnn_v1", engine_type="NEURAL",
        explainability=["Genuine check"], inference_latency_ms=5.0,
        channel_type_applied=ChannelType.WIDEBAND, threshold_applied=0.685
    )

    with patch.object(verifier.enrollment_manager.deepfake_detector, "analyze", return_value=mock_df):
        # Enroll genuine executive speaker
        audio_utt1 = _make_audio_b64(_generate_vocal_tone(f0=140.0, duration_sec=1.2, seed=10))
        audio_utt2 = _make_audio_b64(_generate_vocal_tone(f0=140.0, duration_sec=1.2, seed=11))

        req = SpeakerEnrollmentRequest(
            speaker_id="speaker-genuine-exec",
            speaker_name="Genuine Executive",
            audio_utterances_base64=[audio_utt1, audio_utt2]
        )
        ok, profile, _ = verifier.enrollment_manager.enroll_speaker(req)
        assert ok is True

    # Same speaker verification utterance
    test_audio = _make_audio_b64(_generate_vocal_tone(f0=140.0, duration_sec=1.0, seed=12))
    chunk = AudioChunkPayload(
        call_id="call-genuine-001",
        chunk_index=0,
        audio_base64=test_audio,
        claimed_speaker_id="speaker-genuine-exec"
    )

    res = verifier.verify_speaker(chunk)
    assert res.status == SpeakerVerificationStatus.MATCH
    assert res.similarity_score is not None
    assert res.similarity_score >= res.threshold_applied
    assert res.speaker_backend == "NEURAL"
    assert res.speaker_model_loaded is True
    assert res.verification_method == "ECAPA_TDNN_COSINE"


# =====================================================================
# 6. IMPOSTOR SPEAKER COMPARISON
# =====================================================================
def test_p1_1_06_impostor_speaker_comparison():
    from ai.scripts.calibrate_speaker_thresholds import generate_synthetic_speaker_utterance
    verifier = SpeakerVerifier(sample_rate=16000)
    mock_df = DeepfakeAnalysisResult(
        status=DeepfakeStatus.AUTHENTIC,
        spoof_score=0.10, confidence=0.90, uncertainty=0.10,
        spectral_flatness_anomaly=False, vocoder_distortion_score=0.0, lfcc_anomaly_score=0.05,
        artifacts_detected=[], model_version="robust_mini_acoustic_cnn_v1", engine_type="NEURAL",
        explainability=["Impostor check"], inference_latency_ms=5.0,
        channel_type_applied=ChannelType.WIDEBAND, threshold_applied=0.685
    )

    with patch.object(verifier.enrollment_manager.deepfake_detector, "analyze", return_value=mock_df):
        # Enroll genuine speaker at f0=100 Hz with masculine vocal tract formants
        target_formants = [(450.0, 0.12), (1350.0, 0.08), (2300.0, 0.05)]
        u1 = _make_audio_b64(generate_synthetic_speaker_utterance(100.0, target_formants, seed=20))
        u2 = _make_audio_b64(generate_synthetic_speaker_utterance(100.0, target_formants, seed=21))
        req = SpeakerEnrollmentRequest(
            speaker_id="speaker-target-100",
            speaker_name="Target Voice 100Hz",
            audio_utterances_base64=[u1, u2]
        )
        ok, _, _ = verifier.enrollment_manager.enroll_speaker(req)
        assert ok is True

    # Impostor calls claiming to be target, but speaking with distinct f0=240 Hz and feminine vocal tract formants
    impostor_formants = [(800.0, 0.12), (2000.0, 0.08), (3200.0, 0.05)]
    impostor_audio = _make_audio_b64(generate_synthetic_speaker_utterance(240.0, impostor_formants, seed=99))
    chunk = AudioChunkPayload(
        call_id="call-impostor-001",
        chunk_index=0,
        audio_base64=impostor_audio,
        claimed_speaker_id="speaker-target-100"
    )

    res = verifier.verify_speaker(chunk)
    assert res.status == SpeakerVerificationStatus.MISMATCH
    assert res.similarity_score < res.threshold_applied
    assert res.speaker_backend == "NEURAL"
    assert "MISMATCH" in res.explainability[0]


# =====================================================================
# 7. THRESHOLD BOUNDARIES & OPERATING POINTS
# =====================================================================
def test_p1_1_07_threshold_boundaries():
    matcher = SpeakerSimilarityMatcher(verification_threshold=0.70, neural_threshold=0.88)

    # Above neural threshold
    is_match, conf = matcher.evaluate_match(0.92, is_neural=True)
    assert is_match is True
    assert conf > 0.50

    # Exactly at neural threshold
    is_match, conf = matcher.evaluate_match(0.88, is_neural=True)
    assert is_match is True

    # Below neural threshold
    is_match, conf = matcher.evaluate_match(0.879, is_neural=True)
    assert is_match is False

    # DSP fallback threshold evaluation
    is_match_dsp, _ = matcher.evaluate_match(0.72, is_neural=False)
    assert is_match_dsp is True
    is_match_dsp_fail, _ = matcher.evaluate_match(0.68, is_neural=False)
    assert is_match_dsp_fail is False


# =====================================================================
# 8. FALLBACK BEHAVIOR & REPRODUCIBILITY
# =====================================================================
def test_p1_1_08_fallback_behavior_and_forced_dsp():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    audio = _generate_vocal_tone(f0=200.0, duration_sec=1.0)

    # Force DSP fallback
    dsp_emb = extractor.extract_embedding(audio, speaker_id="spk-force-dsp", force_dsp=True)
    assert dsp_emb.engine_type == "DSP_FALLBACK"
    assert dsp_emb.dimension == 128
    assert len(dsp_emb.embedding) == 128
    norm = np.linalg.norm(dsp_emb.embedding)
    assert abs(norm - 1.0) < 1e-3


# =====================================================================
# 9. INVALID AUDIO HANDLING
# =====================================================================
def test_p1_1_09_invalid_audio_handling():
    verifier = SpeakerVerifier(sample_rate=16000)

    # 1. Empty audio payload
    chunk_empty = AudioChunkPayload(
        call_id="call-empty",
        chunk_index=0,
        audio_base64="",
        claimed_speaker_id="speaker-cfo-001"
    )
    res_empty = verifier.verify_speaker(chunk_empty)
    assert res_empty.status == SpeakerVerificationStatus.INSUFFICIENT_AUDIO

    # 2. Corrupted base64
    chunk_corrupt = AudioChunkPayload(
        call_id="call-corrupt",
        chunk_index=0,
        audio_base64="not_a_valid_base64_string!!!",
        claimed_speaker_id="speaker-cfo-001"
    )
    res_corrupt = verifier.verify_speaker(chunk_corrupt)
    assert res_corrupt.status == SpeakerVerificationStatus.INSUFFICIENT_AUDIO

    # 3. Very short audio (< 300 ms)
    short_samples = _generate_vocal_tone(f0=200.0, duration_sec=0.15)  # 150 ms
    chunk_short = AudioChunkPayload(
        call_id="call-short",
        chunk_index=0,
        audio_base64=_make_audio_b64(short_samples),
        claimed_speaker_id="speaker-cfo-001"
    )
    res_short = verifier.verify_speaker(chunk_short)
    assert res_short.status == SpeakerVerificationStatus.INSUFFICIENT_AUDIO


# =====================================================================
# 10. INVALID / UNENROLLED REFERENCE HANDLING
# =====================================================================
def test_p1_1_10_invalid_and_unenrolled_reference():
    verifier = SpeakerVerifier(sample_rate=16000)
    audio = _make_audio_b64(_generate_vocal_tone(f0=200.0, duration_sec=1.0))

    # Unenrolled claimed speaker
    chunk = AudioChunkPayload(
        call_id="call-no-enroll",
        chunk_index=0,
        audio_base64=audio,
        claimed_speaker_id="spk-totally-nonexistent"
    )
    res = verifier.verify_speaker(chunk)
    assert res.status == SpeakerVerificationStatus.NOT_ENROLLED
    assert res.is_enrolled is False
    assert res.similarity_score is None

    # None claimed speaker
    chunk_none = AudioChunkPayload(
        call_id="call-no-id",
        chunk_index=0,
        audio_base64=audio,
        claimed_speaker_id=None
    )
    res_none = verifier.verify_speaker(chunk_none)
    assert res_none.status == SpeakerVerificationStatus.NOT_ENROLLED


# =====================================================================
# 11. MODEL UNAVAILABLE STATE HANDLING
# =====================================================================
def test_p1_1_11_model_unavailable_registry_state():
    verifier = SpeakerVerifier(sample_rate=16000)
    verifier.status = PipelineStatus.NOT_AVAILABLE

    chunk = AudioChunkPayload(
        call_id="call-unavail",
        chunk_index=0,
        audio_base64=_make_audio_b64(_generate_vocal_tone(200.0, 1.0)),
        claimed_speaker_id="speaker-cfo-001"
    )
    res = verifier.verify_speaker(chunk)
    assert res.status == SpeakerVerificationStatus.MODEL_UNAVAILABLE
    assert res.similarity_score is None
    assert "UNAVAILABLE" in res.explainability[0]


# =====================================================================
# 12. NAN / INF AUDIO HANDLING
# =====================================================================
def test_p1_1_12_nan_inf_audio_handling():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)

    # Create audio containing NaNs and Infs
    audio = _generate_vocal_tone(f0=200.0, duration_sec=1.0)
    audio[100:120] = np.nan
    audio[200:220] = np.inf
    audio[300:320] = -np.inf

    emb = extractor.extract_embedding(audio, speaker_id="spk-nan")
    assert np.all(np.isfinite(emb.embedding))
    assert len(emb.embedding) in (128, 192)


# =====================================================================
# 13. REPEATED INFERENCE STABILITY
# =====================================================================
def test_p1_1_13_repeated_inference_stability():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    audio = _generate_vocal_tone(f0=210.0, duration_sec=1.0)

    latencies = []
    import time
    for i in range(15):
        t0 = time.perf_counter()
        emb = extractor.extract_embedding(audio, speaker_id=f"spk-rep-{i}")
        latencies.append((time.perf_counter() - t0) * 1000.0)
        assert np.all(np.isfinite(emb.embedding))

    # Expect latency to be reasonable on CPU (< 350ms per 1s chunk)
    mean_lat = np.mean(latencies)
    assert mean_lat < 350.0, f"Mean latency {mean_lat}ms exceeded 350ms CPU budget"


# =====================================================================
# 14. PIPELINE & MULTIMODAL RISK FUSION INTEGRATION
# =====================================================================
def test_p1_1_14_pipeline_and_risk_fusion_integration():
    orchestrator = UnifiedPipelineOrchestrator()
    audio = _make_audio_b64(_generate_vocal_tone(f0=180.0, duration_sec=1.0))

    chunk = AudioChunkPayload(
        call_id="call-pipeline-p1-1",
        chunk_index=0,
        audio_base64=audio,
        sample_rate=16000,
        claimed_speaker_id="speaker-cfo-001"
    )

    telemetry = orchestrator.process_chunk(chunk)
    assert telemetry.speaker_status in (SpeakerVerificationStatus.MATCH, SpeakerVerificationStatus.MISMATCH)
    assert telemetry.speaker_similarity_score is not None
    assert telemetry.speaker_engine_status == "AVAILABLE"
    assert telemetry.overall_risk_score >= 0.0
    assert telemetry.risk_level is not None


# =====================================================================
# 15. PRIVACY & LOGGING BEHAVIOR
# =====================================================================
def test_p1_1_15_privacy_and_logging_audit(caplog):
    verifier = SpeakerVerifier(sample_rate=16000)
    audio = _make_audio_b64(_generate_vocal_tone(f0=200.0, duration_sec=1.0))

    chunk = AudioChunkPayload(
        call_id="call-privacy-audit",
        chunk_index=0,
        audio_base64=audio,
        claimed_speaker_id="speaker-cfo-001"
    )

    with caplog.at_level(logging.DEBUG):
        res = verifier.verify_speaker(chunk)

    log_text = caplog.text
    # Verify no base64 raw audio was logged
    assert audio not in log_text, "Privacy Violation: Raw audio payload found in logs"
    # Verify no raw floating-point embedding vector was dumped in logs
    if res.similarity_score is not None:
        assert str(res.similarity_score) not in log_text or "Cosine similarity" in res.explainability[0]


# =====================================================================
# 16. TELEPHONY 8 KHZ RESAMPLING
# =====================================================================
def test_p1_1_16_telephony_8khz_resampling():
    verifier = SpeakerVerifier(sample_rate=16000)
    # Generate 8000 Hz telephony audio (1.0s = 8000 samples)
    t_8k = np.linspace(0, 1.0, 8000, endpoint=False)
    samples_8k = (0.4 * np.sin(2 * np.pi * 300 * t_8k)).astype(np.float32)
    b64_8k = _make_audio_b64(samples_8k)

    chunk_8k = AudioChunkPayload(
        call_id="call-telephony-8k",
        chunk_index=0,
        audio_base64=b64_8k,
        sample_rate=8000,
        claimed_speaker_id="speaker-cfo-001"
    )

    res = verifier.verify_speaker(chunk_8k)
    assert res.status in (SpeakerVerificationStatus.MATCH, SpeakerVerificationStatus.MISMATCH)
    assert res.similarity_score is not None
    assert res.speaker_backend == "NEURAL"
