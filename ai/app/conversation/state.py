"""
Conversation Phase State Machine
Tracks conversational progression phases from greeting to critical action execution.
"""

from ai.app.core.types import ConversationPhase, IntentCategory, SocialEngineeringTactic


class ConversationPhaseStateMachine:
    def evaluate_phase(
        self,
        turn_index: int,
        intents: list,
        tactics: list,
        requested_action_type: str
    ) -> ConversationPhase:
        """
        Determines current conversation phase from turn context and active intents.
        """
        # Critical action phase
        if requested_action_type in ["DISCLOSE_CREDENTIAL", "TRANSFER_FUNDS", "INSTALL_REMOTE_SOFTWARE"]:
            return ConversationPhase.ACTION_REQUEST

        # Verification phase
        if any(i in [IntentCategory.IDENTITY_VERIFICATION, IntentCategory.AUTHENTICATION_BYPASS, IntentCategory.OTP_REQUEST] for i in intents):
            return ConversationPhase.VERIFICATION_PHASE

        # Early conversation phases
        if turn_index <= 1:
            if any(t == SocialEngineeringTactic.AUTHORITY_EXPLOITATION for t in tactics):
                return ConversationPhase.IDENTITY_ESTABLISHMENT
            return ConversationPhase.GREETING
        elif turn_index <= 3:
            return ConversationPhase.IDENTITY_ESTABLISHMENT

        return ConversationPhase.INQUIRY
