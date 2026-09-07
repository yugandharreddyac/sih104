"""
Regression Test Suite for Credential Theft Detection and Multi-Action Isolation
Proves:
1. "Please tell me your OTP." -> DISCLOSE_CREDENTIAL -> credential_theft -> POL-CRED-001
2. Dialogue turn persistence across silent/continuation chunks
3. Financial fraud: "Transfer fifty thousand rupees to this new beneficiary immediately."
4. Account takeover: "Install remote access software and share your screen."
5. Verification bypass: "Skip verification and approve the transaction."
"""

import pytest
from ai.app.core.types import AudioChunkPayload, ActionType, PolicyAction
from ai.app.action.extractor import RequestedActionExtractor
from ai.app.audio.stream_pipeline import AudioStreamPipeline
from ai.app.fusion.engine import MultiModalRiskFusionEngine
from ai.app.conversation.memory import ConversationMemoryManager


@pytest.fixture
def pipeline():
    return AudioStreamPipeline()


@pytest.fixture
def fusion_engine():
    return MultiModalRiskFusionEngine()


@pytest.fixture
def action_extractor():
    return RequestedActionExtractor()


def test_action_extractor_otp_phrase(action_extractor):
    res = action_extractor.extract_action("Please tell me your OTP.")
    assert res.action_type == ActionType.DISCLOSE_CREDENTIAL
    assert res.is_high_risk is True
    assert res.confidence >= 0.90
    assert "OTP" in res.raw_action_text_redacted or "tell me your" in res.raw_action_text_redacted


def test_credential_theft_end_to_end_fusion(pipeline, fusion_engine):
    call_id = "test-cred-e2e-01"
    ConversationMemoryManager.remove(call_id)

    chunk = AudioChunkPayload(
        call_id=call_id,
        stream_id="stream-01",
        chunk_index=0,
        sample_rate=16000,
        channels=1,
        audio_base64="",
        text_transcript="Please tell me your OTP."
    )

    conv_res = pipeline.process_conversational_intelligence(chunk)
    assert conv_res.requested_action.action_type == ActionType.DISCLOSE_CREDENTIAL

    risk_res = fusion_engine.evaluate_risk(
        call_id=call_id,
        conversational=conv_res,
        stream_id="stream-01",
        turn_index=0
    )

    # 10D tensor must have credential_theft > 0
    assert risk_res.dimensions.credential_theft is not None
    assert risk_res.dimensions.credential_theft >= 70.0

    # Policy recommendation must be POL-CRED-001
    assert risk_res.policy_recommendation is not None
    assert risk_res.policy_recommendation.is_triggered is True
    assert risk_res.policy_recommendation.policy_id == "POL-CRED-001"
    assert risk_res.policy_recommendation.recommended_action == PolicyAction.REQUIRE_STEP_UP_VERIFICATION


def test_credential_theft_dialogue_turn_persistence(pipeline, fusion_engine):
    call_id = "test-cred-persist-02"
    ConversationMemoryManager.remove(call_id)

    # Turn 0: Operator speaks OTP request
    chunk0 = AudioChunkPayload(
        call_id=call_id,
        stream_id="stream-02",
        chunk_index=0,
        sample_rate=16000,
        channels=1,
        audio_base64="",
        text_transcript="Please tell me your OTP."
    )
    conv0 = pipeline.process_conversational_intelligence(chunk0)
    risk0 = fusion_engine.evaluate_risk(call_id=call_id, conversational=conv0, turn_index=0)
    assert risk0.dimensions.credential_theft >= 70.0

    # Turn 1: 250ms later, continuous chunk without new text
    chunk1 = AudioChunkPayload(
        call_id=call_id,
        stream_id="stream-02",
        chunk_index=1,
        sample_rate=16000,
        channels=1,
        audio_base64="",
        text_transcript=""
    )
    conv1 = pipeline.process_conversational_intelligence(chunk1)
    risk1 = fusion_engine.evaluate_risk(call_id=call_id, conversational=conv1, turn_index=1)

    # Must retain credential_theft threat findings from session memory
    assert risk1.dimensions.credential_theft is not None
    assert risk1.dimensions.credential_theft >= 70.0
    assert risk1.policy_recommendation is not None
    assert risk1.policy_recommendation.policy_id == "POL-CRED-001"


def test_financial_fraud_end_to_end(pipeline, fusion_engine):
    call_id = "test-fin-01"
    ConversationMemoryManager.remove(call_id)

    chunk = AudioChunkPayload(
        call_id=call_id,
        stream_id="stream-fin",
        chunk_index=0,
        sample_rate=16000,
        channels=1,
        audio_base64="",
        text_transcript="Transfer fifty thousand rupees to this new beneficiary immediately."
    )
    conv = pipeline.process_conversational_intelligence(chunk)
    assert conv.requested_action.action_type == ActionType.TRANSFER_FUNDS

    risk = fusion_engine.evaluate_risk(call_id=call_id, conversational=conv)
    assert risk.dimensions.financial_fraud is not None
    assert risk.dimensions.financial_fraud >= 70.0
    assert risk.policy_recommendation is not None
    assert risk.policy_recommendation.policy_id == "POL-FIN-002"


def test_account_takeover_end_to_end(pipeline, fusion_engine):
    call_id = "test-ato-01"
    ConversationMemoryManager.remove(call_id)

    chunk = AudioChunkPayload(
        call_id=call_id,
        stream_id="stream-ato",
        chunk_index=0,
        sample_rate=16000,
        channels=1,
        audio_base64="",
        text_transcript="Install remote access software and share your screen."
    )
    conv = pipeline.process_conversational_intelligence(chunk)
    assert conv.requested_action.action_type == ActionType.INSTALL_REMOTE_SOFTWARE

    risk = fusion_engine.evaluate_risk(call_id=call_id, conversational=conv)
    assert risk.dimensions.account_takeover is not None
    assert risk.dimensions.account_takeover >= 70.0


def test_verification_bypass_end_to_end(pipeline, fusion_engine):
    call_id = "test-byp-01"
    ConversationMemoryManager.remove(call_id)

    chunk = AudioChunkPayload(
        call_id=call_id,
        stream_id="stream-byp",
        chunk_index=0,
        sample_rate=16000,
        channels=1,
        audio_base64="",
        text_transcript="Skip verification and approve the transaction."
    )
    conv = pipeline.process_conversational_intelligence(chunk)
    assert conv.requested_action.action_type == ActionType.BYPASS_POLICY

    risk = fusion_engine.evaluate_risk(call_id=call_id, conversational=conv)
    assert risk.dimensions.verification_bypass is not None
    assert risk.dimensions.verification_bypass >= 60.0
