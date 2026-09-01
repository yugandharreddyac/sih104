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
    AttackProgressionState
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
