"""
VOXSHIELD AI Context Abstraction Contract
Defines clean, typed context interfaces for conversational state, turn tracking,
and multi-turn risk progression, fully decoupled from persistence mechanisms (e.g. Redis).
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from ai.app.core.types import (
    LanguageCode,
    IntentCategory,
    SocialEngineeringTactic,
    ActionType,
    ConversationPhase,
    SensitiveDataFinding
)


class ConversationTurn(BaseModel):
    turn_index: int
    speaker_channel: int = 0  # 0: Caller/Inbound, 1: Agent/Callee
    transcript: str = ""
    redacted_transcript: str = ""
    timestamp_ms: int = 0
    intent: Optional[IntentCategory] = None
    tactics: List[SocialEngineeringTactic] = Field(default_factory=list)
    action_type: Optional[ActionType] = None
    action_risk_score: Optional[float] = None
    hesitation_detected: bool = False
    refusal_detected: bool = False
    sensitive_findings: List[SensitiveDataFinding] = Field(default_factory=list)


class AIConversationContext(BaseModel):
    call_id: str
    stream_id: Optional[str] = None
    language_code: LanguageCode = LanguageCode.EN_IN
    turns: List[ConversationTurn] = Field(default_factory=list)
    current_phase: ConversationPhase = ConversationPhase.INQUIRY
    active_tactics: List[SocialEngineeringTactic] = Field(default_factory=list)
    claimed_identities: List[str] = Field(default_factory=list)
    last_action_requested: Optional[ActionType] = None
    hesitation_count: int = 0
    refusal_count: int = 0
    escalation_level: int = 0  # 0 to 5 escalation index
    risk_scores_history: List[float] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ContextStoreAdapter(ABC):
    """
    Abstract Context Store Adapter.
    Decouples AI intelligence layer from concrete persistence backends (e.g., Redis, In-Memory).
    Master 3 infrastructure can register a RedisContextStoreAdapter without modifying AI logic.
    """

    @abstractmethod
    def get_context(self, call_id: str) -> Optional[AIConversationContext]:
        """Retrieves conversational context for a given call."""
        pass

    @abstractmethod
    def save_context(self, context: AIConversationContext) -> None:
        """Persists or updates conversational context."""
        pass

    @abstractmethod
    def append_turn(self, call_id: str, turn: ConversationTurn) -> AIConversationContext:
        """Appends a turn to the call context and returns the updated context."""
        pass

    @abstractmethod
    def get_recent_turns(self, call_id: str, limit: int = 10) -> List[ConversationTurn]:
        """Retrieves the most recent N turns for a call."""
        pass

    @abstractmethod
    def clear_context(self, call_id: str) -> None:
        """Purges conversational context for a terminated call."""
        pass


class ContextStoreRegistry:
    """Registry for active ContextStoreAdapter instance."""
    _instance: Optional[ContextStoreAdapter] = None

    @classmethod
    def register_adapter(cls, adapter: ContextStoreAdapter) -> None:
        cls._instance = adapter

    @classmethod
    def get_adapter(cls) -> ContextStoreAdapter:
        if cls._instance is None:
            from ai.app.context.memory_adapter import EphemeralMemoryContextAdapter
            cls._instance = EphemeralMemoryContextAdapter()
        return cls._instance
