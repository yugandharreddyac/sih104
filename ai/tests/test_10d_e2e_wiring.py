"""
Comprehensive End-to-End Verification Test Suite for 10D Risk Fusion Wiring
Validates all 10 canonical dimensions across:
- Level 1 (Unit: Structured Detector Payloads -> Canonical Signal Bus -> 10D Fusion Matrix)
- Level 2 (Integration: Real Input -> Real Detector Engines -> Signal Bus -> 10D Fusion Matrix)
- Level 3 (Negative / Benign / Silent Input handling: 0.0, None, NOT_EVALUATED, INSUFFICIENT_DATA)
- Level 4 (Dimension Provenance schema integrity: dimension, score, confidence, status, source_detector, model_version, evidence, timestamp)
"""

import base64
import numpy as np
import pytest

from ai.app.core.types import (
    AudioChunkPayload,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    DeepfakeAnalysisResult,
    SpeakerVerificationResult,
    ReplayAnalysisResult,
    ManipulationAnalysisResult,
    VADState,
    AudioQualityRating,
    AudioQualityResult,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ReplayStatus,
    IntentCategory,
    SensitiveDataType,
    SensitiveDataRole,
    SocialEngineeringTactic,
    AttackProgressionState,
    ActionType,
    CallerClaim,
    CallerClaimType,
    RiskLevel,
    PipelineStatus,
    DimensionProvenance
)
from ai.app.fusion.engine import MultiModalRiskFusionEngine
from ai.app.sensitive_data.detector import SensitiveDataDetector
from ai.app.social_engineering.detector import SocialEngineeringDetector
from ai.app.action.extractor import RequestedActionExtractor
from ai.app.speaker.verifier import SpeakerVerifier
from ai.app.deepfake.detector import DeepfakeDetector
from ai.app.replay.detector import ReplayDetector
from ai.app.claims.verifier import ConversationInconsistencyVerifier


# ==============================================================================
# TEST FIXTURE HELPERS
# ==============================================================================

def make_test_acoustic(
    call_id: str = "test-call",
    chunk_index: int = 0,
    overall_assessment: str = "AUTHENTICITY_SUPPORTED",
    deepfake: dict = None,
    speaker: dict = None,
    replay: dict = None,
    uncertainty_penalty: float = 0.0
) -> AcousticIntelligenceResult:
    df = deepfake or {
        "status": DeepfakeStatus.AUTHENTIC.value,
        "spoof_score": 0.05,
        "confidence": 0.85,
        "model_version": "deepfake_aasist_spectral_v3"
    }
    spk = speaker or {
        "status": SpeakerVerificationStatus.NOT_ENROLLED.value,
        "confidence": 0.50,
        "model_version": "speaker_xvector_biometric_v3"
    }
    rep = replay or {
        "status": ReplayStatus.NOT_REPLAY.value,
        "replay_probability": 0.05,
        "confidence": 0.80,
        "model_version": "replay_spectral_decay_v3"
    }
    return AcousticIntelligenceResult(
        call_id=call_id,
        chunk_index=chunk_index,
        timestamp="2026-09-07T12:00:00Z",
        overall_assessment=overall_assessment,
        deepfake=df,
        speaker=spk,
        replay=rep,
        manipulation={"level": "NO_INDICATOR"},
        vad={"state": "SPEECH", "speech_probability": 0.95, "energy_rms": 0.05, "zero_crossing_rate": 0.05, "spectral_centroid": 1500.0, "confidence": 0.95, "processing_latency_ms": 1.0},
        quality={"rating": "GOOD", "rms_dbfs": -20.0, "peak_amplitude": 0.6, "clipping_ratio": 0.0, "silence_ratio": 0.0, "snr_estimate_db": 24.0, "dynamic_range_db": 40.0, "sample_rate": 16000, "channels": 1, "duration_ms": 250.0, "uncertainty_penalty": uncertainty_penalty, "notes": ""},
        temporal_metrics={"window_duration_seconds": 1.0, "accumulated_speech_seconds": 1.0, "total_chunks_processed": 4, "is_warmed_up": True, "stability_confidence": 0.9},
        total_ai_latency_ms=5.0
    )


def make_test_conversational(
    call_id: str = "test-call",
    turn_index: int = 1,
    primary_intent: str = IntentCategory.BENIGN_INQUIRY.value,
    sensitive_data: dict = None,
    social_engineering: dict = None,
    requested_action: dict = None,
    caller_claims: list = None,
    transcript: str = ""
) -> ConversationalIntelligenceResult:
    sd = sensitive_data or {"status": "AVAILABLE", "contains_direct_request": False, "contains_secret": False, "highest_severity": "LOW"}
    se = social_engineering or {"status": "AVAILABLE", "attack_sequence_score": 0.0, "confidence": 0.85}
    act = requested_action or {"action_type": ActionType.BENIGN_ACTION.value, "target_object": "", "confidence": 0.5}
    claims_list = caller_claims if caller_claims is not None else []
    return ConversationalIntelligenceResult(
        call_id=call_id,
        turn_index=turn_index,
        timestamp="2026-09-07T12:00:00Z",
        asr={"status": "AVAILABLE", "confidence": 0.95, "uncertainty": 0.05, "transcript": transcript},
        intent={"primary_intent": primary_intent, "confidence": 0.85},
        sensitive_data=sd,
        social_engineering=se,
        requested_action=act,
        caller_claims=claims_list,
        total_nlp_latency_ms=8.0
    )


# ==============================================================================
# LEVEL 1: UNIT TESTS (STRUCTURED DETECTOR RESULT -> CANONICAL SIGNAL -> 10D FUSION)
# ==============================================================================

class TestLevel1UnitWiring:
    """
    Validates that structured detector outputs map into CanonicalRiskSignals
    and correctly activate each of the 10 dimensions in the fusion matrix with full provenance.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.engine = MultiModalRiskFusionEngine()

    def test_dimension_1_credential_theft_unit(self):
        conv = make_test_conversational(
            call_id="call-unit-cred",
            primary_intent=IntentCategory.OTP_REQUEST.value,
            sensitive_data={
                "status": "AVAILABLE",
                "contains_direct_request": True,
                "contains_secret": True,
                "highest_severity": "CRITICAL",
                "findings": [
                    {
                        "entity_type": SensitiveDataType.OTP.value,
                        "role": SensitiveDataRole.DIRECT_REQUEST.value,
                        "raw_preview_sanitized": "[REDACTED]",
                        "confidence": 0.92,
                        "severity": "CRITICAL"
                    }
                ]
            },
            requested_action={
                "action_type": ActionType.DISCLOSE_CREDENTIAL.value,
                "target_object": "OTP",
                "confidence": 0.90,
                "raw_action_text_redacted": "Please disclose your OTP"
            }
        )
        res = self.engine.evaluate_risk(call_id="call-unit-cred", conversational=conv)
        assert res.dimensions.credential_theft is not None
        assert res.dimensions.credential_theft >= 70.0
        prov = res.dimension_provenance["credential_theft"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "SensitiveDataDetector"
        assert prov.confidence > 0.7
        assert len(prov.evidence) > 0

    def test_dimension_2_social_engineering_unit(self):
        conv = make_test_conversational(
            call_id="call-unit-se",
            primary_intent=IntentCategory.EMERGENCY_ACTION_REQUEST.value,
            social_engineering={
                "status": "AVAILABLE",
                "attack_sequence_score": 0.85,
                "progression_state": AttackProgressionState.FEAR_URGENCY_INDUCED.value,
                "tactics_detected": [SocialEngineeringTactic.AUTHORITY_EXPLOITATION.value, SocialEngineeringTactic.URGENCY_PRESSURE.value],
                "confidence": 0.85,
                "explainability": ["Coercive authority language detected threatening account termination."]
            }
        )
        res = self.engine.evaluate_risk(call_id="call-unit-se", conversational=conv)
        assert res.dimensions.social_engineering >= 60.0
        prov = res.dimension_provenance["social_engineering"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "SocialEngineeringDetector"
        assert prov.confidence >= 0.80

    def test_dimension_3_verification_bypass_unit(self):
        conv = make_test_conversational(
            call_id="call-unit-bypass",
            primary_intent=IntentCategory.AUTHENTICATION_BYPASS.value,
            social_engineering={
                "status": "AVAILABLE",
                "attack_sequence_score": 0.88,
                "verification_bypass_detected": True,
                "progression_state": AttackProgressionState.AUTHENTICATION_BYPASS_ATTEMPTED.value,
                "tactics_detected": [SocialEngineeringTactic.VERIFICATION_BYPASS.value],
                "confidence": 0.85,
                "explainability": ["Explicit instruction to bypass out-of-band verification."]
            },
            requested_action={
                "action_type": ActionType.BYPASS_POLICY.value,
                "target_object": "2FA",
                "confidence": 0.85,
                "raw_action_text_redacted": "Bypass 2FA step"
            }
        )
        res = self.engine.evaluate_risk(call_id="call-unit-bypass", conversational=conv)
        assert res.dimensions.verification_bypass >= 65.0
        prov = res.dimension_provenance["verification_bypass"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "SocialEngineeringDetector"
        assert len(prov.evidence) > 0

    def test_dimension_4_financial_fraud_unit(self):
        conv = make_test_conversational(
            call_id="call-unit-fin",
            primary_intent=IntentCategory.MONEY_TRANSFER_REQUEST.value,
            requested_action={
                "action_type": ActionType.TRANSFER_FUNDS.value,
                "target_object": "BENEFICIARY_ACCOUNT",
                "confidence": 0.90,
                "raw_action_text_redacted": "Transfer 5000 dollars"
            }
        )
        res = self.engine.evaluate_risk(call_id="call-unit-fin", conversational=conv)
        assert res.dimensions.financial_fraud >= 60.0
        prov = res.dimension_provenance["financial_fraud"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "RequestedActionExtractor"

    def test_dimension_5_identity_impersonation_unit(self):
        ac = make_test_acoustic(
            call_id="call-unit-spk",
            overall_assessment="SUSPICIOUS",
            speaker={
                "status": SpeakerVerificationStatus.MISMATCH.value,
                "similarity_score": 0.15,
                "confidence": 0.85,
                "model_version": "speaker_xvector_biometric_v3",
                "explainability": ["Voice embedding distance 0.85 from enrolled identity profile."]
            }
        )
        res = self.engine.evaluate_risk(call_id="call-unit-spk", acoustic=ac)
        assert res.dimensions.identity_impersonation >= 60.0
        prov = res.dimension_provenance["identity_impersonation"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "SpeakerVerifier"
        assert prov.model_version == "speaker_xvector_biometric_v3"

    def test_dimension_6_account_takeover_unit(self):
        conv = make_test_conversational(
            call_id="call-unit-ato",
            primary_intent=IntentCategory.REMOTE_ACCESS_REQUEST.value,
            requested_action={
                "action_type": ActionType.INSTALL_REMOTE_SOFTWARE.value,
                "target_object": "ANYDESK",
                "confidence": 0.92,
                "raw_action_text_redacted": "Install remote software"
            }
        )
        res = self.engine.evaluate_risk(call_id="call-unit-ato", conversational=conv)
        assert res.dimensions.account_takeover >= 60.0
        prov = res.dimension_provenance["account_takeover"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "RequestedActionExtractor"

    def test_dimension_7_deepfake_synthetic_unit(self):
        ac = make_test_acoustic(
            call_id="call-unit-df",
            overall_assessment="SUSPICIOUS",
            deepfake={
                "status": DeepfakeStatus.SUSPICIOUS.value,
                "spoof_score": 0.92,
                "confidence": 0.88,
                "model_version": "deepfake_aasist_spectral_v3",
                "explainability": ["High-frequency phase distortion and unnatural pitch consistency."]
            }
        )
        res = self.engine.evaluate_risk(call_id="call-unit-df", acoustic=ac)
        assert res.dimensions.deepfake_synthetic >= 70.0
        prov = res.dimension_provenance["deepfake_synthetic"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "DeepfakeDetector"
        assert prov.model_version == "deepfake_aasist_spectral_v3"

    def test_dimension_8_replay_injection_unit(self):
        ac = make_test_acoustic(
            call_id="call-unit-replay",
            overall_assessment="SUSPICIOUS",
            replay={
                "status": ReplayStatus.REPLAY.value,
                "replay_probability": 0.88,
                "confidence": 0.82,
                "model_version": "replay_spectral_decay_v3",
                "explainability": ["Double reverberation convolution and room acoustic decay mismatch."]
            }
        )
        res = self.engine.evaluate_risk(call_id="call-unit-replay", acoustic=ac)
        assert res.dimensions.replay_injection >= 60.0
        prov = res.dimension_provenance["replay_injection"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "ReplayDetector"

    def test_dimension_9_inconsistency_unit(self):
        claims = [
            CallerClaim(claim_type=CallerClaimType.BANK_OFFICIAL, claimed_identity="Alice Smith", organization="Chase", confidence=0.90, stated_turn_index=1),
            CallerClaim(claim_type=CallerClaimType.POLICE_LAW_ENFORCEMENT, claimed_identity="Officer Miller", organization="Police", confidence=0.90, stated_turn_index=3),
        ]
        conv = make_test_conversational(
            call_id="call-unit-incon",
            turn_index=3,
            caller_claims=claims
        )
        res = self.engine.evaluate_risk(call_id="call-unit-incon", conversational=conv)
        assert res.dimensions.inconsistency >= 50.0
        prov = res.dimension_provenance["inconsistency"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "ConversationInconsistencyVerifier"

    def test_dimension_10_overall_unit(self):
        ac = make_test_acoustic(
            call_id="call-unit-overall",
            overall_assessment="SUSPICIOUS",
            deepfake={"status": DeepfakeStatus.SUSPICIOUS.value, "spoof_score": 0.85, "confidence": 0.85, "model_version": "deepfake_aasist_spectral_v3"},
            speaker={"status": SpeakerVerificationStatus.MISMATCH.value, "similarity_score": 0.2, "confidence": 0.85, "model_version": "speaker_xvector_biometric_v3"}
        )
        conv = make_test_conversational(
            call_id="call-unit-overall",
            primary_intent=IntentCategory.OTP_REQUEST.value,
            sensitive_data={"status": "AVAILABLE", "contains_direct_request": True, "contains_secret": True, "highest_severity": "CRITICAL"},
            social_engineering={"status": "AVAILABLE", "attack_sequence_score": 0.85, "confidence": 0.85},
            requested_action={"action_type": ActionType.DISCLOSE_CREDENTIAL.value, "target_object": "OTP", "confidence": 0.9}
        )
        res = self.engine.evaluate_risk(call_id="call-unit-overall", acoustic=ac, conversational=conv)
        assert res.overall_risk_score is not None
        assert res.overall_risk_score >= 80.0
        assert res.risk_level == RiskLevel.CRITICAL
        prov = res.dimension_provenance["overall"]
        assert prov.status == "AVAILABLE"
        assert prov.source_detector == "MultiModalRiskFusionEngine"
        assert prov.score == res.overall_risk_score


# ==============================================================================
# LEVEL 2: INTEGRATION TESTS (REAL INPUT -> REAL DETECTOR -> BUS -> FUSION)
# ==============================================================================

class TestLevel2IntegrationWiring:
    """
    Validates end-to-end integration:
    Real raw text / audio chunks passed through real detector engines,
    producing verified scores in the 10-dimensional matrix.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.engine = MultiModalRiskFusionEngine()
        self.cred_detector = SensitiveDataDetector()
        self.se_detector = SocialEngineeringDetector()
        self.action_extractor = RequestedActionExtractor()
        self.incon_verifier = ConversationInconsistencyVerifier()
        self.df_detector = DeepfakeDetector(sample_rate=16000)
        self.spk_verifier = SpeakerVerifier(sample_rate=16000)
        self.replay_detector = ReplayDetector(sample_rate=16000)

    def test_real_credential_theft_detector_chain(self):
        real_text = "Please tell me your OTP code right now so I can verify your account."
        sens_res = self.cred_detector.detect_situations(real_text)
        action_res = self.action_extractor.extract_action(real_text)

        assert sens_res.contains_direct_request is True
        assert action_res.action_type == ActionType.DISCLOSE_CREDENTIAL

        conv = make_test_conversational(
            call_id="call-int-cred",
            primary_intent=IntentCategory.OTP_REQUEST.value,
            sensitive_data=sens_res.model_dump(),
            requested_action=action_res.model_dump(),
            transcript=real_text
        )
        res = self.engine.evaluate_risk(call_id="call-int-cred", conversational=conv)
        assert res.dimensions.credential_theft > 50.0
        assert res.dimension_provenance["credential_theft"].status == "AVAILABLE"

    def test_real_social_engineering_detector_chain(self):
        real_text = "This is Officer Miller from Cyber Police Headquarters! You must transfer the balance immediately within 5 minutes or an arrest warrant will be executed!"
        se_res = self.se_detector.analyze_tactics(text_transcript=real_text)
        assert len(se_res.tactics_detected) > 0 or se_res.attack_sequence_score > 0.30

        se_dict = se_res.model_dump()
        se_dict["status"] = "AVAILABLE"

        conv = make_test_conversational(
            call_id="call-int-se",
            primary_intent=IntentCategory.EMERGENCY_ACTION_REQUEST.value,
            social_engineering=se_dict,
            transcript=real_text
        )
        res = self.engine.evaluate_risk(call_id="call-int-se", conversational=conv)
        assert res.dimensions.social_engineering > 35.0
        assert res.dimension_provenance["social_engineering"].status == "AVAILABLE"

    def test_real_verification_bypass_detector_chain(self):
        real_text = "Can you please skip the verification and bypass the policy? It is an emergency."
        se_res = self.se_detector.analyze_tactics(text_transcript=real_text)
        action_res = self.action_extractor.extract_action(real_text)

        assert action_res.action_type == ActionType.BYPASS_POLICY or se_res.verification_bypass_detected

        se_dict = se_res.model_dump()
        se_dict["status"] = "AVAILABLE"

        conv = make_test_conversational(
            call_id="call-int-bypass",
            primary_intent=IntentCategory.AUTHENTICATION_BYPASS.value,
            social_engineering=se_dict,
            requested_action=action_res.model_dump(),
            transcript=real_text
        )
        res = self.engine.evaluate_risk(call_id="call-int-bypass", conversational=conv)
        assert res.dimensions.verification_bypass > 40.0
        assert res.dimension_provenance["verification_bypass"].status == "AVAILABLE"

    def test_real_financial_fraud_detector_chain(self):
        real_text = "Please transfer $5000 to beneficiary account 987654321 immediately."
        action_res = self.action_extractor.extract_action(real_text)
        assert action_res.action_type == ActionType.TRANSFER_FUNDS

        conv = make_test_conversational(
            call_id="call-int-fin",
            primary_intent=IntentCategory.MONEY_TRANSFER_REQUEST.value,
            requested_action=action_res.model_dump(),
            transcript=real_text
        )
        res = self.engine.evaluate_risk(call_id="call-int-fin", conversational=conv)
        assert res.dimensions.financial_fraud > 50.0
        assert res.dimension_provenance["financial_fraud"].status == "AVAILABLE"

    def test_real_account_takeover_detector_chain(self):
        real_text = "Go to your web browser, download anydesk software, and give me remote access to your computer."
        action_res = self.action_extractor.extract_action(real_text)
        assert action_res.action_type == ActionType.INSTALL_REMOTE_SOFTWARE

        conv = make_test_conversational(
            call_id="call-int-ato",
            primary_intent=IntentCategory.REMOTE_ACCESS_REQUEST.value,
            requested_action=action_res.model_dump(),
            transcript=real_text
        )
        res = self.engine.evaluate_risk(call_id="call-int-ato", conversational=conv)
        assert res.dimensions.account_takeover > 50.0
        assert res.dimension_provenance["account_takeover"].status == "AVAILABLE"

    def test_real_inconsistency_detector_chain(self):
        claims = [
            CallerClaim(claim_type=CallerClaimType.BANK_OFFICIAL, claimed_identity="Robert Johnson", organization="Chase", stated_turn_index=1, confidence=0.9),
            CallerClaim(claim_type=CallerClaimType.POLICE_LAW_ENFORCEMENT, claimed_identity="Officer Davis", organization="Police", stated_turn_index=2, confidence=0.9)
        ]
        incon_list = self.incon_verifier.verify_inconsistencies(claims, "")
        assert len(incon_list) > 0
        incon_score = self.incon_verifier.compute_inconsistency_score(incon_list)
        assert incon_score > 0.50

        conv = make_test_conversational(
            call_id="call-int-incon",
            turn_index=2,
            caller_claims=claims
        )
        res = self.engine.evaluate_risk(call_id="call-int-incon", conversational=conv)
        assert res.dimensions.inconsistency > 40.0
        assert res.dimension_provenance["inconsistency"].status == "AVAILABLE"

    def test_real_acoustic_detectors_chain(self):
        t = np.linspace(0, 1.0, 16000, endpoint=False)
        audio_samples = (0.4 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        pcm_bytes = (audio_samples * 32767).astype(np.int16).tobytes()
        b64_audio = base64.b64encode(pcm_bytes).decode("ascii")

        chunk = AudioChunkPayload(
            call_id="call-int-audio",
            chunk_index=0,
            sample_rate=16000,
            audio_base64=b64_audio,
            claimed_speaker_id="CEO_JOHN_DOE"
        )

        df_res = self.df_detector.analyze(chunk)
        spk_res = self.spk_verifier.verify_speaker(chunk, claimed_speaker_id="CEO_JOHN_DOE")
        replay_res = self.replay_detector.detect_replay(chunk)

        ac = make_test_acoustic(
            call_id="call-int-audio",
            overall_assessment="SUSPICIOUS",
            deepfake=df_res.model_dump(),
            speaker=spk_res.model_dump(),
            replay=replay_res.model_dump()
        )

        res = self.engine.evaluate_risk(call_id="call-int-audio", acoustic=ac)

        prov_df = res.dimension_provenance["deepfake_synthetic"]
        assert prov_df.status == "AVAILABLE"
        assert prov_df.source_detector == "DeepfakeDetector"

        prov_spk = res.dimension_provenance["identity_impersonation"]
        assert prov_spk.status == "AVAILABLE"
        assert prov_spk.source_detector == "SpeakerVerifier"
        assert res.dimensions.identity_impersonation > 20.0

        prov_rep = res.dimension_provenance["replay_injection"]
        assert prov_rep.status == "AVAILABLE"
        assert prov_rep.source_detector == "ReplayDetector"

        assert res.overall_risk_score is not None
        assert res.dimension_provenance["overall"].status == "AVAILABLE"


# ==============================================================================
# LEVEL 3: NEGATIVE & BENIGN TESTS (ZERO INTEGRITY & NO FABRICATION)
# ==============================================================================

class TestNegativeAndBenignIntegrity:
    """
    Validates that benign or absent inputs result in 0.0, null/None,
    NOT_EVALUATED, or INSUFFICIENT_DATA without fabricating arbitrary non-zero scores.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.engine = MultiModalRiskFusionEngine()

    def test_benign_conversation_produces_zero_threat_dimensions(self):
        conv = make_test_conversational(
            call_id="call-benign-01",
            primary_intent=IntentCategory.BENIGN_INQUIRY.value,
            transcript="Hello, what are your branch opening hours?"
        )
        res = self.engine.evaluate_risk(call_id="call-benign-01", conversational=conv)

        # All malicious threat dimensions must remain 0.0
        assert res.dimensions.credential_theft == 0.0
        assert res.dimensions.social_engineering == 0.0
        assert res.dimensions.verification_bypass == 0.0
        assert res.dimensions.financial_fraud == 0.0
        assert res.dimensions.account_takeover == 0.0
        assert res.dimensions.inconsistency == 0.0

        # Unevaluated acoustic dimensions must be 0.0 with NOT_EVALUATED status
        assert res.dimensions.deepfake_synthetic == 0.0
        assert res.dimension_provenance["deepfake_synthetic"].status == "NOT_EVALUATED"
        assert res.dimensions.identity_impersonation == 0.0
        assert res.dimension_provenance["identity_impersonation"].status == "NOT_EVALUATED"
        assert res.dimensions.replay_injection == 0.0
        assert res.dimension_provenance["replay_injection"].status == "NOT_EVALUATED"

        # Overall risk level must be safe / low
        assert res.overall_risk_score is not None
        assert res.overall_risk_score <= 15.0
        assert res.risk_level in [RiskLevel.SAFE, RiskLevel.LOW]

    def test_empty_signals_produces_none_overall_and_insufficient_data(self):
        # Calling evaluate_risk with neither acoustic nor conversational
        res = self.engine.evaluate_risk(call_id="call-empty-signals")
        assert res.overall_risk_score is None
        assert res.risk_level == RiskLevel.INCONCLUSIVE
        assert res.dimension_provenance["overall"].status == "INSUFFICIENT_DATA"
        assert res.dimension_provenance["overall"].score is None

        # All dimensions must be 0.0 and NOT_EVALUATED
        for dim in [
            "deepfake_synthetic", "identity_impersonation", "replay_injection",
            "social_engineering", "credential_theft", "financial_fraud",
            "account_takeover", "verification_bypass", "inconsistency"
        ]:
            assert getattr(res.dimensions, dim) == 0.0
            assert res.dimension_provenance[dim].status == "NOT_EVALUATED"
            assert res.dimension_provenance[dim].score == 0.0
            assert res.dimension_provenance[dim].confidence == 0.0

    def test_unenrolled_speaker_without_claim_produces_zero_impersonation(self):
        ac = make_test_acoustic(
            call_id="call-unclaimed-01",
            overall_assessment="AUTHENTICITY_SUPPORTED",
            speaker={"status": SpeakerVerificationStatus.NOT_ENROLLED.value, "confidence": 0.50, "enrolled_speaker_id": None, "model_version": "speaker_xvector_biometric_v3"}
        )
        res = self.engine.evaluate_risk(call_id="call-unclaimed-01", acoustic=ac)
        assert res.dimensions.identity_impersonation == 0.0
        assert res.dimension_provenance["identity_impersonation"].status == "AVAILABLE"
        assert res.overall_risk_score is not None
        assert res.overall_risk_score <= 15.0


# ==============================================================================
# LEVEL 4: COMPLETE PROVENANCE SCHEMA VALIDATION ACROSS ALL 10 DIMENSIONS
# ==============================================================================

class TestProvenanceSchemaIntegrity:
    """
    Validates that every call to the fusion engine produces a complete,
    valid DimensionProvenance record for all 10 canonical dimensions.
    """

    EXPECTED_DIMENSIONS = [
        "overall",
        "identity_impersonation",
        "deepfake_synthetic",
        "replay_injection",
        "social_engineering",
        "credential_theft",
        "financial_fraud",
        "account_takeover",
        "verification_bypass",
        "inconsistency"
    ]

    def test_all_ten_dimensions_present_in_provenance(self):
        engine = MultiModalRiskFusionEngine()
        conv = make_test_conversational(call_id="call-prov-test")
        res = engine.evaluate_risk(call_id="call-prov-test", conversational=conv)

        prov_map = res.dimension_provenance
        assert isinstance(prov_map, dict)
        for d in self.EXPECTED_DIMENSIONS:
            assert d in prov_map, f"Missing dimension '{d}' in dimension_provenance"
            dp: DimensionProvenance = prov_map[d]
            assert dp.dimension == d
            assert dp.status in ["AVAILABLE", "NOT_EVALUATED", "INSUFFICIENT_DATA", "DEGRADED"]
            assert isinstance(dp.source_detector, str) and len(dp.source_detector) > 0
            assert isinstance(dp.model_version, str) and len(dp.model_version) > 0
            assert isinstance(dp.evidence, list)
            assert isinstance(dp.timestamp, str) and len(dp.timestamp) > 0
            if dp.score is not None:
                assert 0.0 <= dp.score <= 100.0
            assert 0.0 <= dp.confidence <= 1.0
