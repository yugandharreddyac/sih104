"""
Requested Action Analysis & Quantitative Extractor (Master 2)
Extracts fine-grained dangerous requested actions across English and Indic languages,
and scores them via the ActionRiskScorer.
"""

import re
from typing import Tuple, List, Optional
from ai.app.core.types import (
    ActionType,
    RequestedActionResult,
    SocialEngineeringTactic
)
from ai.app.sensitive_data.redactor import SensitiveDataRedactor
from ai.app.action_risk.scorer import ActionRiskScorer
from ai.app.context.contract import AIConversationContext


class RequestedActionExtractor:
    def __init__(self):
        self.redactor = SensitiveDataRedactor()
        self.scorer = ActionRiskScorer()

        # Action detection rules with regex patterns, ActionType, and description
        self.action_rules = [
            # 1. Remote software installation (AnyDesk, TeamViewer, APKs)
            (
                re.compile(
                    r'\b(install|download|run|karo|cheyyi|pannunga|maadi|pathva|korun)\s+'
                    r'.*(anydesk|teamviewer|quicksupport|rustdesk|airdroid|\.apk|support\s+app)\b',
                    re.I
                ),
                ActionType.INSTALL_REMOTE_SOFTWARE,
                "Install remote desktop / access software",
                True
            ),
            (
                re.compile(
                    r'\b(anydesk|teamviewer|quicksupport|rustdesk)\b',
                    re.I
                ),
                ActionType.INSTALL_REMOTE_SOFTWARE,
                "Remote access utility solicitation",
                True
            ),
            (
                re.compile(
                    r'\b(download|install)\s+.*(apk|app\s+from\s+link|custom\s+app|kyc\s+app)\b',
                    re.I
                ),
                ActionType.DOWNLOAD_MALICIOUS_APP,
                "Download unverified APK or third-party application",
                True
            ),

            # 2. Screen sharing
            (
                re.compile(
                    r'\b(share|show|start)\s+(your\s+)?(screen|desktop|display)\b|'
                    r'\bscreen\s+(share\s+(karo|cheyyandi|pannunga|maadi|kara|korun)|sharing)\b',
                    re.I
                ),
                ActionType.SHARE_SCREEN,
                "Live device screen sharing request",
                True
            ),

            # 3. OTP Disclosures
            (
                re.compile(
                    r'\b(read|tell|give|share|send|enter|batao|cheppandi|sollu|heli|parayu|sanga|bolun)\s+'
                    r'(me\s+|us\s+)?(the\s+|your\s+)?.*(otp|one[-\s]time\s+passcode|sms\s+code|verification\s+code)\b|'
                    r'\b(otp|code)\s+(bhejiye|bataye|batao|cheppandi|sollunga|kodunga|sanga|bolun|parayu|heli|kodi)\b',
                    re.I
                ),
                ActionType.DISCLOSE_OTP,
                "Disclose authentication OTP / SMS verification code",
                True
            ),

            # 4. PIN Disclosures
            (
                re.compile(
                    r'\b(tell|give|share|enter|type|enter\s+cheyandi|dalo|podunga|haaki|taka|din)\s+'
                    r'.*(upi\s+pin|atm\s+pin|security\s+pin|mpin|secret\s+pin)\b',
                    re.I
                ),
                ActionType.DISCLOSE_PIN,
                "Disclose secret ATM / UPI / Security PIN",
                True
            ),

            # 5. Password Disclosures
            (
                re.compile(
                    r'\b(tell|give|share|enter)\s+(me\s+|us\s+)?(the\s+|your\s+)?(password|netbanking\s+password|login\s+pass)\b',
                    re.I
                ),
                ActionType.DISCLOSE_PASSWORD,
                "Disclose account login password / passphrase",
                True
            ),

            # 6. Payment Card Info
            (
                re.compile(
                    r'\b(read|tell|give|share)\s+.*(cvv|cvc|card\s+number|expiry\s+date|16[-\s]digit)\b',
                    re.I
                ),
                ActionType.DISCLOSE_CARD_INFO,
                "Disclose payment card number or CVV",
                True
            ),

            # 7. Generic Credential Disclosure
            (
                re.compile(
                    r'\b(read|tell|give|share|send|enter)\s+(me\s+|us\s+)?(the\s+|your\s+)?(credentials?|login\s+details|passcode)\b',
                    re.I
                ),
                ActionType.DISCLOSE_CREDENTIAL,
                "Disclose sensitive authentication credential",
                True
            ),

            # 8. UPI Payments / QR Scans
            (
                re.compile(
                    r'\b(scan\s+(the\s+)?qr|upi\s+payment|gpay|phonepe|paytm\s+(pe\s+bhejo|transfer))\b|'
                    r'\b(pay|transfer)\s+via\s+upi\b',
                    re.I
                ),
                ActionType.UPI_PAYMENT,
                "Execute UPI payment or scan dynamic QR code",
                True
            ),

            # 9. Direct Fund / Wire Transfers (Multilingual: paise bhejo, dabbulu pampandi, panam anupunga, duddu transfer)
            (
                re.compile(
                    r'\b(transfer|send|wire|pay)\s+(\$|rs\.?|inr|money|funds|\d+)\b|'
                    r'\b(paisa|paise|rupaye|dabbulu|panam|duddu|taka)\s+(bhejo|transfer|bhejiye|pampandi|anupunga|kodi|pathan|pathva)\b',
                    re.I
                ),
                ActionType.TRANSFER_FUNDS,
                "Transfer financial funds / immediate wire dispatch",
                True
            ),

            # 10. Approve Transaction / Push Prompt
            (
                re.compile(
                    r'\b(approve|confirm|click|press)\s+(the\s+)?(transaction|wire|payment|push\s+prompt|notification)\b',
                    re.I
                ),
                ActionType.APPROVE_TRANSACTION,
                "Approve financial transaction or push prompt",
                True
            ),

            # 11. Beneficiary Modifications
            (
                re.compile(
                    r'\b(change|update)\s+(the\s+)?(beneficiary|iban|routing\s+number|payee)\b',
                    re.I
                ),
                ActionType.CHANGE_BENEFICIARY,
                "Change payment beneficiary account",
                True
            ),
            (
                re.compile(
                    r'\b(add|register)\s+(new\s+)?(beneficiary|payee|account)\b',
                    re.I
                ),
                ActionType.BENEFICIARY_ADDITION,
                "Add unverified new beneficiary to banking portal",
                True
            ),

            # 12. Security Settings / Account Recovery
            (
                re.compile(
                    r'\b(reset|change|update)\s+.*(phone\s+number|sim\s+swap|security\s+questions|2fa|mfa)\b',
                    re.I
                ),
                ActionType.CHANGE_SECURITY_SETTINGS,
                "Modify core security authentication settings",
                True
            ),

            # 13. Policy Bypass
            (
                re.compile(
                    r'\b(bypass|skip|ignore)\s+(the\s+)?(policy|approval|verification|security\s+check)\b',
                    re.I
                ),
                ActionType.BYPASS_POLICY,
                "Bypass organizational security policy",
                True
            ),
        ]

    def extract_action(
        self,
        text: str,
        tactics: Optional[List[SocialEngineeringTactic]] = None,
        context: Optional[AIConversationContext] = None,
        recipient_hesitated: bool = False
    ) -> RequestedActionResult:
        """
        Extracts requested action from dialogue turn and computes quantitative action risk.
        """
        if not text:
            benign_eval = self.scorer.evaluate_action(
                action_type=ActionType.BENIGN_ACTION,
                text=""
            )
            return RequestedActionResult(
                action_type=ActionType.BENIGN_ACTION,
                target_object="None",
                is_high_risk=False,
                confidence=0.50,
                raw_action_text_redacted="",
                action_risk=benign_eval
            )

        redacted_text = self.redactor.redact(text)

        for pattern, action_type, desc, is_high_risk in self.action_rules:
            m = pattern.search(text)
            if m:
                matched_snippet = self.redactor.redact(m.group(0))
                eval_res = self.scorer.evaluate_action(
                    action_type=action_type,
                    text=text,
                    tactics=tactics,
                    context=context,
                    recipient_hesitated=recipient_hesitated
                )
                return RequestedActionResult(
                    action_type=action_type,
                    target_object=desc,
                    is_high_risk=is_high_risk,
                    confidence=0.92,
                    raw_action_text_redacted=matched_snippet,
                    action_risk=eval_res
                )

        benign_eval = self.scorer.evaluate_action(
            action_type=ActionType.BENIGN_ACTION,
            text=text,
            tactics=tactics,
            context=context,
            recipient_hesitated=recipient_hesitated
        )

        return RequestedActionResult(
            action_type=ActionType.BENIGN_ACTION,
            target_object="Standard conversational discussion",
            is_high_risk=False,
            confidence=0.85,
            raw_action_text_redacted=redacted_text[:60],
            action_risk=benign_eval
        )
