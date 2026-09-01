"""
Multilingual Language Identifier for Conversational Telephony
Supports English (en), Hindi (hi), and Telugu (te).
"""

import re
from typing import Tuple
from ai.app.core.types import LanguageCode


class LanguageIdentifier:
    # Character Unicode ranges for Indian script detection
    HINDI_DEVANAGARI_RANGE = re.compile(r'[\u0900-\u097F]')
    TELUGU_RANGE = re.compile(r'[\u0C00-\u0C7F]')

    # Common transliterated telephony loan words / markers
    HINDI_TRANSLITERATED = ["aapka", "kripya", "bhejiye", "khata", "surakshit", "turant", "paisa", "bataye", "karo"]
    TELUGU_TRANSLITERATED = ["meeru", "cheppandi", "dabbulu", "khatha", "ventane", "pampandi", "raaledu"]

    def detect_language(self, text: str) -> Tuple[LanguageCode, float]:
        """
        Identifies language of the transcript and returns (LanguageCode, confidence).
        """
        if not text or len(text.strip()) == 0:
            return LanguageCode.EN, 1.0

        # 1. Native script detection
        if self.HINDI_DEVANAGARI_RANGE.search(text):
            return LanguageCode.HI, 0.95
        if self.TELUGU_RANGE.search(text):
            return LanguageCode.TE, 0.95

        # 2. Transliterated / romanized marker matching
        lower = text.lower()
        words = lower.split()

        hindi_hits = sum(1 for w in words if w in self.HINDI_TRANSLITERATED)
        telugu_hits = sum(1 for w in words if w in self.TELUGU_TRANSLITERATED)

        if hindi_hits > 0 and hindi_hits >= telugu_hits:
            conf = min(0.92, 0.60 + hindi_hits * 0.15)
            return LanguageCode.HI, conf
        elif telugu_hits > 0:
            conf = min(0.92, 0.60 + telugu_hits * 0.15)
            return LanguageCode.TE, conf

        return LanguageCode.EN, 0.90
