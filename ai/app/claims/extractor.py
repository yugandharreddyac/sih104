"""
Caller Authority & Identity Claims Extractor
Extracts institutional and personal claims made by the caller.
"""

import re
from typing import List
from ai.app.core.types import CallerClaim, CallerClaimType


class CallerClaimExtractor:
    def __init__(self):
        self.claim_rules = [
            (re.compile(r'\b(i\s+am|this\s+is)\s+(calling\s+from\s+)?(the\s+|your\s+)?(bank|branch\s+manager|fraud\s+prevention\s+team)\b', re.I), CallerClaimType.BANK_OFFICIAL, "Bank Official / Fraud Prevention", "Financial Institution"),
            (re.compile(r'\b(i\s+am|this\s+is)\s+(an?\s+)?(officer|inspector|from\s+the\s+police|cyber\s+crime\s+branch|cbi|fbi)\b', re.I), CallerClaimType.POLICE_LAW_ENFORCEMENT, "Law Enforcement / Police Officer", "Law Enforcement Agency"),
            (re.compile(r'\b(i\s+am|this\s+is)\s+(from\s+)?(it\s+support|helpdesk|system\s+administrator|tech\s+support)\b', re.I), CallerClaimType.IT_HELPDESK, "IT Helpdesk / System Administrator", "Corporate IT"),
            (re.compile(r'\b(i\s+am|this\s+is)\s+(the\s+)?(ceo|cfo|chief\s+executive|director|managing\s+director)\b', re.I), CallerClaimType.EXECUTIVE_CXO, "Executive CXO / Leadership", "Executive Management"),
            (re.compile(r'\b(i\s+am|this\s+is)\s+(your\s+)?(son|daughter|brother|sister|father|mother|relative)\b', re.I), CallerClaimType.FAMILY_MEMBER, "Family Member", "Personal/Family"),
        ]

    def extract_claims(self, text: str, turn_index: int) -> List[CallerClaim]:
        """
        Extracts structured claims from conversation turn text.
        """
        if not text:
            return []

        claims: List[CallerClaim] = []

        for pattern, claim_type, identity, org in self.claim_rules:
            m = pattern.search(text)
            if m:
                claims.append(CallerClaim(
                    claim_type=claim_type,
                    claimed_identity=identity,
                    organization=org,
                    confidence=0.90,
                    stated_turn_index=turn_index
                ))

        return claims
