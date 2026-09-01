"""
Sensitive Entity Regex Patterns & Semantic Context Matchers
"""

import re
from typing import Dict, List, Pattern
from ai.app.core.types import SensitiveDataType

SENSITIVE_ENTITY_PATTERNS: Dict[SensitiveDataType, List[Pattern]] = {
    SensitiveDataType.OTP: [
        re.compile(r'\b(?:otp|code|passcode)\s*(?:is|:|=)?\s*([0-9]{4,8})\b', re.I),
        re.compile(r'\b([0-9]{3}[-\s][0-9]{3})\b'),
        re.compile(r'\b([0-9]{4,8})\b(?=.*\b(?:otp|verification|passcode)\b)', re.I),
    ],
    SensitiveDataType.CVV: [
        re.compile(r'\b(?:cvv|cvc|security\s+code)\s*(?:is|:|=)?\s*([0-9]{3,4})\b', re.I),
    ],
    SensitiveDataType.CREDIT_CARD: [
        re.compile(r'\b(?:\d{4}[-\s]?){3}\d{4}\b'),
    ],
    SensitiveDataType.PASSWORD: [
        re.compile(r'\b(?:password|pin|passphrase)\s*(?:is|:|=)?\s*(\S+)\b', re.I),
    ],
    SensitiveDataType.AADHAAR: [
        re.compile(r'\b[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}\b'),
    ],
    SensitiveDataType.PAN: [
        re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', re.I),
    ]
}
