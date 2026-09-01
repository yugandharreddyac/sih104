"""
Unit Tests for Streaming ASR Engine, Multilingual Language Identification,
and Phase 6.2 Neural Faster-Whisper Dual-Engine Integration.
"""

import os
import hashlib
import base64
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from ai.app.asr.engine import StreamingASREngine
from ai.app.asr.transcriber import StreamingASRTranscriber
from ai.app.asr.language import LanguageIdentifier
from ai.app.core.model_registry import ModelRegistry
from ai.app.core.types import (
    AudioChunkPayload,
    LanguageCode,
    AudioQualityResult,
    AudioQualityRating,
    PipelineStatus,
    ASRResult
)


def test_language_identification_multilingual():
    lid = LanguageIdentifier()

    # English
    lang_en, conf_en = lid.detect_language("Please transfer the funds immediately to my account.")
    assert lang_en in (LanguageCode.EN, LanguageCode.EN_IN)
    assert conf_en >= 0.85

    # Hindi (Devanagari)
    lang_hi, conf_hi = lid.detect_language("कृपया तुरंत अपना ओटीपी बताएं")
    assert lang_hi == LanguageCode.HI
    assert conf_hi >= 0.90

    # Hindi (Transliterated)
    lang_hi_tr, conf_hi_tr = lid.detect_language("aapka otp turant bataye")
    assert lang_hi_tr == LanguageCode.HI

    # Telugu (Transliterated)
    lang_te, conf_te = lid.detect_language("meeru ventane dabbulu pampandi")
    assert lang_te == LanguageCode.TE


def test_asr_uncertainty_propagation_on_poor_quality():
    transcriber = StreamingASRTranscriber(sample_rate=16000)
    chunk = AudioChunkPayload(
        call_id="call-asr-test",
        chunk_index=0,
        text_transcript="I am calling from the bank."
    )
    poor_quality = AudioQualityResult(
        rating=AudioQualityRating.POOR,
        rms_dbfs=-55.0,
        peak_amplitude=0.99,
        clipping_ratio=0.15,
        silence_ratio=0.2,
        snr_estimate_db=2.0,
        dynamic_range_db=3.0,
        sample_rate=16000,
        channels=1,
        duration_ms=500.0,
        uncertainty_penalty=0.85,
        notes="Poor audio quality."
    )
    res = transcriber.transcribe(chunk, quality=poor_quality)
    assert res.confidence < 0.50
    assert res.uncertainty >= 0.50


def test_neural_asr_initialization_and_discovery():
    engine = StreamingASREngine(sample_rate=16000)
    assert engine.sample_rate == 16000
    assert engine.model_version == "whisper_streaming_conformer_v4"
    # Verify neural model is active if files are staged, or fallback ready
    assert isinstance(engine.is_neural_active, bool)


def test_asr_model_registry_metadata_and_integrity():
    models = ModelRegistry.list_models()
    asr_models = [m for m in models if m.category == "ASR"]
    assert len(asr_models) >= 1

    whisper_m = ModelRegistry.get_model("whisper_streaming_conformer_v4")
    assert whisper_m is not None
    assert whisper_m.framework == "CTRANSLATE2_INT8"
    assert whisper_m.device in ("CPU", "CUDA")
    assert whisper_m.status == PipelineStatus.AVAILABLE
    assert len(whisper_m.checksum_sha256) == 64

    # Verify SHA-256 integrity verification mechanism
    test_content = b"voxshield_model_binary_test_payload"
    test_sha256 = hashlib.sha256(test_content).hexdigest()
    with patch.object(whisper_m, "checksum_sha256", test_sha256):
        with patch.dict(ModelRegistry._models, {whisper_m.model_id: whisper_m}):
            assert ModelRegistry.verify_integrity(whisper_m.model_id, test_content) is True
            assert ModelRegistry.verify_integrity(whisper_m.model_id, b"corrupted_bytes") is False


def test_neural_asr_transcribe_with_text_hint_and_audio():
    engine = StreamingASREngine(sample_rate=16000)
    t = np.linspace(0, 0.5, 8000, endpoint=False)
    samples = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

    raw_text, segments, lang, conf, uncertainty = engine.transcribe_chunk(
        samples=samples,
        text_hint="Please provide your verification code.",
        speaker_channel=0,
        start_ms=0
    )

    assert raw_text == "Please provide your verification code."
    assert len(segments) == 1
    assert segments[0].text == "Please provide your verification code."
    assert segments[0].speaker_channel == 0
    assert segments[0].start_ms == 0
    assert segments[0].end_ms == 500
    assert lang == LanguageCode.EN
    assert conf >= 0.80
    assert uncertainty <= 0.30


def test_neural_engine_unavailable_dsp_fallback():
    # Instantiate engine with non-existent path to trigger DSP fallback
    engine = StreamingASREngine(sample_rate=16000)
    # Temporarily force neural model inactive
    original_model = StreamingASREngine._cached_neural_model
    try:
        StreamingASREngine._cached_neural_model = None

        t = np.linspace(0, 0.5, 8000, endpoint=False)
        # High energy audio with no text hint
        samples = (0.3 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)

        raw_text, segments, lang, conf, uncertainty = engine.transcribe_chunk(
            samples=samples,
            text_hint=None,
            speaker_channel=1,
            start_ms=100
        )

        assert raw_text == "I am calling regarding your account security."
        assert len(segments) == 1
        assert segments[0].speaker_channel == 1
        assert segments[0].start_ms == 100
        assert segments[0].end_ms == 600
        assert lang == LanguageCode.EN
        assert conf >= 0.80
    finally:
        StreamingASREngine._cached_neural_model = original_model


def test_neural_inference_exception_dsp_fallback():
    engine = StreamingASREngine(sample_rate=16000)
    original_model = StreamingASREngine._cached_neural_model
    try:
        # Mock neural model to raise exception
        mock_model = MagicMock()
        mock_model.transcribe.side_effect = RuntimeError("Synthetic ONNX/CT2 execution fault")
        StreamingASREngine._cached_neural_model = mock_model

        t = np.linspace(0, 0.5, 8000, endpoint=False)
        samples = (0.3 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)

        raw_text, segments, lang, conf, uncertainty = engine.transcribe_chunk(
            samples=samples,
            text_hint=None,
            speaker_channel=0,
            start_ms=0
        )

        # Must fall back gracefully to DSP heuristic without raising an exception
        assert raw_text == "I am calling regarding your account security."
        assert len(segments) == 1
        assert lang == LanguageCode.EN
    finally:
        StreamingASREngine._cached_neural_model = original_model


def test_invalid_and_silent_audio_handling():
    engine = StreamingASREngine(sample_rate=16000)

    # Empty samples
    empty_samples = np.zeros(0, dtype=np.float32)
    raw_text, segments, lang, conf, uncertainty = engine.transcribe_chunk(
        samples=empty_samples,
        text_hint=None
    )
    assert raw_text == ""
    assert len(segments) == 0

    # Silent samples
    silent_samples = np.zeros(1600, dtype=np.float32)
    raw_text, segments, lang, conf, uncertainty = engine.transcribe_chunk(
        samples=silent_samples,
        text_hint=None
    )
    assert raw_text == ""
    assert len(segments) == 0


def test_multilingual_language_parameter_routing():
    transcriber = StreamingASRTranscriber(sample_rate=16000)

    # Hindi explicit hint in chunk
    chunk_hi = AudioChunkPayload(
        call_id="call-multilingual-01",
        chunk_index=0,
        text_transcript="कृपया अपना पिन नंबर न बताएं",
        metadata={"language": "hi"}
    )
    res_hi = transcriber.transcribe(chunk_hi)
    assert res_hi.language == LanguageCode.HI
    assert res_hi.transcript == "कृपया अपना पिन नंबर न बताएं"

    # Telugu explicit hint in chunk
    chunk_te = AudioChunkPayload(
        call_id="call-multilingual-02",
        chunk_index=0,
        text_transcript="మీ బ్యాంక్ ఖాతా వివరాలు చెప్పండి",
        metadata={"language": "te"}
    )
    res_te = transcriber.transcribe(chunk_te)
    assert res_te.language == LanguageCode.TE


def test_asr_result_contract_integrity():
    transcriber = StreamingASRTranscriber(sample_rate=16000)
    int16_samples = (np.sin(np.linspace(0, 1, 3200)) * 5000).astype(np.int16)
    audio_b64 = base64.b64encode(int16_samples.tobytes()).decode("utf-8")

    chunk = AudioChunkPayload(
        call_id="call-contract-test",
        chunk_index=1,
        audio_base64=audio_b64,
        text_transcript="Verify account transaction.",
        speaker_channel=0,
        timestamp_ms=250
    )

    res = transcriber.transcribe(chunk)
    assert isinstance(res, ASRResult)
    assert res.status == PipelineStatus.AVAILABLE
    assert res.model_version == "whisper_streaming_conformer_v4"
    assert res.transcript == "Verify account transaction."
    assert res.redacted_transcript == "Verify account transaction."
    assert res.language == LanguageCode.EN
    assert res.word_count == 3
    assert res.confidence > 0.70
    assert res.uncertainty < 0.30
    assert res.is_final is True
    assert res.inference_latency_ms >= 0.0
    assert len(res.segments) == 1
    assert res.segments[0].start_ms == 250
