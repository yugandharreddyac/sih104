"""
Unit Tests for Streaming ASR Engine & Multilingual Language Identification (Phase 4)
"""

import base64
import numpy as np
import pytest
from ai.app.asr.transcriber import StreamingASRTranscriber
from ai.app.asr.language import LanguageIdentifier
from ai.app.core.types import AudioChunkPayload, LanguageCode, AudioQualityResult, AudioQualityRating


def test_language_identification_multilingual():
    lid = LanguageIdentifier()

    # English
    lang_en, conf_en = lid.detect_language("Please transfer the funds immediately to my account.")
    assert lang_en == LanguageCode.EN
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
