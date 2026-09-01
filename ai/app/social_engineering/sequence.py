"""
Multi-Turn Social Engineering Attack Sequence State Machine
Tracks conversational escalation across multiple turns and calculates sequential risk multipliers.
Progression: AUTHORITY -> FEAR/URGENCY -> BYPASS -> SECRET HARVESTING -> CRITICAL ACTION.
"""

from typing import List, Tuple
from ai.app.core.types import (
    AttackProgressionState,
    SocialEngineeringTactic,
    IntentCategory
)


class MultiTurnAttackSequenceTracker:
    def __init__(self):
        # Weights for sequential steps
        self.stage_weights = {
            SocialEngineeringTactic.AUTHORITY_EXPLOITATION: 0.20,
            SocialEngineeringTactic.FEAR_COERCION: 0.25,
            SocialEngineeringTactic.URGENCY_PRESSURE: 0.20,
            SocialEngineeringTactic.SECRECY_DEMAND: 0.15,
            SocialEngineeringTactic.ISOLATION_ATTEMPT: 0.15,
            SocialEngineeringTactic.VERIFICATION_BYPASS: 0.35,
            SocialEngineeringTactic.FINANCIAL_PRESSURE: 0.30,
        }

    def evaluate_sequence(
        self,
        accumulated_tactics: List[SocialEngineeringTactic],
        current_intent: IntentCategory,
        contains_secret_request: bool
    ) -> Tuple[AttackProgressionState, float, List[str]]:
        """
        Evaluates conversational attack progression stage and composite sequence risk score [0.0 - 1.0].
        """
        unique_tactics = set(accumulated_tactics)
        explainability: List[str] = []

        # Calculate base score from unique tactics
        score_sum = sum(self.stage_weights.get(t, 0.10) for t in unique_tactics)
        sequence_score = min(1.0, score_sum)

        has_authority = SocialEngineeringTactic.AUTHORITY_EXPLOITATION in unique_tactics
        has_fear = SocialEngineeringTactic.FEAR_COERCION in unique_tactics
        has_urgency = SocialEngineeringTactic.URGENCY_PRESSURE in unique_tactics
        has_bypass = SocialEngineeringTactic.VERIFICATION_BYPASS in unique_tactics

        # 1. Critical Action Exploitation (e.g. Wire transfer + Urgency)
        if current_intent in [IntentCategory.MONEY_TRANSFER_REQUEST, IntentCategory.REMOTE_ACCESS_REQUEST] and (has_urgency or has_fear):
            state = AttackProgressionState.CRITICAL_ACTION_EXPLOITATION
            sequence_score = max(0.92, sequence_score)
            explainability.append("Critical action exploitation phase: High-risk financial or remote access action demanded under pressure.")

        # 2. Secret Harvesting Attempted (OTP / Credential Request + Authority / Fear)
        elif contains_secret_request or current_intent in [IntentCategory.OTP_REQUEST, IntentCategory.PASSWORD_RESET, IntentCategory.CARD_INFORMATION_REQUEST]:
            state = AttackProgressionState.SECRET_HARVESTING_ATTEMPTED
            sequence_score = max(0.88, sequence_score)
            explainability.append("Secret harvesting phase: Direct solicitation of confidential credentials/OTPs following psychological conditioning.")

        # 3. Authentication Bypass Attempted
        elif has_bypass:
            state = AttackProgressionState.AUTHENTICATION_BYPASS_ATTEMPTED
            sequence_score = max(0.75, sequence_score)
            explainability.append("Authentication bypass phase: Caller explicitly discouraged out-of-band verification.")

        # 4. Fear & Urgency Induced
        elif has_fear or has_urgency:
            state = AttackProgressionState.FEAR_URGENCY_INDUCED
            sequence_score = max(0.60, sequence_score)
            explainability.append("Psychological manipulation phase: Caller established urgency or fear to impair rational evaluation.")

        # 5. Authority Established
        elif has_authority:
            state = AttackProgressionState.AUTHORITY_ESTABLISHED
            sequence_score = max(0.40, sequence_score)
            explainability.append("Pretexting phase: Caller established claimed institutional authority.")

        else:
            state = AttackProgressionState.BENIGN_CONVERSATION
            sequence_score = min(0.15, sequence_score)
            explainability.append("No structured multi-turn attack sequence detected.")

        return state, round(sequence_score, 3), explainability
