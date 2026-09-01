"""
Requested Action Analysis & Extractor
Extracts what the caller is actively instructing or requesting the victim to DO.
"""

import re
from typing import Tuple
from ai.app.core.types import ActionType, RequestedActionResult
from ai.app.sensitive_data.redactor import SensitiveDataRedactor


class RequestedActionExtractor:
    def __init__(self):
        self.redactor = SensitiveDataRedactor()
        self.action_rules = [
            (re.compile(r'\b(read|tell|give|share|send|enter)\s+(me\s+|us\s+)?(the\s+|your\s+)?(otp|code|pin|password|cvv)\b', re.I), ActionType.DISCLOSE_CREDENTIAL, "Disclose authentication credential / OTP", True),
            (re.compile(r'\b(transfer|send|wire|pay)\s+(\$|rs\.?|money|funds|\d+)\b', re.I), ActionType.TRANSFER_FUNDS, "Transfer financial funds", True),
            (re.compile(r'\b(approve|confirm|click|press)\s+(the\s+)?(transaction|wire|payment|push\s+prompt)\b', re.I), ActionType.APPROVE_TRANSACTION, "Approve financial transaction or push prompt", True),
            (re.compile(r'\b(install|download|run)\s+(anydesk|teamviewer|quicksupport|software|app)\b', re.I), ActionType.INSTALL_REMOTE_SOFTWARE, "Install remote desktop / access software", True),
            (re.compile(r'\b(share|show)\s+(your\s+)?(screen|desktop)\b', re.I), ActionType.SHARE_SCREEN, "Share device screen", True),
            (re.compile(r'\b(change|update|add)\s+(the\s+)?(beneficiary|account\s+details|iban|routing)\b', re.I), ActionType.CHANGE_BENEFICIARY, "Change payment beneficiary", True),
            (re.compile(r'\b(bypass|skip|ignore)\s+(the\s+)?(policy|approval|verification)\b', re.I), ActionType.BYPASS_POLICY, "Bypass organizational security policy", True),
        ]

    def extract_action(self, text: str) -> RequestedActionResult:
        """
        Extracts requested action from dialogue turn.
        """
        if not text:
            return RequestedActionResult(
                action_type=ActionType.BENIGN_ACTION,
                target_object="None",
                is_high_risk=False,
                confidence=0.50,
                raw_action_text_redacted=""
            )

        redacted_text = self.redactor.redact(text)

        for pattern, action_type, desc, is_high_risk in self.action_rules:
            m = pattern.search(text)
            if m:
                return RequestedActionResult(
                    action_type=action_type,
                    target_object=desc,
                    is_high_risk=is_high_risk,
                    confidence=0.92,
                    raw_action_text_redacted=self.redactor.redact(m.group(0))
                )

        return RequestedActionResult(
            action_type=ActionType.BENIGN_ACTION,
            target_object="Standard conversational discussion",
            is_high_risk=False,
            confidence=0.85,
            raw_action_text_redacted=redacted_text[:60]
        )
