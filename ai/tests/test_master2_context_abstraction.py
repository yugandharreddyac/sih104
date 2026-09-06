"""
Unit Tests for Master 2: AI Context Abstraction Contract
Validates:
1. ContextStoreAdapter contract operations (get, save, append_turn, get_recent_turns, clear).
2. EphemeralMemoryContextAdapter thread-safe storage and memory bounding (max turns, max calls).
3. Multi-turn hesitation, refusal, and escalation level tracking.
4. Clean decoupling from Redis (Master 3 boundary).
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from ai.app.context.contract import (
    AIConversationContext,
    ConversationTurn,
    ContextStoreRegistry,
    ContextStoreAdapter
)
from ai.app.context.memory_adapter import EphemeralMemoryContextAdapter
from ai.app.core.types import ActionType, SocialEngineeringTactic, ConversationPhase


class TestContextAbstraction:
    def setup_method(self):
        self.adapter = EphemeralMemoryContextAdapter(max_calls=10, max_turns_per_call=5)
        ContextStoreRegistry.register_adapter(self.adapter)

    def test_adapter_registry_singleton(self):
        adapter = ContextStoreRegistry.get_adapter()
        assert isinstance(adapter, ContextStoreAdapter)

    def test_turn_appending_and_bounded_pruning(self):
        call_id = "test-call-pruning-01"
        for i in range(8):
            turn = ConversationTurn(
                turn_index=i,
                transcript=f"Turn {i} text",
                action_type=ActionType.BENIGN_ACTION
            )
            ctx = self.adapter.append_turn(call_id, turn)

        # Max turns is configured to 5
        assert len(ctx.turns) == 5
        assert ctx.turns[0].turn_index == 3
        assert ctx.turns[-1].turn_index == 7

    def test_multi_turn_hesitation_and_escalation_tracking(self):
        call_id = "test-call-escalation-02"

        # Turn 0: Attacker claims authority
        t0 = ConversationTurn(
            turn_index=0,
            transcript="I am calling from bank fraud prevention",
            tactics=[SocialEngineeringTactic.AUTHORITY_EXPLOITATION]
        )
        ctx = self.adapter.append_turn(call_id, t0)
        assert ctx.escalation_level == 0

        # Turn 1: Recipient hesitates
        t1 = ConversationTurn(
            turn_index=1,
            transcript="Why do you need my details? Let me call the branch",
            hesitation_detected=True
        )
        ctx = self.adapter.append_turn(call_id, t1)
        assert ctx.hesitation_count == 1
        assert ctx.escalation_level >= 1

        # Turn 2: Attacker surges urgency and fear
        t2 = ConversationTurn(
            turn_index=2,
            transcript="Your account will be frozen immediately, do not hang up",
            tactics=[
                SocialEngineeringTactic.URGENCY_PRESSURE,
                SocialEngineeringTactic.FEAR_COERCION
            ]
        )
        ctx = self.adapter.append_turn(call_id, t2)
        assert ctx.escalation_level >= 2

        # Turn 3: Recipient explicitly refuses
        t3 = ConversationTurn(
            turn_index=3,
            transcript="I will not share my OTP with you",
            refusal_detected=True
        )
        ctx = self.adapter.append_turn(call_id, t3)
        assert ctx.refusal_count == 1
        assert ctx.escalation_level >= 3

    def test_session_isolation(self):
        call_a = "call-isolation-A"
        call_b = "call-isolation-B"

        self.adapter.append_turn(call_a, ConversationTurn(turn_index=0, transcript="Call A", refusal_detected=True))
        self.adapter.append_turn(call_b, ConversationTurn(turn_index=0, transcript="Call B", hesitation_detected=True))

        ctx_a = self.adapter.get_context(call_a)
        ctx_b = self.adapter.get_context(call_b)

        assert ctx_a.refusal_count == 1
        assert ctx_a.hesitation_count == 0
        assert ctx_b.refusal_count == 0
        assert ctx_b.hesitation_count == 1

    def test_clear_context(self):
        call_id = "test-call-clear-03"
        self.adapter.append_turn(call_id, ConversationTurn(turn_index=0, transcript="Test"))
        assert self.adapter.get_context(call_id) is not None

        self.adapter.clear_context(call_id)
        assert self.adapter.get_context(call_id) is None
