"""
Unit Tests for Speaker Biometric Verification, Secure Multi-Utterance Enrollment,
and Phase 6.3 ECAPA-TDNN ONNX Neural Integration.
"""

import base64
import hashlib
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from ai.app.speaker.verifier import SpeakerVerifier
from ai.app.speaker.embedding import SpeakerEmbeddingExtractor
from ai.app.speaker.similarity import SpeakerSimilarityMatcher
from ai.app.core.model_registry import ModelRegistry
from ai.app.core.types import (
    AudioChunkPayload,
    SpeakerVerificationStatus,
    SpeakerEnrollmentRequest,
    SpeakerVerificationResult,
    PipelineStatus,
    DeepfakeStatus
)


def generate_speaker_tone(f0: float = 300.0, duration_sec: float = 1.0, sample_rate: int = 16000) -> str:
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    samples = (0.5 * np.sin(2 * np.pi * f0 * t) + 0.2 * np.sin(2 * np.pi * (2 * f0) * t)).astype(np.float32)
    int16 = (samples * 20000).astype(np.int16)
    return base64.b64encode(int16.tobytes()).decode("utf-8")


def test_speaker_enrollment_and_matching():
    verifier = SpeakerVerifier(sample_rate=16000)

    # 1. Enroll new executive speaker with 2 valid utterances
    utt1 = generate_speaker_tone(f0=220.0, duration_sec=1.0)
    utt2 = generate_speaker_tone(f0=220.0, duration_sec=1.0)

    req = SpeakerEnrollmentRequest(
        speaker_id="speaker-ceo-test",
        speaker_name="Sarah Connor (CEO)",
        audio_utterances_base64=[utt1, utt2],
        metadata={"role": "CEO"}
    )
    success, profile, msg = verifier.enrollment_manager.enroll_speaker(req)
    assert success is True
    assert profile.speaker_id == "speaker-ceo-test"
    assert profile.anti_spoof_verified is True
    assert profile.embedding_dimension in (128, 192)

    # 2. Verify with matching speaker audio
    match_chunk = AudioChunkPayload(
        call_id="call-spk-match",
        chunk_index=0,
        audio_base64=generate_speaker_tone(f0=220.0, duration_sec=1.0),
        claimed_speaker_id="speaker-ceo-test"
    )
    res = verifier.verify_speaker(match_chunk)
    assert res.status == SpeakerVerificationStatus.MATCH
    assert res.similarity_score is not None
    assert res.similarity_score >= res.threshold_applied

    # 3. Verify with mismatching imposter voice (f0=550Hz)
    imposter_chunk = AudioChunkPayload(
        call_id="call-spk-mismatch",
        chunk_index=1,
        audio_base64=generate_speaker_tone(f0=550.0, duration_sec=1.0),
        claimed_speaker_id="speaker-ceo-test"
    )
    mismatch_res = verifier.verify_speaker(imposter_chunk)
    assert mismatch_res.status == SpeakerVerificationStatus.MISMATCH
    assert mismatch_res.similarity_score < mismatch_res.threshold_applied


def test_enrollment_rejection_insufficient_utterances():
    verifier = SpeakerVerifier(sample_rate=16000)
    # Only 1 utterance provided
    req = SpeakerEnrollmentRequest(
        speaker_id="speaker-bad",
        speaker_name="Bad Enrollment",
        audio_utterances_base64=[generate_speaker_tone(f0=200.0, duration_sec=1.0)]
    )
    success, profile, msg = verifier.enrollment_manager.enroll_speaker(req)
    assert success is False
    assert "minimum of 2 reference utterances" in msg


def test_ecapa_tdnn_model_initialization_and_metadata():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    assert extractor.sample_rate == 16000
    assert extractor.model_version == "speaker_xvector_biometric_v3"
    assert isinstance(extractor.is_neural_active, bool)

    model_meta = ModelRegistry.get_model("speaker_xvector_biometric_v3")
    assert model_meta is not None
    assert model_meta.category == "SPEAKER"
    assert model_meta.framework in ("ONNX_NEURAL_DSP", "NUMPY_DSP_NEURAL")
    assert len(model_meta.checksum_sha256) == 64


def test_ecapa_tdnn_integrity_verification_sha256():
    model_meta = ModelRegistry.get_model("speaker_xvector_biometric_v3")
    test_content = b"voxshield_ecapa_tdnn_model_test_payload"
    test_sha256 = hashlib.sha256(test_content).hexdigest()
    with patch.object(model_meta, "checksum_sha256", test_sha256):
        with patch.dict(ModelRegistry._models, {model_meta.model_id: model_meta}):
            assert ModelRegistry.verify_integrity(model_meta.model_id, test_content) is True
            assert ModelRegistry.verify_integrity(model_meta.model_id, b"corrupted_binary") is False


def test_speaker_embedding_normalization_and_dimension():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    samples = (0.4 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)

    emb_vec = extractor.extract_embedding(samples, speaker_id="spk-norm-test")
    assert emb_vec.dimension in (128, 192)
    assert len(emb_vec.embedding) == emb_vec.dimension
    assert np.all(np.isfinite(emb_vec.embedding))

    # Verify spherical L2 unit norm
    norm = np.linalg.norm(emb_vec.embedding)
    assert abs(norm - 1.0) < 1e-2


def test_speaker_embedding_dsp_fallback_path():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    samples = (0.4 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)

    # Force DSP extraction
    dsp_emb = extractor.extract_embedding(samples, speaker_id="spk-dsp-test", force_dsp=True)
    assert dsp_emb.dimension == 128
    assert len(dsp_emb.embedding) == 128
    assert np.all(np.isfinite(dsp_emb.embedding))


def test_speaker_embedding_onnx_failure_dsp_fallback():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)
    original_session = SpeakerEmbeddingExtractor._cached_session

    try:
        # Mock ONNX session to raise RuntimeError
        mock_sess = MagicMock()
        mock_sess.run.side_effect = RuntimeError("Synthetic ONNX Runtime execution fault")
        SpeakerEmbeddingExtractor._cached_session = mock_sess

        t = np.linspace(0, 1.0, 16000, endpoint=False)
        samples = (0.4 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)

        # Must fall back gracefully to DSP without raising exception
        emb_vec = extractor.extract_embedding(samples, speaker_id="spk-fault-test")
        assert emb_vec.dimension == 128
        assert len(emb_vec.embedding) == 128
        assert np.all(np.isfinite(emb_vec.embedding))
    finally:
        SpeakerEmbeddingExtractor._cached_session = original_session


def test_speaker_embedding_short_and_silent_audio():
    extractor = SpeakerEmbeddingExtractor(sample_rate=16000)

    # Audio too short (<320 samples)
    short_samples = np.zeros(200, dtype=np.float32)
    short_emb = extractor.extract_embedding(short_samples, speaker_id="spk-short")
    assert short_emb.energy_norm == 0.0
    assert np.all(np.array(short_emb.embedding) == 0.0)

    # Silent audio (zeros)
    silent_samples = np.zeros(16000, dtype=np.float32)
    silent_emb = extractor.extract_embedding(silent_samples, speaker_id="spk-silent")
    assert len(silent_emb.embedding) in (128, 192)


def test_enrollment_anti_spoofing_gate_enforcement():
    verifier = SpeakerVerifier(sample_rate=16000)

    utt1 = generate_speaker_tone(f0=220.0, duration_sec=1.0)
    utt2 = generate_speaker_tone(f0=220.0, duration_sec=1.0)

    req = SpeakerEnrollmentRequest(
        speaker_id="speaker-spoofed",
        speaker_name="Spoofed Imposter",
        audio_utterances_base64=[utt1, utt2]
    )

    # Mock DeepfakeDetector to return SUSPICIOUS on enrollment
    with patch.object(verifier.enrollment_manager.deepfake_detector, "analyze") as mock_df:
        mock_res = MagicMock()
        mock_res.status = DeepfakeStatus.SUSPICIOUS
        mock_df.return_value = mock_res

        success, profile, msg = verifier.enrollment_manager.enroll_speaker(req)
        assert success is False
        assert profile is None
        assert "rejected by anti-spoof screening" in msg


def test_speaker_verification_result_contract():
    verifier = SpeakerVerifier(sample_rate=16000)
    utt = generate_speaker_tone(f0=300.0, duration_sec=1.0)
    chunk = AudioChunkPayload(
        call_id="call-contract-check",
        chunk_index=0,
        audio_base64=utt,
        claimed_speaker_id="speaker-cfo-001"
    )

    res = verifier.verify_speaker(chunk)
    assert isinstance(res, SpeakerVerificationResult)
    assert res.status in (SpeakerVerificationStatus.MATCH, SpeakerVerificationStatus.MISMATCH)
    assert res.is_enrolled is True
    assert res.enrolled_speaker_id == "speaker-cfo-001"
    assert res.threshold_applied in (0.70, 0.88)
    assert res.similarity_score is not None
    assert res.confidence is not None
    assert res.engine_type in ("NEURAL", "DSP_FALLBACK")
    assert res.inference_latency_ms >= 0.0
    assert len(res.explainability) > 0


def test_speaker_engine_provenance_neural_and_fallback():
    verifier = SpeakerVerifier(sample_rate=16000)
    utt = generate_speaker_tone(f0=220.0, duration_sec=1.0)
    samples = verifier.decode_samples(utt)

    # 1. Primary path (NEURAL when model is loaded)
    emb_neural = verifier.embedding_extractor.extract_embedding(samples, speaker_id="spk-prov-01")
    assert emb_neural.engine_type in ("NEURAL", "DSP_FALLBACK")

    # 2. Forced DSP Fallback path
    emb_dsp = verifier.embedding_extractor.extract_embedding(samples, speaker_id="spk-prov-02", force_dsp=True)
    assert emb_dsp.engine_type == "DSP_FALLBACK"

    # 3. Unenrolled speaker -> engine_type is None
    chunk_unenrolled = AudioChunkPayload(
        call_id="call-unenrolled",
        chunk_index=0,
        audio_base64=utt,
        claimed_speaker_id="spk-nonexistent"
    )
    res_unenrolled = verifier.verify_speaker(chunk_unenrolled)
    assert res_unenrolled.status == SpeakerVerificationStatus.NOT_ENROLLED
    assert res_unenrolled.engine_type is None
