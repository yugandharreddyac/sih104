"""
Victim Hesitation & Refusal Resistance Detector (Master 2)
Detects recipient skepticism, reluctance, questions regarding necessity,
and explicit refusal to disclose credentials or transfer funds across English and Indic dialects.
"""

import re
from typing import Tuple, Optional


class ResistanceDetector:
    def __init__(self):
        self.hesitation_patterns = [
            re.compile(
                r'\b(why\s+(?:do\s+you\s+need|are\s+you\s+asking\s+for)|is\s+this\s+(?:really|safe|official)|'
                r'let\s+me\s+call\s+(?:the\s+)?(?:branch|bank|manager)|not\s+comfortable|'
                r'bank\s+never\s+asks|suspicious|i\s+need\s+to\s+verify|let\s+me\s+check\s+first)\b',
                re.I
            ),
            # Indic hesitation
            re.compile(
                r'\b(kyun\s+chahiye|mai\s+kyun\s+batau|branch\s+me\s+baat\s+karunga|doubt\s+hai|'
                r'enduku\s+kaavali|nenu\s+branch\s+ki\s+veltha|namalenu|'
                r'yenakku\s+doubt|solla\s+bayam|'
                r'yaake\s+beku|nanage\s+doubt\s+ide|heloke\s+aagalla|'
                r'enthaanu\s+kaaranam|vishwasikkan\s+pattilla)\b',
                re.I
            ),
        ]

        self.refusal_patterns = [
            re.compile(
                r'\b(i\s+(?:will\s+not|won\'t|cannot|can\'t)\s+(?:share|tell|give|send|disclose)|'
                r'no\s+way|absolutely\s+not|i\s+refuse|i\s+will\s+not\s+(?:transfer|pay)|'
                r'stop\s+calling\s+me|i\s+am\s+hanging\s+up)\b',
                re.I
            ),
            # Indic refusal
            re.compile(
                r'\b(nahi\s+dunga|nahi\s+bataunga|share\s+nahi\s+karunga|mat\s+pucho|'
                r'nenu\s+cheppanu|share\s+cheyyanu|dabbulu\s+pampanu|'
                r'solla\s+mudiyadhu|kanna\s+kodukka\s+mudiyadhu|'
                r'helodilla|duddu\s+kodalla|'
                r'parayilla|panam\s+thannilla|'
                r'bolbo\s+na|taka\s+debo\s+na|'
                r'sangnar\s+nahi|paise\s+denar\s+nahi)\b',
                re.I
            ),
        ]

    def evaluate_resistance(self, text: str) -> Tuple[bool, bool, Optional[str]]:
        """
        Evaluates dialogue for recipient hesitation or explicit refusal.
        Returns: (hesitation_detected, refusal_detected, matching_cue)
        """
        if not text:
            return False, False, None

        for p in self.refusal_patterns:
            m = p.search(text)
            if m:
                return True, True, f"Explicit refusal: '{m.group(0)}'"

        for p in self.hesitation_patterns:
            m = p.search(text)
            if m:
                return True, False, f"Hesitation/reluctance: '{m.group(0)}'"

        return False, False, None
