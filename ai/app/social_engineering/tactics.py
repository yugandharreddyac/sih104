"""
Social Engineering Linguistic Tactics Extractor
Detects Authority, Urgency, Fear, Secrecy, Isolation, Verification Bypass, and Financial Pressure.
"""

import re
from typing import Dict, List, Tuple
from ai.app.core.types import SocialEngineeringTactic

TACTIC_PATTERNS: Dict[SocialEngineeringTactic, List[re.Pattern]] = {
    SocialEngineeringTactic.AUTHORITY_EXPLOITATION: [
        re.compile(r'\b(i\s+am|this\s+is)\s+(calling\s+from\s+)?(the\s+|your\s+)?(bank\s+)?(fraud\s+department|security\s+team|it\s+support|branch\s+manager|manager|police|cyber\s+crime|headquarters|ceo|cfo|executive|helpdesk)\b', re.I),
        re.compile(r'\b(rbi|fbi|irs|police\s+station|tax\s+department|customs\s+office|bank\s+official)\b', re.I),
    ],
    SocialEngineeringTactic.URGENCY_PRESSURE: [
        re.compile(r'\b(immediately|right\s+now|urgently|within\s+(?:2|5|10)\s+minutes|asap|turant|jaldi|ventane)\b', re.I),
        re.compile(r'\b(time\s+is\s+running\s+out|limited\s+time|before\s+it\'s\s+too\s+late)\b', re.I),
    ],
    SocialEngineeringTactic.FEAR_COERCION: [
        re.compile(r'\b(account\s+will\s+be\s+(?:blocked|suspended|frozen|closed))\b', re.I),
        re.compile(r'\b(arrest|legal\s+action|police\s+case|court\s+notice|penalty|heavy\s+fine|jail)\b', re.I),
        re.compile(r'\b(security\s+compromised|hacked|unauthorized\s+transaction)\b', re.I),
    ],
    SocialEngineeringTactic.SECRECY_DEMAND: [
        re.compile(r'\b(do\s+not|don\'t)\s+(tell|inform|share\s+with|mention\s+to)\s+(anyone|your\s+manager|family|colleagues)\b', re.I),
        re.compile(r'\b(keep\s+this\s+(?:strictly\s+)?confidential|secret\s+investigation)\b', re.I),
    ],
    SocialEngineeringTactic.ISOLATION_ATTEMPT: [
        re.compile(r'\b(stay\s+on\s+the\s+line|do\s+not\s+(?:hang\s+up|disconnect|call\s+back))\b', re.I),
        re.compile(r'\b(phone\s+katna\s+mat|call\s+disconnect\s+mat\s+karna)\b', re.I),
    ],
    SocialEngineeringTactic.VERIFICATION_BYPASS: [
        re.compile(r'\b(no\s+need\s+to\s+call|don\'t\s+use\s+the\s+official\s+number|i\s+will\s+verify\s+you\s+here|i\s+will\s+verify\s+you\s+right\s+here)\b', re.I),
        re.compile(r'\b(do\s+not|don\'t)\s+(call|contact)\s+(the\s+)?(branch|bank|official|official\s+number)\b', re.I),
        re.compile(r'\b(bypass|skip\s+the|manual\s+override\s+code)\b', re.I),
    ],
    SocialEngineeringTactic.FINANCIAL_PRESSURE: [
        re.compile(r'\b(transfer|wire|send)\s+(money|funds|balance|payment)\s+(to\s+secure\s+account|immediately)\b', re.I),
        re.compile(r'\b(paisa\s+bhejo|advance\s+payment|security\s+deposit)\b', re.I),
    ]
}


class SocialEngineeringTacticsExtractor:
    def extract_tactics(self, text: str) -> Tuple[List[SocialEngineeringTactic], List[str]]:
        """
        Extracts social engineering tactics and matching evidence strings.
        """
        if not text:
            return [], []

        tactics_found: List[SocialEngineeringTactic] = []
        evidence_found: List[str] = []

        for tactic, patterns in TACTIC_PATTERNS.items():
            for p in patterns:
                m = p.search(text)
                if m:
                    tactics_found.append(tactic)
                    evidence_found.append(f"[{tactic.value}] '{m.group(0)}'")
                    break

        return tactics_found, evidence_found
