"""
Conversational Intent Taxonomy & Semantic Rule Patterns
Contextual multi-token grammatical and linguistic patterns across English, Hindi, and Telugu.
"""

import re
from typing import Dict, List, Tuple
from ai.app.core.types import IntentCategory

INTENT_PATTERNS: Dict[IntentCategory, List[re.Pattern]] = {
    IntentCategory.OTP_REQUEST: [
        re.compile(r'\b(read|tell|give|share|send|provide|enter|say|type)\s+(me\s+|us\s+)?(the\s+|your\s+)?(otp|one[-\s]time|verification\s+code|passcode|6[-\s]digit)\b', re.I),
        re.compile(r'\b(otp|code)\s+(bhejiye|bataye|batao|share\s+karo|cheppandi)\b', re.I),
        re.compile(r'\botp\s+(received|sent\s+to\s+your\s+phone|on\s+your\s+mobile)\b', re.I),
    ],
    IntentCategory.PASSWORD_RESET: [
        re.compile(r'\b(reset|change|update|give|share)\s+(your\s+|the\s+)?(password|pin|security\s+code)\b', re.I),
        re.compile(r'\bpassword\s+(badalna|reset\s+karna)\b', re.I),
    ],
    IntentCategory.MONEY_TRANSFER_REQUEST: [
        re.compile(r'\b(transfer|send|wire|pay|deposit|move)\s+(\$|rs\.?|inr|money|funds|amount|\d+)\b', re.I),
        re.compile(r'\b(paisa|amount|dabbulu)\s+(transfer\s+karo|bhejo|pampandi)\b', re.I),
        re.compile(r'\b(immediate|emergency)\s+(wire|payment|neft|rtgs|upi|transfer)\b', re.I),
    ],
    IntentCategory.REMOTE_ACCESS_REQUEST: [
        re.compile(r'\b(install|download|open|run)\s+(anydesk|teamviewer|quicksupport|ultraviewer|screen\s+share|remote\s+desktop)\b', re.I),
        re.compile(r'\b(give|allow|grant)\s+(remote\s+access|screen\s+control)\b', re.I),
    ],
    IntentCategory.AUTHENTICATION_BYPASS: [
        re.compile(r'\b(skip|bypass|no\s+need\s+for|don\'t\s+worry\s+about)\s+(the\s+)?(2fa|mfa|verification|manager\s+approval|callback)\b', re.I),
        re.compile(r'\b(i\s+will|i\s+can)\s+(verify|approve)\s+(you|it)\s+(directly|here|manually)\b', re.I),
    ],
    IntentCategory.CARD_INFORMATION_REQUEST: [
        re.compile(r'\b(tell|give|share|read)\s+(your\s+)?(cvv|card\s+number|expiry\s+date|16[-\s]digit)\b', re.I),
    ],
    IntentCategory.ACCOUNT_ACCESS: [
        re.compile(r'\b(access|unblock|unlock|reactivate|verify)\s+(your\s+)?(bank\s+account|profile|account|card)\b', re.I),
    ],
    IntentCategory.CALLBACK_AVOIDANCE: [
        re.compile(r'\b(don\'t|do\s+not|never)\s+(call|contact|reach\s+out\s+to)\s+(the\s+)?(bank|official|branch|manager|police)\b', re.I),
        re.compile(r'\b(stay|remain)\s+(on\s+the\s+line|on\s+this\s+call)\b', re.I),
    ]
}
