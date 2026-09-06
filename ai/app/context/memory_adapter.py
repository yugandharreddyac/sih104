"""
Ephemeral In-Memory Context Store Adapter
Provides thread-safe, bounded in-memory conversational context storage for standalone AI service execution.
Implements ContextStoreAdapter so Master 3's Redis adapter can be swapped in transparently.
"""

import threading
from typing import Dict, List, Optional
from datetime import datetime, timezone

from ai.app.context.contract import (
    ContextStoreAdapter,
    AIConversationContext,
    ConversationTurn
)
from ai.app.core.types import SocialEngineeringTactic, ConversationPhase


class EphemeralMemoryContextAdapter(ContextStoreAdapter):
    def __init__(self, max_calls: int = 200, max_turns_per_call: int = 30):
        self.max_calls = max_calls
        self.max_turns_per_call = max_turns_per_call
        self._contexts: Dict[str, AIConversationContext] = {}
        self._lock = threading.Lock()

    def get_context(self, call_id: str) -> Optional[AIConversationContext]:
        with self._lock:
            ctx = self._contexts.get(call_id)
            return ctx.model_copy(deep=True) if ctx else None

    def save_context(self, context: AIConversationContext) -> None:
        with self._lock:
            context.updated_at = datetime.now(timezone.utc).isoformat()
            # Bounded cache eviction if limit exceeded
            if len(self._contexts) >= self.max_calls and context.call_id not in self._contexts:
                # Evict oldest entry
                oldest_id = next(iter(self._contexts))
                del self._contexts[oldest_id]
            self._contexts[context.call_id] = context.model_copy(deep=True)

    def append_turn(self, call_id: str, turn: ConversationTurn) -> AIConversationContext:
        with self._lock:
            ctx = self._contexts.get(call_id)
            if ctx is None:
                ctx = AIConversationContext(call_id=call_id)
                self._contexts[call_id] = ctx

            # Bounded turn window
            ctx.turns.append(turn)
            if len(ctx.turns) > self.max_turns_per_call:
                ctx.turns = ctx.turns[-self.max_turns_per_call:]

            # Update accumulated tactics
            for t in turn.tactics:
                if t not in ctx.active_tactics:
                    ctx.active_tactics.append(t)

            # Update hesitation / refusal counts
            if turn.hesitation_detected:
                ctx.hesitation_count += 1
            if turn.refusal_detected:
                ctx.refusal_count += 1

            # Update action
            if turn.action_type:
                ctx.last_action_requested = turn.action_type

            # Calculate multi-turn escalation level (0 to 5)
            escalation = 0
            if ctx.refusal_count > 0 or ctx.hesitation_count > 0:
                pressure_tactics = {
                    SocialEngineeringTactic.URGENCY_PRESSURE,
                    SocialEngineeringTactic.FEAR_COERCION,
                    SocialEngineeringTactic.AUTHORITY_EXPLOITATION,
                    SocialEngineeringTactic.REFUSAL_ESCALATION,
                    SocialEngineeringTactic.DIGITAL_ARREST_THREAT
                }
                present_pressure = [t for t in ctx.active_tactics if t in pressure_tactics]
                escalation = min(5, len(present_pressure) + (ctx.refusal_count * 2) + ctx.hesitation_count)
            ctx.escalation_level = escalation

            # Update phase evolution
            if turn.action_type and turn.action_type.value != "BENIGN_ACTION":
                ctx.current_phase = ConversationPhase.ACTION_REQUEST
            elif any(t in ctx.active_tactics for t in [
                SocialEngineeringTactic.FEAR_COERCION,
                SocialEngineeringTactic.URGENCY_PRESSURE,
                SocialEngineeringTactic.AUTHORITY_EXPLOITATION
            ]):
                ctx.current_phase = ConversationPhase.VERIFICATION_PHASE

            ctx.updated_at = datetime.now(timezone.utc).isoformat()
            return ctx.model_copy(deep=True)

    def get_recent_turns(self, call_id: str, limit: int = 10) -> List[ConversationTurn]:
        with self._lock:
            ctx = self._contexts.get(call_id)
            if not ctx:
                return []
            return [t.model_copy(deep=True) for t in ctx.turns[-limit:]]

    def clear_context(self, call_id: str) -> None:
        with self._lock:
            self._contexts.pop(call_id, None)
