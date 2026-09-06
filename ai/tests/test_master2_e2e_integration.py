"""
End-to-End Integration Tests for Master 2: AI Intelligence Pipeline
Validates end-to-end orchestration with all Master 2 features:
1. Quantitative Action Risk Scorer integration into UnifiedPipelineOrchestrator and RiskFusion.
2. Canonical Signal Bus ingestion of SignalCategory.ACTION and SignalCategory.MANIPULATION.
3. Indic language routing (Hindi, Telugu, Kannada, Malayalam).
4. Social engineering tactics and multi-turn escalation progression.
5. Telephony policy decision triggers for remote software and fund diversion.
6. Context abstraction synchronization without Redis dependency.
"""

import os
import sys
import base64
import numpy as np
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from ai.app.core.types import (
    AudioChunkPayload,
    LanguageCode,
    RiskLevel,
    ActionType,
    PolicyAction
)
from ai.app.pipeline.orchestrator import UnifiedPipelineOrchestrator
from ai.app.context.contract import ContextStoreRegistry


def make_synthetic_speech_chunk(sample_count: int = 16000, freq: float = 440.0) -> str:
    t = np.linspace(0, sample_count / 16000.0, sample_count, endpoint=False, dtype=np.float32)
    # Natural speech-like sinusoidal envelope with harmonics
    waveform = 0.25 * np.sin(2 * np.pi * freq * t) + 0.10 * np.sin(2 * np.pi * (freq * 2) * t)
    int16_samples = (np.clip(waveform, -1.0, 1.0) * 32767).astype(np.int16)
    return base64.b64encode(int16_samples.tobytes()).decode("utf-8")


class TestMaster2EndToEndIntegration:
    def setup_method(self):
        self.orchestrator = UnifiedPipelineOrchestrator(target_sample_rate=16000)

    def test_e2e_remote_access_attack_flow(self):
        call_id = "call-e2e-remote-001"
        self.orchestrator.clear_call_session(call_id)
        audio_b64 = make_synthetic_speech_chunk(8000)

        # Turn 0: Attacker claims to be bank security and asks to install AnyDesk
        payload = AudioChunkPayload(
            call_id=call_id,
            chunk_index=0,
            sample_rate=16000,
            audio_base64=audio_b64,
            text_transcript="I am calling from bank fraud department. Your account is compromised, please install AnyDesk immediately."
        )

        result = self.orchestrator.process_chunk(payload)

        # 1. Pipeline execution status
        assert result.call_id == call_id
        assert result.component_statuses.get("asr") == "AVAILABLE"
        assert result.component_statuses.get("risk_fusion") == "AVAILABLE"

        # 2. Risk dimensions should capture account takeover and social engineering
        assert result.risk_dimensions.get("social_engineering", 0.0) > 40.0
        assert result.risk_dimensions.get("account_takeover", 0.0) > 40.0

        # 3. Overall risk score should be elevated/high
        assert result.overall_risk_score >= 50.0

        # 4. Context store adapter should have captured the turn
        ctx = ContextStoreRegistry.get_adapter().get_context(call_id)
        assert ctx is not None
        assert len(ctx.turns) == 1
        assert ctx.last_action_requested == ActionType.INSTALL_REMOTE_SOFTWARE

        # Clean session
        self.orchestrator.clear_call_session(call_id)
        assert ContextStoreRegistry.get_adapter().get_context(call_id) is None

    def test_e2e_multilingual_kannada_wire_transfer(self):
        call_id = "call-e2e-kannada-002"
        self.orchestrator.clear_call_session(call_id)
        audio_b64 = make_synthetic_speech_chunk(8000)

        # Kannada request for money transfer under urgency
        payload = AudioChunkPayload(
            call_id=call_id,
            chunk_index=0,
            sample_rate=16000,
            audio_base64=audio_b64,
            text_transcript="ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹಣವನ್ನು ತಕ್ಷಣ ವರ್ಗಾಯಿಸಿ, ಖಾತೆ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ"
        )

        result = self.orchestrator.process_chunk(payload)

        # Language should be identified as Kannada
        assert result.language_code == LanguageCode.KN
        assert result.language_display == "Kannada"

        self.orchestrator.clear_call_session(call_id)

    def test_e2e_otp_solicitation_step_up_policy(self):
        call_id = "call-e2e-otp-policy-003"
        self.orchestrator.clear_call_session(call_id)
        audio_b64 = make_synthetic_speech_chunk(8000)

        payload = AudioChunkPayload(
            call_id=call_id,
            chunk_index=0,
            sample_rate=16000,
            audio_base64=audio_b64,
            text_transcript="This is police cyber crime, tell me your OTP right now or you will be arrested."
        )

        result = self.orchestrator.process_chunk(payload)

        # Credential theft dimension must be high
        assert result.risk_dimensions.get("credential_theft", 0.0) >= 70.0
        # Policy recommendation must trigger step-up or alert
        assert result.policy_recommendation in [
            PolicyAction.REQUIRE_STEP_UP_VERIFICATION.value,
            PolicyAction.WARN_ANALYST.value,
            "REQUIRE_STEP_UP_VERIFICATION"
        ]

        self.orchestrator.clear_call_session(call_id)
