"""
Sensitive Data Situation & Entity Detector
Distinguishes between benign mentions, direct requests, reading credentials aloud,
and instructions to disclose. Enforces immediate deterministic redaction.
"""

import re
from typing import List
from ai.app.core.types import (
    SensitiveDataResult,
    SensitiveDataFinding,
    SensitiveDataType,
    SensitiveDataRole,
    RiskSeverity,
    PipelineStatus
)
from ai.app.sensitive_data.redactor import SensitiveDataRedactor


class SensitiveDataDetector:
    def __init__(self):
        self.redactor = SensitiveDataRedactor()

        # Contextual patterns for detecting situational role
        self.negation_patterns = [
            re.compile(r'\b(never|do\s+not|don\'t|will\s+not|won\'t)\s+(ask|share|request|give)\b', re.I),
            re.compile(r'\b(warning|be\s+aware|caution)\b', re.I),
        ]

        self.request_patterns = [
            re.compile(r'\b(tell|give|share|read|send|provide|type|enter)\s+(me|us)?\s*(the|your)?\s*(otp|pin|password|cvv|code)\b', re.I),
            re.compile(r'\b(bhejiye|bataye|share\s+karo|cheppandi)\b', re.I),
        ]

        self.read_aloud_patterns = [
            re.compile(r'\b(my|the)\s+(otp|code|pin|password)\s+is\s+([0-9]{4,8}|[A-Za-z0-9@#$]{4,16})\b', re.I),
            re.compile(r'\b([0-9]{4,8})\b(?=.*\b(?:otp|passcode)\b)', re.I),
        ]

        self.instruction_patterns = [
            re.compile(r'\b(when\s+you\s+receive|as\s+soon\s+as\s+you\s+get)\s+.*(read|tell|give|share)\b', re.I),
            re.compile(r'\b(press|click|approve)\s+(the\s+notification|push\s+prompt|link)\b', re.I),
        ]

    def detect_situations(self, text: str) -> SensitiveDataResult:
        """
        Analyzes dialogue and categorizes sensitive data events into precise situational roles.
        """
        if not text or len(text.strip()) == 0:
            return SensitiveDataResult(
                status=PipelineStatus.AVAILABLE,
                findings=[],
                contains_direct_request=False,
                contains_secret=False,
                redacted_preview="",
                highest_severity=RiskSeverity.LOW
            )

        redacted_preview = self.redactor.redact(text)
        findings: List[SensitiveDataFinding] = []
        highest_severity = RiskSeverity.LOW
        contains_direct_request = False
        contains_secret = "[REDACTED]" in redacted_preview

        # 1. Check for Benign Defensive Mentions (e.g. "We will never ask for your password")
        is_negated = any(p.search(text) for p in self.negation_patterns)

        # Detect specific entities in text
        lower = text.lower()
        entities_present = []
        if "otp" in lower or "one time" in lower or "passcode" in lower or "verification code" in lower:
            entities_present.append(SensitiveDataType.OTP)
        if "password" in lower or "passphrase" in lower:
            entities_present.append(SensitiveDataType.PASSWORD)
        if "pin" in lower:
            entities_present.append(SensitiveDataType.PIN)
        if "cvv" in lower or "cvc" in lower:
            entities_present.append(SensitiveDataType.CVV)
        if "card number" in lower or "credit card" in lower:
            entities_present.append(SensitiveDataType.CREDIT_CARD)
        if "aadhaar" in lower:
            entities_present.append(SensitiveDataType.AADHAAR)
        if "pan" in lower:
            entities_present.append(SensitiveDataType.PAN)

        for entity in entities_present:
            if is_negated:
                findings.append(SensitiveDataFinding(
                    entity_type=entity,
                    role=SensitiveDataRole.BENIGN_MENTION,
                    raw_preview_sanitized=f"Defensive/Educational mention of {entity.value}",
                    confidence=0.90,
                    severity=RiskSeverity.LOW
                ))
            elif any(p.search(text) for p in self.request_patterns):
                contains_direct_request = True
                highest_severity = RiskSeverity.CRITICAL
                findings.append(SensitiveDataFinding(
                    entity_type=entity,
                    role=SensitiveDataRole.DIRECT_REQUEST,
                    raw_preview_sanitized=f"Direct caller solicitation for {entity.value}",
                    confidence=0.95,
                    severity=RiskSeverity.CRITICAL
                ))
            elif any(p.search(text) for p in self.instruction_patterns):
                contains_direct_request = True
                highest_severity = RiskSeverity.HIGH
                findings.append(SensitiveDataFinding(
                    entity_type=entity,
                    role=SensitiveDataRole.INSTRUCTION_TO_DISCLOSE,
                    raw_preview_sanitized=f"Instruction to disclose future {entity.value}",
                    confidence=0.92,
                    severity=RiskSeverity.HIGH
                ))
            elif contains_secret:
                highest_severity = max_severity(highest_severity, RiskSeverity.HIGH)
                findings.append(SensitiveDataFinding(
                    entity_type=entity,
                    role=SensitiveDataRole.READ_ALOUD,
                    raw_preview_sanitized=f"Spoken disclosure containing {entity.value} [REDACTED]",
                    confidence=0.94,
                    severity=RiskSeverity.HIGH
                ))
            else:
                findings.append(SensitiveDataFinding(
                    entity_type=entity,
                    role=SensitiveDataRole.BENIGN_MENTION,
                    raw_preview_sanitized=f"Contextual mention of {entity.value}",
                    confidence=0.75,
                    severity=RiskSeverity.MEDIUM
                ))

        return SensitiveDataResult(
            status=PipelineStatus.AVAILABLE,
            findings=findings,
            contains_direct_request=contains_direct_request,
            contains_secret=contains_secret,
            redacted_preview=redacted_preview,
            highest_severity=highest_severity
        )


def max_severity(s1: RiskSeverity, s2: RiskSeverity) -> RiskSeverity:
    ranks = {RiskSeverity.LOW: 1, RiskSeverity.MEDIUM: 2, RiskSeverity.HIGH: 3, RiskSeverity.CRITICAL: 4}
    return s1 if ranks[s1] >= ranks[s2] else s2
