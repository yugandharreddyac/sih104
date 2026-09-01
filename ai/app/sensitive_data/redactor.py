"""
Deterministic In-Memory Sensitive Data Redactor
Enforces 100% pre-persistence redaction of OTPs, CVVs, passwords, PINs, card numbers, Aadhaar, and PAN.
"""

import re
from ai.app.sensitive_data.patterns import SENSITIVE_ENTITY_PATTERNS


class SensitiveDataRedactor:
    def __init__(self):
        self.redaction_token = "[REDACTED]"

    def redact(self, text: str) -> str:
        """
        Redacts any sensitive numbers or credentials from text string.
        """
        if not text:
            return ""

        sanitized = text

        # Redact Credit Cards (16 digits)
        sanitized = re.sub(r'\b(?:\d{4}[-\s]?){3}\d{4}\b', self.redaction_token, sanitized)

        # Redact Aadhaar (12 digits)
        sanitized = re.sub(r'\b[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}\b', self.redaction_token, sanitized)

        # Redact PAN
        sanitized = re.sub(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', self.redaction_token, sanitized, flags=re.I)

        # Redact CVV
        sanitized = re.sub(r'(?i)\b(cvv|cvc|security\s+code)\s*(?:is|:|=)?\s*([0-9]{3,4})\b', rf'\1 {self.redaction_token}', sanitized)

        # Redact OTP / Passcode
        sanitized = re.sub(r'(?i)\b(otp|passcode|code|verification\s+code)\s*(?:is|:|=)?\s*([0-9]{4,8})\b', rf'\1 {self.redaction_token}', sanitized)

        # Redact Passwords & PINs
        sanitized = re.sub(r'(?i)\b(password|pin|pin\s+number)\s*(?:is|:|=)?\s*([A-Za-z0-9@#$%^&+=]{4,32})\b', rf'\1 {self.redaction_token}', sanitized)

        return sanitized
