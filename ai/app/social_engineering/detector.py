"""
Social Engineering & Psychological Manipulation Detector Orchestrator
Extracts tactical indicators and evaluates multi-turn attack sequence state machines.
"""

from typing import List
from ai.app.core.types import (
    SocialEngineeringResult,
    SocialEngineeringTactic,
    IntentCategory,
    PipelineStatus
)
from ai.app.core.model_registry import ModelRegistry
from ai.app.social_engineering.tactics import SocialEngineeringTacticsExtractor
from ai.app.social_engineering.sequence import MultiTurnAttackSequenceTracker


class SocialEngineeringDetector:
    def __init__(self):
        self.model_version = "social_eng_multi_turn_v4"
        self.tactics_extractor = SocialEngineeringTacticsExtractor()
        self.sequence_tracker = MultiTurnAttackSequenceTracker()

        model_meta = ModelRegistry.get_model(self.model_version)
        self.status = model_meta.status if model_meta else PipelineStatus.AVAILABLE

    def analyze_tactics(
        self,
        text_transcript: str,
        current_intent: IntentCategory = IntentCategory.BENIGN_INQUIRY,
        accumulated_tactics: List[SocialEngineeringTactic] = None,
        contains_secret_request: bool = False,
        asr_confidence: float = 1.0
    ) -> SocialEngineeringResult:
        """
        Analyzes conversation for social engineering tactics and multi-turn escalation.
        """
        if self.status != PipelineStatus.AVAILABLE:
            return SocialEngineeringResult(
                status=PipelineStatus.MODEL_UNAVAILABLE,
                model_version=self.model_version,
                tactics_detected=[],
                explainability=["Social engineering NLP engine is UNAVAILABLE in registry."]
            )

        # 1. Extract Turn Tactics
        turn_tactics, turn_evidence = self.tactics_extractor.extract_tactics(text_transcript)

        # 2. Combine with previous turn tactics
        all_tactics = list(set((accumulated_tactics or []) + turn_tactics))

        # 3. Evaluate Multi-Turn Sequence
        progression_state, sequence_score, seq_explainability = self.sequence_tracker.evaluate_sequence(
            accumulated_tactics=all_tactics,
            current_intent=current_intent,
            contains_secret_request=contains_secret_request
        )

        calibrated_score = round(sequence_score * asr_confidence, 3)
        calibrated_conf = round(min(0.95, 0.50 + calibrated_score * 0.45) * asr_confidence, 3)

        explainability = turn_evidence + seq_explainability

        return SocialEngineeringResult(
            status=PipelineStatus.AVAILABLE,
            model_version=self.model_version,
            tactics_detected=all_tactics,
            progression_state=progression_state,
            attack_sequence_score=calibrated_score,
            urgency_detected=SocialEngineeringTactic.URGENCY_PRESSURE in all_tactics,
            authority_pressure=SocialEngineeringTactic.AUTHORITY_EXPLOITATION in all_tactics,
            secrecy_demanded=SocialEngineeringTactic.SECRECY_DEMAND in all_tactics,
            fear_coercion_detected=SocialEngineeringTactic.FEAR_COERCION in all_tactics,
            verification_bypass_detected=SocialEngineeringTactic.VERIFICATION_BYPASS in all_tactics,
            confidence=calibrated_conf,
            explainability=explainability
        )
