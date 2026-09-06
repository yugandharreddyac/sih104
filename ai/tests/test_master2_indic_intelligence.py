"""
Unit Tests for Master 2: Indic & Vernacular Multilingual Intelligence
Validates:
1. Native script detection for Kannada (KN) and Malayalam (ML).
2. Transliterated / romanized marker matching for KN and ML.
3. Code-switching with English financial terms (Hinglish, Tanglish, Kanglish, etc.).
4. Multi-turn sliding window session language tracking.
5. Safe unsupported language handling and zero-crash fallback.
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from ai.app.asr.language import LanguageIdentifier, LanguageCode


class TestIndicIntelligence:
    def setup_method(self):
        self.router = LanguageIdentifier()

    def test_kannada_native_script(self):
        decision = self.router.route_language(text_content="ದಯವಿಟ್ಟು ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸಂಖ್ಯೆಯನ್ನು ತಿಳಿಸಿ")
        assert decision.language_code == LanguageCode.KN
        assert decision.display_name == "Kannada"
        assert decision.confidence >= 0.90
        assert decision.detection_source == "script_heuristic"

    def test_malayalam_native_script(self):
        decision = self.router.route_language(text_content="നിങ്ങളുടെ ബാങ്ക് അക്കൗണ്ട് നമ്പർ നൽകുക")
        assert decision.language_code == LanguageCode.ML
        assert decision.display_name == "Malayalam"
        assert decision.confidence >= 0.90
        assert decision.detection_source == "script_heuristic"

    def test_kannada_transliterated_lexical(self):
        decision = self.router.route_language(text_content="neevu thakshana duddu transfer maadi")
        assert decision.language_code == LanguageCode.KN
        assert decision.confidence >= 0.70

    def test_malayalam_transliterated_lexical(self):
        decision = self.router.route_language(text_content="ningal panam ayakkuka udanadi")
        assert decision.language_code == LanguageCode.ML
        assert decision.confidence >= 0.70

    def test_code_switching_mixed_language_detection(self):
        decision = self.router.route_language(text_content="aapka bank account freeze ho jayega please share OTP right now")
        assert decision.language_code == LanguageCode.HI
        assert decision.mixed_language_detected is True
        assert decision.secondary_language == LanguageCode.EN_IN

    def test_kannada_code_switching_with_english(self):
        decision = self.router.route_language(text_content="neevu OTP heli bank manager calling")
        assert decision.language_code == LanguageCode.KN
        assert decision.mixed_language_detected is True

    def test_multi_turn_session_context_smoothing(self):
        session_id = "session-indic-smoothing-01"
        # Turn 1: explicit Hindi hint
        d1 = self.router.route_language(explicit_hint="hi", session_id=session_id)
        assert d1.language_code == LanguageCode.HI

        # Turn 2: subsequent turn without hint or text evaluates via Layer 4 session context
        d2 = self.router.route_language(session_id=session_id)
        assert d2.language_code == LanguageCode.HI
        assert d2.detection_source == "session_context"

    def test_safe_unsupported_language_fallback(self):
        decision = self.router.route_language(explicit_hint="xx-unsupported-lang")
        assert decision.language_code == LanguageCode.EN_IN
        assert decision.is_fallback is True
        assert decision.confidence <= 0.60
