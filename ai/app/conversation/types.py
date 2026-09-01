"""
Conversation Memory & State Specific Types
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from ai.app.core.types import (
    ConversationTurn,
    ConversationPhase,
    IntentCategory,
    SocialEngineeringTactic,
    CallerClaim
)


class ConversationSessionSummary(BaseModel):
    call_id: str
    total_turns: int
    active_phase: ConversationPhase
    detected_intents: List[IntentCategory]
    active_claims: List[CallerClaim]
    social_signals_accumulated: List[SocialEngineeringTactic]
    redacted_dialogue_preview: List[str]
    retention_expires_at: str
