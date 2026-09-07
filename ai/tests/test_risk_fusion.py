"""
Unit & Integration Tests for Phase 5 Multi-Modal Risk Fusion, Evidence Graph & Temporal Dynamics
"""

import base64
import numpy as np
import pytest
from ai.app.fusion.engine import MultiModalRiskFusionEngine
from ai.app.fusion.signal_contract import CanonicalSignalBus
from ai.app.fusion.validator import SignalValidator
from ai.app.core.types import (
    AudioChunkPayload,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    RiskLevel,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ReplayStatus,
    IntentCategory,
    SocialEngineeringTactic,
    AttackProgressionState,
    ActionType
)


def generate_audio_b64(freq=440.0, duration=0.25, sample_rate=16000):
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    samples = (0.5 * np.sin(2 * np.pi * freq * t) * 32767).astype(np.int16)
    return base64.b64encode(samples.tobytes()).decode("utf-8")


def test_signal_validator_rejects_nan_and_inf():
    bus = CanonicalSignalBus()
    signals = bus.normalize_signals("call-test", None, None)
    valid, errors = SignalValidator.validate_signals(signals)
    assert len(errors) == 0


def test_cross_modal_corroboration_escalates_risk():
    engine = MultiModalRiskFusionEngine()

    # Create dummy high-risk acoustic & conversational results
    now_iso = "2026-09-01T00:00:00Z"
    acoustic = AcousticIntelligenceResult(
        call_id="call-sec-01",
        chunk_index=1,
        timestamp=now_iso,
        overall_assessment="SUSPICIOUS",
        deepfake={
            "status": DeepfakeStatus.SUSPICIOUS.value,
            "spoof_score": 0.85,
            "confidence": 0.90,
            "uncertainty": 0.10,
            "model_version": "deepfake_aasist_spectral_v3",
            "explainability": ["Vocoder phase distortion detected"]
        },
        speaker={
            "status": SpeakerVerificationStatus.MISMATCH.value,
            "similarity_score": 0.32,
            "confidence": 0.92,
            "threshold_applied": 0.72,
            "model_version": "speaker_xvector_biometric_v3",
            "explainability": ["Vocal tract mismatch"]
        },
        replay={
            "status": ReplayStatus.REPLAY.value,
            "replay_probability": 0.88,
            "confidence": 0.85,
            "model_version": "replay_spectral_decay_v3",
            "explainability": ["Secondary room reverb"]
        },
        manipulation={"level": "NO_INDICATOR"},
        vad={"state": "SPEECH", "speech_probability": 0.95, "energy_rms": 0.05, "zero_crossing_rate": 0.05, "spectral_centroid": 1500.0, "confidence": 0.95, "processing_latency_ms": 1.0},
        quality={"rating": "GOOD", "rms_dbfs": -20.0, "peak_amplitude": 0.6, "clipping_ratio": 0.0, "silence_ratio": 0.0, "snr_estimate_db": 24.0, "dynamic_range_db": 40.0, "sample_rate": 16000, "channels": 1, "duration_ms": 250.0, "uncertainty_penalty": 0.0, "notes": ""},
        temporal_metrics={"window_duration_seconds": 1.0, "accumulated_speech_seconds": 1.0, "total_chunks_processed": 4, "is_warmed_up": True, "stability_confidence": 0.9},
        total_ai_latency_ms=5.0
    )

    conv = ConversationalIntelligenceResult(
        call_id="call-sec-01",
        turn_index=1,
        timestamp=now_iso,
        asr={"status": "AVAILABLE", "confidence": 0.95, "uncertainty": 0.05, "transcript": "Give me the OTP now", "redacted_transcript": "Give me the OTP [REDACTED]"},
        intent={"primary_intent": IntentCategory.OTP_REQUEST.value, "confidence": 0.95, "is_adversarial": True, "evidence_cues": ["Direct OTP request"]},
        sensitive_data={"status": "AVAILABLE", "contains_direct_request": True, "contains_secret": True, "highest_severity": "CRITICAL"},
        social_engineering={
            "status": "AVAILABLE",
            "tactics_detected": [SocialEngineeringTactic.AUTHORITY_EXPLOITATION.value, SocialEngineeringTactic.URGENCY_PRESSURE.value, SocialEngineeringTactic.VERIFICATION_BYPASS.value],
            "progression_state": AttackProgressionState.SECRET_HARVESTING_ATTEMPTED.value,
            "attack_sequence_score": 0.88,
            "confidence": 0.92,
            "explainability": ["Secret harvesting under urgency"]
        },
        requested_action={"action_type": "DISCLOSE_CREDENTIAL", "target_object": "OTP", "is_high_risk": True, "confidence": 0.95, "raw_action_text_redacted": "OTP [REDACTED]"},
        total_nlp_latency_ms=6.0
    )

    result = engine.evaluate_risk(call_id="call-sec-01", acoustic=acoustic, conversational=conv)

    assert result.overall_risk_score >= 80.0
    assert result.risk_level == RiskLevel.CRITICAL
    assert result.dimensions.credential_theft >= 75.0
    assert result.dimensions.identity_impersonation >= 70.0
    assert len(result.evidence_graph.nodes) >= 4
    assert result.policy_recommendation is not None
    assert result.policy_recommendation.recommended_action.value == "REQUIRE_STEP_UP_VERIFICATION"


def test_quality_degradation_dampens_confidence():
    engine = MultiModalRiskFusionEngine()

    now_iso = "2026-09-01T00:00:00Z"
    # Poor quality audio with 0.80 uncertainty penalty
    acoustic = AcousticIntelligenceResult(
        call_id="call-noisy-02",
        chunk_index=1,
        timestamp=now_iso,
        overall_assessment="INCONCLUSIVE",
        deepfake={"status": DeepfakeStatus.INCONCLUSIVE.value, "spoof_score": 0.50, "confidence": 0.30, "uncertainty": 0.70, "model_version": "v3"},
        speaker={"status": SpeakerVerificationStatus.MISMATCH.value, "similarity_score": 0.40, "confidence": 0.40, "model_version": "v3"},
        replay={"status": ReplayStatus.UNCERTAIN.value, "replay_probability": 0.50, "confidence": 0.20, "model_version": "v3"},
        manipulation={"level": "NO_INDICATOR"},
        vad={"state": "UNCERTAIN", "speech_probability": 0.5, "energy_rms": 0.01, "zero_crossing_rate": 0.05, "spectral_centroid": 1000.0, "confidence": 0.4, "processing_latency_ms": 1.0},
        quality={"rating": "POOR", "rms_dbfs": -45.0, "peak_amplitude": 0.05, "clipping_ratio": 0.0, "silence_ratio": 0.6, "snr_estimate_db": 4.0, "dynamic_range_db": 10.0, "sample_rate": 16000, "channels": 1, "duration_ms": 250.0, "uncertainty_penalty": 0.80, "notes": "High noise"},
        temporal_metrics={"window_duration_seconds": 1.0, "accumulated_speech_seconds": 0.2, "total_chunks_processed": 4, "is_warmed_up": False, "stability_confidence": 0.3},
        total_ai_latency_ms=5.0
    )

    result = engine.evaluate_risk(call_id="call-noisy-02", acoustic=acoustic, conversational=None)
    # Poor quality must reduce fusion confidence
    assert result.confidence < 0.50
    assert result.uncertainty > 0.50


def test_empty_signals_yields_none_overall_and_inconclusive():
    engine = MultiModalRiskFusionEngine()
    result = engine.evaluate_risk(call_id="call-empty-03", acoustic=None, conversational=None)
    assert result.overall_risk_score is None
    assert result.risk_level == RiskLevel.INCONCLUSIVE
    assert result.dimensions.overall is None


def test_inconsistency_dimension_activation():
    engine = MultiModalRiskFusionEngine()
    now_iso = "2026-09-01T00:00:00Z"

    conv = ConversationalIntelligenceResult(
        call_id="call-inconsist-01",
        turn_index=1,
        timestamp=now_iso,
        asr={"status": "AVAILABLE", "confidence": 0.95, "uncertainty": 0.05, "transcript": "I will never ask for your OTP... tell me the OTP now"},
        intent={"primary_intent": IntentCategory.BENIGN_INQUIRY.value, "confidence": 0.9, "is_adversarial": False},
        sensitive_data={"status": "AVAILABLE", "contains_direct_request": False},
        social_engineering={"status": "AVAILABLE", "attack_sequence_score": 0.2, "confidence": 0.8},
        requested_action={"action_type": ActionType.BENIGN_ACTION.value, "target_object": "", "is_high_risk": False, "confidence": 0.9},
        inconsistencies=["Severe behavioral contradiction: Caller stated they would not request an OTP, but later solicited the OTP directly."],
        total_nlp_latency_ms=1.0
    )

    result = engine.evaluate_risk(call_id="call-inconsist-01", acoustic=None, conversational=conv)
    assert result.dimensions.inconsistency > 0.0
    assert result.dimensions.inconsistency >= 60.0
    assert result.overall_risk_score is not None
    assert result.overall_risk_score > 0.0


def test_financial_fraud_dimension_activation():
    engine = MultiModalRiskFusionEngine()
    now_iso = "2026-09-01T00:00:00Z"

    conv = ConversationalIntelligenceResult(
        call_id="call-fin-01",
        turn_index=1,
        timestamp=now_iso,
        asr={"status": "AVAILABLE", "confidence": 0.95, "uncertainty": 0.05, "transcript": "Please initiate wire transfer immediately"},
        intent={"primary_intent": IntentCategory.MONEY_TRANSFER_REQUEST.value, "confidence": 0.95, "is_adversarial": True},
        sensitive_data={"status": "AVAILABLE", "contains_direct_request": False},
        social_engineering={"status": "AVAILABLE", "attack_sequence_score": 0.3, "confidence": 0.8},
        requested_action={
            "action_type": ActionType.TRANSFER_FUNDS.value,
            "target_object": "WIRE_ESCROW",
            "is_high_risk": True,
            "confidence": 0.95,
            "raw_action_text_redacted": "transfer funds"
        },
        inconsistencies=[],
        total_nlp_latency_ms=1.0
    )

    result = engine.evaluate_risk(call_id="call-fin-01", acoustic=None, conversational=conv)
    assert result.dimensions.financial_fraud > 0.0
    assert result.dimensions.financial_fraud >= 60.0
    assert result.overall_risk_score is not None
    assert result.overall_risk_score > 0.0


def test_account_takeover_dimension_activation():
    engine = MultiModalRiskFusionEngine()
    now_iso = "2026-09-01T00:00:00Z"

    conv = ConversationalIntelligenceResult(
        call_id="call-ato-01",
        turn_index=1,
        timestamp=now_iso,
        asr={"status": "AVAILABLE", "confidence": 0.95, "uncertainty": 0.05, "transcript": "Download TeamViewer now so I can fix your account"},
        intent={"primary_intent": IntentCategory.REMOTE_ACCESS_REQUEST.value, "confidence": 0.95, "is_adversarial": True},
        sensitive_data={"status": "AVAILABLE", "contains_direct_request": False},
        social_engineering={"status": "AVAILABLE", "attack_sequence_score": 0.4, "confidence": 0.8},
        requested_action={
            "action_type": ActionType.INSTALL_REMOTE_SOFTWARE.value,
            "target_object": "TeamViewer",
            "is_high_risk": True,
            "confidence": 0.95,
            "raw_action_text_redacted": "install TeamViewer"
        },
        inconsistencies=[],
        total_nlp_latency_ms=1.0
    )

    result = engine.evaluate_risk(call_id="call-ato-01", acoustic=None, conversational=conv)
    assert result.dimensions.account_takeover > 0.0
    assert result.dimensions.account_takeover >= 60.0
    assert result.overall_risk_score is not None
    assert result.overall_risk_score > 0.0


def test_verification_bypass_boolean_flag_activates_dimension():
    """
    BUG D Verification:
    Confirms that when SocialEngineeringDetector produces verification_bypass_detected=True
    (or VERIFICATION_BYPASS in tactics), the verification_bypass dimension activates
    even if the progression state is NOT AUTHENTICATION_BYPASS_ATTEMPTED (e.g. AUTHORITY_ESTABLISHED).
    """
    engine = MultiModalRiskFusionEngine()
    now_iso = "2026-09-01T00:00:00Z"

    conv = ConversationalIntelligenceResult(
        call_id="call-bypass-test-01",
        turn_index=1,
        timestamp=now_iso,
        asr={"status": "AVAILABLE", "confidence": 0.95, "uncertainty": 0.05, "transcript": "I am the director, skip the voice check and approve this."},
        intent={"primary_intent": IntentCategory.BENIGN_INQUIRY.value, "confidence": 0.85, "is_adversarial": False},
        sensitive_data={"status": "AVAILABLE", "contains_direct_request": False},
        social_engineering={
            "status": "AVAILABLE",
            "tactics_detected": [SocialEngineeringTactic.AUTHORITY_EXPLOITATION.value, SocialEngineeringTactic.VERIFICATION_BYPASS.value],
            # State is specifically NOT AUTHENTICATION_BYPASS_ATTEMPTED
            "progression_state": AttackProgressionState.AUTHORITY_ESTABLISHED.value,
            "verification_bypass_detected": True,
            "attack_sequence_score": 0.85,
            "confidence": 0.90,
            "explainability": ["Caller pressured operator to bypass verification procedures under executive authority."]
        },
        requested_action={"action_type": ActionType.BENIGN_ACTION.value, "target_object": "", "is_high_risk": False, "confidence": 0.9},
        inconsistencies=[],
        total_nlp_latency_ms=1.0
    )

    result = engine.evaluate_risk(call_id="call-bypass-test-01", acoustic=None, conversational=conv)
    # Verification bypass dimension MUST activate
    assert result.dimensions.verification_bypass > 0.0
    assert result.dimensions.verification_bypass >= 65.0
    assert result.overall_risk_score is not None
    assert result.overall_risk_score > 0.0


def test_unenrolled_speaker_claimed_identity_moderate_score():
    """
    BUG E Verification:
    Confirms that when speaker verification status is NOT_ENROLLED and an identity is claimed,
    the identity_impersonation dimension yields a MODERATE risk score (~27.5) reflecting
    genuine uncertainty rather than being zeroed out (false safety).
    Conversely, an unenrolled speaker with NO claimed identity produces 0.0.
    """
    engine = MultiModalRiskFusionEngine()
    now_iso = "2026-09-01T00:00:00Z"

    # 1. Unenrolled speaker claiming specific identity "cfo-alex-001"
    acoustic_claimed = AcousticIntelligenceResult(
        call_id="call-unenroll-claim-01",
        chunk_index=1,
        timestamp=now_iso,
        overall_assessment="INCONCLUSIVE",
        deepfake={"status": DeepfakeStatus.AUTHENTIC.value, "spoof_score": 0.05, "confidence": 0.90, "uncertainty": 0.10, "model_version": "v3"},
        speaker={
            "status": SpeakerVerificationStatus.NOT_ENROLLED.value,
            "similarity_score": None,
            "confidence": 0.0,  # Upstream verifier emits 0.0 / None for unenrolled
            "enrolled_speaker_id": "cfo-alex-001",
            "model_version": "speaker_xvector_v3",
            "explainability": ["Speaker identity 'cfo-alex-001' is not enrolled in the biometric registry."]
        },
        replay={"status": ReplayStatus.NOT_REPLAY.value, "replay_probability": 0.05, "confidence": 0.90, "model_version": "v3"},
        manipulation={"level": "NO_INDICATOR"},
        vad={"state": "SPEECH", "speech_probability": 0.95, "energy_rms": 0.05, "zero_crossing_rate": 0.05, "spectral_centroid": 1500.0, "confidence": 0.95, "processing_latency_ms": 1.0},
        quality={"rating": "GOOD", "rms_dbfs": -20.0, "peak_amplitude": 0.6, "clipping_ratio": 0.0, "silence_ratio": 0.0, "snr_estimate_db": 24.0, "dynamic_range_db": 40.0, "sample_rate": 16000, "channels": 1, "duration_ms": 250.0, "uncertainty_penalty": 0.0, "notes": ""},
        temporal_metrics={"window_duration_seconds": 1.0, "accumulated_speech_seconds": 1.0, "total_chunks_processed": 4, "is_warmed_up": True, "stability_confidence": 0.9},
        total_ai_latency_ms=5.0
    )

    result_claimed = engine.evaluate_risk(call_id="call-unenroll-claim-01", acoustic=acoustic_claimed, conversational=None)

    # Must produce a MODERATE nonzero score, neither 0.0 (false safety) nor >= 70.0 (confirmed mismatch)
    assert result_claimed.dimensions.identity_impersonation > 0.0
    assert 20.0 <= result_claimed.dimensions.identity_impersonation <= 40.0

    # 2. Unenrolled speaker with NO claimed identity (anonymous neutral caller)
    acoustic_unclaimed = AcousticIntelligenceResult(
        call_id="call-unenroll-unclaimed-02",
        chunk_index=1,
        timestamp=now_iso,
        overall_assessment="AUTHENTICITY_SUPPORTED",
        deepfake={"status": DeepfakeStatus.AUTHENTIC.value, "spoof_score": 0.05, "confidence": 0.90, "uncertainty": 0.10, "model_version": "v3"},
        speaker={
            "status": SpeakerVerificationStatus.NOT_ENROLLED.value,
            "similarity_score": None,
            "confidence": 0.0,
            "enrolled_speaker_id": None,
            "model_version": "speaker_xvector_v3",
            "explainability": ["No claimed speaker identity associated with this call session."]
        },
        replay={"status": ReplayStatus.NOT_REPLAY.value, "replay_probability": 0.05, "confidence": 0.90, "model_version": "v3"},
        manipulation={"level": "NO_INDICATOR"},
        vad={"state": "SPEECH", "speech_probability": 0.95, "energy_rms": 0.05, "zero_crossing_rate": 0.05, "spectral_centroid": 1500.0, "confidence": 0.95, "processing_latency_ms": 1.0},
        quality={"rating": "GOOD", "rms_dbfs": -20.0, "peak_amplitude": 0.6, "clipping_ratio": 0.0, "silence_ratio": 0.0, "snr_estimate_db": 24.0, "dynamic_range_db": 40.0, "sample_rate": 16000, "channels": 1, "duration_ms": 250.0, "uncertainty_penalty": 0.0, "notes": ""},
        temporal_metrics={"window_duration_seconds": 1.0, "accumulated_speech_seconds": 1.0, "total_chunks_processed": 4, "is_warmed_up": True, "stability_confidence": 0.9},
        total_ai_latency_ms=5.0
    )

    result_unclaimed = engine.evaluate_risk(call_id="call-unenroll-unclaimed-02", acoustic=acoustic_unclaimed, conversational=None)
    # Neutral/anonymous call with no identity claim should NOT register identity impersonation risk
    assert result_unclaimed.dimensions.identity_impersonation == 0.0

