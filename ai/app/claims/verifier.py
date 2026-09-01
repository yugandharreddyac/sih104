"""
Multi-Turn Claim Inconsistency & Contradiction Verifier
Detects conflicting identity claims or contradictory statements across conversational turns.
"""

from typing import List
from ai.app.core.types import CallerClaim, CallerClaimType


class ConversationInconsistencyVerifier:
    def verify_inconsistencies(
        self,
        claims: List[CallerClaim],
        all_turns_text: str
    ) -> List[str]:
        """
        Evaluates claims and turn transcripts for mutual contradictions.
        """
        inconsistencies: List[str] = []

        # 1. Conflicting Identity Claims across turns
        unique_claim_types = set(c.claim_type for c in claims)
        if len(unique_claim_types) > 1:
            types_str = " and ".join([c.value for c in unique_claim_types])
            inconsistencies.append(f"Contradictory caller identity claims across turns: Stated {types_str}.")

        # 2. Reversal on Secret Solicitation (e.g. "I will not ask for OTP" -> "Give me your OTP")
        lower_text = all_turns_text.lower()
        if ("never ask" in lower_text or "don't need your otp" in lower_text) and ("tell me the otp" in lower_text or "give me your otp" in lower_text or "read the code" in lower_text):
            inconsistencies.append("Severe behavioral contradiction: Caller stated they would not request an OTP, but later solicited the OTP directly.")

        return inconsistencies
