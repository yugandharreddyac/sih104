"""
Conversation Context Engine
Maintains aggregated multi-turn context, caller claims, detected intents, and conversational state.
"""

from typing import Dict, List, Optional
from ai.app.core.types import (
    ConversationTurn,
    ConversationPhase,
    IntentCategory,
    SocialEngineeringTactic,
    CallerClaim,
    SensitiveDataFinding
)
from ai.app.conversation.memory import ConversationMemoryManager
from ai.app.conversation.state import ConversationPhaseStateMachine


class ConversationContextEngine:
    def __init__(self):
        self.state_machine = ConversationPhaseStateMachine()

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
        requested_action_type: str = "BENIGN_ACTION"
    ) -> ConversationPhase:
        """
        Records turn in bounded memory and computes current conversation phase.
        """
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

        intents_list = [intent] if intent else []
        current_phase = self.state_machine.evaluate_phase(
            turn_index=turn_index,
            intents=intents_list,
            tactics=tactics,
            requested_action_type=requested_action_type
        )
        return current_phase
