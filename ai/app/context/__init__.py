"""
VOXSHIELD AI Context Abstraction Package
Exposes typed context contracts and adapter interfaces for conversational state tracking.
"""

from ai.app.context.contract import (
    ConversationTurn,
    AIConversationContext,
    ContextStoreAdapter,
    ContextStoreRegistry
)
from ai.app.context.memory_adapter import EphemeralMemoryContextAdapter

__all__ = [
    "ConversationTurn",
    "AIConversationContext",
    "ContextStoreAdapter",
    "ContextStoreRegistry",
    "EphemeralMemoryContextAdapter"
]
