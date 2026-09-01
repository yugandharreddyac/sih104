"""
Bounded Conversation Memory & Turn History
Maintains rolling conversation turn buffer (max 20 turns) to prevent memory unbounded growth.
Enforces privacy-preserving in-memory ephemeral retention.
"""

from collections import deque
from typing import Dict, List, Optional
from ai.app.core.types import ConversationTurn


class CallConversationMemory:
    def __init__(self, call_id: str, max_turns: int = 20):
        self.call_id = call_id
        self.max_turns = max_turns
        self.turns: deque = deque(maxlen=max_turns)
        self.turn_counter = 0

    def add_turn(self, turn: ConversationTurn) -> ConversationTurn:
        self.turn_counter += 1
        self.turns.append(turn)
        return turn

    def get_recent_turns(self, count: int = 10) -> List[ConversationTurn]:
        turn_list = list(self.turns)
        return turn_list[-count:] if len(turn_list) > count else turn_list

    def get_full_transcript_text(self, redacted: bool = True) -> str:
        if redacted:
            return " ".join([t.redacted_transcript for t in self.turns if t.redacted_transcript])
        return " ".join([t.transcript for t in self.turns if t.transcript])

    def clear(self):
        self.turns.clear()


class ConversationMemoryManager:
    _sessions: Dict[str, CallConversationMemory] = {}

    @classmethod
    def get_or_create(cls, call_id: str) -> CallConversationMemory:
        if call_id not in cls._sessions:
            cls._sessions[call_id] = CallConversationMemory(call_id)
        return cls._sessions[call_id]

    @classmethod
    def get(cls, call_id: str) -> Optional[CallConversationMemory]:
        return cls._sessions.get(call_id)

    @classmethod
    def remove(cls, call_id: str):
        if call_id in cls._sessions:
            cls._sessions[call_id].clear()
            del cls._sessions[call_id]
