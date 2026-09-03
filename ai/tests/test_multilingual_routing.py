"""
Unit & Multi-Turn Tests for Multilingual Language Routing & Indian Dialect Support (Phase 6.5).
Covers:
1. Normalization of Indian language codes and locales (hi, ta, te, bn, mr, en-IN)
2. Explicit application routing
3. Automatic neural detection and mapping
4. Unsupported and unknown language handling
5. Multi-turn session context tracking and dynamic language switching
6. Code-switching / mixed-language estimation
7. ASR integration with neural language hints and DSP fallback
"""

import numpy as np
import pytest
from unittest.mock import MagicMock, patch

from ai.app.asr.language import LanguageIdentifier, LanguageContextTracker, LanguageRoutingDecision
from ai.app.asr.engine import StreamingASREngine
from ai.app.core.types import LanguageCode, TranscriptSegment, AudioQualityResult, AudioQualityRating


def test_language_normalization_all_supported_indian_locales():
    lid = LanguageIdentifier()

    # Hindi
    assert lid.normalize_language_code("hi") == LanguageCode.HI
    assert lid.normalize_language_code("hi-IN") == LanguageCode.HI
    assert lid.normalize_language_code("HINDI") == LanguageCode.HI
    assert lid.normalize_language_code("hin-in") == LanguageCode.HI

    # Tamil
    assert lid.normalize_language_code("ta") == LanguageCode.TA
    assert lid.normalize_language_code("ta-IN") == LanguageCode.TA
    assert lid.normalize_language_code("Tamil") == LanguageCode.TA

    # Telugu
    assert lid.normalize_language_code("te") == LanguageCode.TE
    assert lid.normalize_language_code("te-IN") == LanguageCode.TE
    assert lid.normalize_language_code("Telugu") == LanguageCode.TE

    # Bengali
    assert lid.normalize_language_code("bn") == LanguageCode.BN
    assert lid.normalize_language_code("bn-IN") == LanguageCode.BN
    assert lid.normalize_language_code("Bengali") == LanguageCode.BN
    assert lid.normalize_language_code("bangla") == LanguageCode.BN

    # Marathi
    assert lid.normalize_language_code("mr") == LanguageCode.MR
    assert lid.normalize_language_code("mr-IN") == LanguageCode.MR
    assert lid.normalize_language_code("Marathi") == LanguageCode.MR

    # Indian English
    assert lid.normalize_language_code("en-IN") == LanguageCode.EN_IN
    assert lid.normalize_language_code("english india") == LanguageCode.EN_IN
    assert lid.normalize_language_code("Indian English") == LanguageCode.EN_IN

    # Generic English
    assert lid.normalize_language_code("en") == LanguageCode.EN
    assert lid.normalize_language_code("english") == LanguageCode.EN

    # Unsupported & Unknown
    assert lid.normalize_language_code("fr-FR") == LanguageCode.UNSUPPORTED
    assert lid.normalize_language_code("es-ES") == LanguageCode.UNSUPPORTED
    assert lid.normalize_language_code("invalid_locale_xyz") == LanguageCode.UNSUPPORTED
    assert lid.normalize_language_code(None) == LanguageCode.UNKNOWN
    assert lid.normalize_language_code("") == LanguageCode.UNKNOWN


def test_explicit_routing_all_six_languages():
    lid = LanguageIdentifier()

    languages = [
        ("hi", LanguageCode.HI, "Hindi", "hi"),
        ("ta", LanguageCode.TA, "Tamil", "ta"),
        ("te", LanguageCode.TE, "Telugu", "te"),
        ("bn", LanguageCode.BN, "Bengali", "bn"),
        ("mr", LanguageCode.MR, "Marathi", "mr"),
        ("en-IN", LanguageCode.EN_IN, "Indian English", "en"),
    ]

    for hint, expected_code, expected_name, expected_asr_hint in languages:
        decision = lid.route_language(explicit_hint=hint)
        assert isinstance(decision, LanguageRoutingDecision)
        assert decision.language_code == expected_code
        assert decision.display_name == expected_name
        assert decision.asr_language_hint == expected_asr_hint
        assert decision.detection_source == "explicit"
        assert decision.confidence >= 0.95
        assert decision.is_fallback is False


def test_automatic_detection_from_native_scripts():
    lid = LanguageIdentifier()

    # Tamil Script
    ta_decision = lid.route_language(text_content="உங்கள் கணக்கு விவரங்களை சரிபார்க்கவும்")
    assert ta_decision.language_code == LanguageCode.TA
    assert ta_decision.confidence >= 0.90
    assert ta_decision.detection_source == "script_heuristic"

    # Telugu Script
    te_decision = lid.route_language(text_content="దయచేసి మీ బ్యాంక్ ఖాతా వివరాలు చెప్పండి")
    assert te_decision.language_code == LanguageCode.TE
    assert te_decision.confidence >= 0.90

    # Bengali Script
    bn_decision = lid.route_language(text_content="আপনার ওটিপি কাউকে বলবেন না")
    assert bn_decision.language_code == LanguageCode.BN
    assert bn_decision.confidence >= 0.90

    # Hindi Script
    hi_decision = lid.route_language(text_content="कृपया अपना ओटीपी तुरंत साझा करें")
    assert hi_decision.language_code == LanguageCode.HI
    assert hi_decision.confidence >= 0.90


def test_automatic_detection_from_whisper_neural_output():
    lid = LanguageIdentifier()

    # Whisper reports 'ta' with 0.88 probability
    decision = lid.route_language(whisper_detected_lang="ta", whisper_probability=0.88)
    assert decision.language_code == LanguageCode.TA
    assert decision.confidence == 0.88
    assert decision.detection_source == "neural_whisper"

    # Whisper reports generic 'en' -> routed to 'en-IN' application profile
    en_decision = lid.route_language(whisper_detected_lang="en", whisper_probability=0.91)
    assert en_decision.language_code == LanguageCode.EN_IN
    assert en_decision.display_name == "Indian English"
    assert en_decision.detection_source == "neural_whisper"


def test_unsupported_language_safe_handling():
    lid = LanguageIdentifier()

    # Caller passes completely unsupported language
    decision = lid.route_language(explicit_hint="fr-FR")
    # Must NOT crash; falls back gracefully
    assert decision.language_code in (LanguageCode.EN_IN, LanguageCode.EN)
    assert decision.is_fallback is True


def test_low_confidence_fallback_routing():
    lid = LanguageIdentifier()

    # No explicit hint, no text, no whisper info -> fallback
    decision = lid.route_language()
    assert decision.language_code == LanguageCode.EN_IN
    assert decision.is_fallback is True
    assert decision.detection_source == "fallback"
    assert decision.confidence <= 0.70


def test_multi_turn_conversational_tracking_and_switching():
    tracker = LanguageContextTracker(max_history=5)
    call_id = "session-multiturn-call-99"

    # Turn 1-3: Hindi dominant
    tracker.record_observation(call_id, LanguageCode.HI, 0.92)
    tracker.record_observation(call_id, LanguageCode.HI, 0.94)
    tracker.record_observation(call_id, LanguageCode.HI, 0.90)

    dom_lang, dom_conf = tracker.get_dominant_language(call_id)
    assert dom_lang == LanguageCode.HI
    assert dom_conf >= 0.90

    # Turn 4-6: Caller switches to English
    tracker.record_observation(call_id, LanguageCode.EN_IN, 0.95)
    tracker.record_observation(call_id, LanguageCode.EN_IN, 0.96)
    tracker.record_observation(call_id, LanguageCode.EN_IN, 0.98)

    # Dynamic language switching: English now becomes dominant due to recency and frequency
    dom_lang_switched, dom_conf_switched = tracker.get_dominant_language(call_id)
    assert dom_lang_switched == LanguageCode.EN_IN
    assert dom_conf_switched >= 0.60

    # Memory cleanup
    tracker.clear_session(call_id)
    assert tracker.get_dominant_language(call_id) is None


def test_code_switching_and_mixed_language_estimation():
    lid = LanguageIdentifier()

    # Transliterated Hindi with English technical banking loan words (Hinglish)
    mixed_text = "Aapka bank account verify karne ke liye urgent otp bhejiye"
    lang, conf, is_mixed, sec_lang = lid.detect_from_text(mixed_text)

    assert lang == LanguageCode.HI
    assert is_mixed is True
    assert sec_lang == LanguageCode.EN_IN

    # Decision router includes mixed language indicators
    decision = lid.route_language(text_content=mixed_text)
    assert decision.primary_language == LanguageCode.HI
    assert decision.mixed_language_detected is True
    assert decision.secondary_language == LanguageCode.EN_IN


def test_asr_engine_language_hint_routing():
    engine = StreamingASREngine(sample_rate=16000)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    samples = (0.4 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)

    # Explicit Tamil routing
    txt, segs, lang, conf, unc = engine.transcribe_chunk(
        samples=samples,
        text_hint="உங்கள் கணக்கு",
        language_hint="ta-IN"
    )
    assert lang == LanguageCode.TA
    assert len(segs) > 0
    assert segs[0].language == LanguageCode.TA


def test_asr_dsp_fallback_on_neural_fault():
    engine = StreamingASREngine(sample_rate=16000)
    original_model = StreamingASREngine._cached_neural_model

    try:
        mock_model = MagicMock()
        mock_model.transcribe.side_effect = RuntimeError("Synthetic ASR graph error")
        StreamingASREngine._cached_neural_model = mock_model

        t = np.linspace(0, 1.0, 16000, endpoint=False)
        samples = (0.5 * np.sin(2 * np.pi * 400 * t)).astype(np.float32)

        txt, segs, lang, conf, unc = engine.transcribe_chunk(samples=samples)
        # Critical security guarantee: When neural ASR faults, no speech is fabricated
        assert txt == ""
        assert len(segs) == 0
        assert conf == 0.0
        assert unc == 1.0
        assert lang in (LanguageCode.EN, LanguageCode.EN_IN)
    finally:
        StreamingASREngine._cached_neural_model = original_model
