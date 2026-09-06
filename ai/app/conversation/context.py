"""
Conversation Context Engine (Master 2)
Maintains aggregated multi-turn context, caller claims, detected intents,
recipient resistance tracking, and conversation phase transitions.
Synchronizes with the pluggable AI ContextStoreAdapter.
"""

from typing import Dict, List, Optional
from ai.app.core.types import (
    ConversationTurn,
    ConversationPhase,
    IntentCategory,
    SocialEngineeringTactic,
    CallerClaim,
    SensitiveDataFinding,
    ActionType
)
from ai.app.conversation.memory import ConversationMemoryManager
from ai.app.conversation.state import ConversationPhaseStateMachine
from ai.app.conversation.resistance import ResistanceDetector
from ai.app.context.contract import ContextStoreRegistry, ConversationTurn as AbstractTurn


class ConversationContextEngine:
    def __init__(self):
        self.state_machine = ConversationPhaseStateMachine()
        self.resistance_detector = ResistanceDetector()

    def process_turn(
        self,
        call_id: str,
        turn_index: int,
        speaker_channel: int,
        transcript: str,
        redacted_transcript: str,
        timestamp_ms: int,
        intent: Optional[IntentCategory],
        tactics: List[SocialEngineeringTactic],
        sensitive_findings: List[SensitiveDataFinding],
        requested_action_type: str = "BENIGN_ACTION",
        action_risk_score: Optional[float] = None
    ) -> ConversationPhase:
        """
        Records turn in bounded memory and computes current conversation phase.
        Tracks recipient hesitation / refusal and synchronizes with ContextStoreAdapter.
        """
        # 1. Evaluate resistance
        hesitation, refusal, _ = self.resistance_detector.evaluate_resistance(transcript)

        # 2. Local memory buffer
        memory = ConversationMemoryManager.get_or_create(call_id)
        turn = ConversationTurn(
            turn_index=turn_index,
            speaker_channel=speaker_channel,
            transcript=transcript,
            redacted_transcript=redacted_transcript,
            timestamp_ms=timestamp_ms,
            intent=intent,
            tactics=tactics,
            sensitive_findings=sensitive_findings
        )
        memory.add_turn(turn)

        # 3. Synchronize with AI ContextStoreAdapter
        act_enum = None
        try:
            act_enum = ActionType(requested_action_type)
        except ValueError:
            pass

        abstract_turn = AbstractTurn(
            turn_index=turn_index,
            speaker_channel=speaker_channel,
            transcript=transcript,
            redacted_transcript=redacted_transcript,
            timestamp_ms=timestamp_ms,
            intent=intent,
            tactics=tactics,
            action_type=act_enum,
            action_risk_score=action_risk_score,
            hesitation_detected=hesitation,
            refusal_detected=refusal,
            sensitive_findings=sensitive_findings
        )
        store = ContextStoreRegistry.get_adapter()
        store.append_turn(call_id, abstract_turn)

        # 4. Evaluate phase
        intents_list = [intent] if intent else []
        current_phase = self.state_machine.evaluate_phase(
            turn_index=turn_index,
            intents=intents_list,
            tactics=tactics,
            requested_action_type=requested_action_type
        )
        return current_phase
