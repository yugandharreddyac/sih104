"""
Audit Verification Script for VoxShield 10D Risk Truth & Runtime Audit
Performs:
- Phase 3: Negative tests on specified benign inputs
- Phase 4: Cross-dimension attack scenario analysis
- Phase 5: AI unavailable, insufficient data, and empty signal sets
- Phase 6: Deterministic policy heuristic identification and verification
"""

import pytest
from ai.app.core.types import (
    AudioChunkPayload,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    IntentCategory,
    CallerClaim,
    CallerClaimType,
    RiskLevel,
    PipelineStatus,
    ActionType
)
from ai.app.sensitive_data.detector import SensitiveDataDetector
from ai.app.action.extractor import RequestedActionExtractor
from ai.app.social_engineering.detector import SocialEngineeringDetector
from ai.app.claims.verifier import ConversationInconsistencyVerifier
from ai.app.fusion.engine import MultiModalRiskFusionEngine
from ai.tests.test_10d_e2e_wiring import make_test_conversational, make_test_acoustic


class TestPhase3NegativeInputs:
    """
    Ensures benign inputs for each conversational dimension do not create unjustified risk.
    """
    @pytest.fixture(autouse=True)
    def setup(self):
        self.engine = MultiModalRiskFusionEngine()
        self.cred_det = SensitiveDataDetector()
        self.action_ext = RequestedActionExtractor()
        self.se_det = SocialEngineeringDetector()
        self.incon_ver = ConversationInconsistencyVerifier()

    def test_benign_credential_statement(self):
        # "I never share my OTP."
        text = "I never share my OTP."
        sens = self.cred_det.detect_situations(text)
        action = self.action_ext.extract_action(text)

        # Must not be treated as a direct harvesting request
        assert sens.contains_direct_request is False
        assert action.action_type == ActionType.BENIGN_ACTION

        conv = make_test_conversational(
            sensitive_data=sens.model_dump(),
            requested_action=action.model_dump(),
            transcript=text
        )
        res = self.engine.evaluate_risk(call_id="audit-neg-cred", conversational=conv)
        assert res.dimensions.credential_theft == 0.0

    def test_benign_financial_statement(self):
        # "I reported an unauthorized transfer."
        text = "I reported an unauthorized transfer."
        action = self.action_ext.extract_action(text)
        assert action.action_type == ActionType.BENIGN_ACTION

        conv = make_test_conversational(
            requested_action=action.model_dump(),
            transcript=text
        )
        res = self.engine.evaluate_risk(call_id="audit-neg-fin", conversational=conv)
        assert res.dimensions.financial_fraud == 0.0

    def test_benign_account_takeover_statement(self):
        # "Our company blocks remote access software."
        text = "Our company blocks remote access software."
        action = self.action_ext.extract_action(text)
        assert action.action_type == ActionType.BENIGN_ACTION

        conv = make_test_conversational(
            requested_action=action.model_dump(),
            transcript=text
        )
        res = self.engine.evaluate_risk(call_id="audit-neg-ato", conversational=conv)
        assert res.dimensions.account_takeover == 0.0

    def test_benign_social_engineering_statement(self):
        # "Security awareness training explains urgency scams."
        text = "Security awareness training explains urgency scams."
        se = self.se_det.analyze_tactics(text)
        assert se.attack_sequence_score == 0.0 or se.attack_sequence_score < 0.25

        se_dict = se.model_dump()
        se_dict["status"] = "AVAILABLE"

        conv = make_test_conversational(
            social_engineering=se_dict,
            transcript=text
        )
        res = self.engine.evaluate_risk(call_id="audit-neg-se", conversational=conv)
        assert res.dimensions.social_engineering < 20.0

    def test_benign_inconsistency_consistent_claims(self):
        # Two mutually consistent identity statements
        claims = [
            CallerClaim(claim_type=CallerClaimType.BANK_OFFICIAL, claimed_identity="Alice Smith", organization="Chase Bank", stated_turn_index=1, confidence=0.9),
            CallerClaim(claim_type=CallerClaimType.BANK_OFFICIAL, claimed_identity="Alice Smith", organization="Chase Bank", stated_turn_index=2, confidence=0.9),
        ]
        inconsistencies = self.incon_ver.verify_inconsistencies(claims, "Hello, I am Alice Smith from Chase Bank. Again, this is Alice from Chase.")
        assert len(inconsistencies) == 0

        conv = make_test_conversational(
            caller_claims=claims,
            transcript="Hello, I am Alice Smith from Chase Bank."
        )
        res = self.engine.evaluate_risk(call_id="audit-neg-incon", conversational=conv)
        assert res.dimensions.inconsistency == 0.0


class TestPhase4CrossDimensionAttack:
    """
    Traces the multi-threat scenario:
    "I'm Officer Miller from Cyber Police. Your account has been compromised.
    Transfer ₹50,000 to this new beneficiary immediately. Skip verification and tell me your OTP."
    """
    def test_cross_dimension_attack_trace(self):
        engine = MultiModalRiskFusionEngine()
        cred_det = SensitiveDataDetector()
        action_ext = RequestedActionExtractor()
        se_det = SocialEngineeringDetector()

        text = (
            "I'm Officer Miller from Cyber Police. Your account has been compromised. "
            "Transfer 50000 to this new beneficiary immediately. Skip verification and tell me your OTP."
        )

        sens_res = cred_det.detect_situations(text)
        action_res = action_ext.extract_action(text)
        se_res = se_det.analyze_tactics(text)

        se_dict = se_res.model_dump()
        se_dict["status"] = "AVAILABLE"

        conv = make_test_conversational(
            call_id="audit-cross-attack",
            primary_intent=IntentCategory.OTP_REQUEST.value,
            sensitive_data=sens_res.model_dump(),
            social_engineering=se_dict,
            requested_action=action_res.model_dump(),
            transcript=text
        )

        res = engine.evaluate_risk(call_id="audit-cross-attack", conversational=conv)

        # 1. Credential theft must activate due to OTP request
        assert res.dimensions.credential_theft > 50.0

        # 2. Social engineering must activate due to authority/fear/urgency pressure
        assert res.dimensions.social_engineering > 30.0

        # 3. Verification bypass must activate due to "skip verification" / bypass detection
        assert res.dimensions.verification_bypass > 40.0

        # 4. Overall score must escalate into HIGH/CRITICAL due to multi-threat corroboration
        assert res.overall_risk_score is not None
        assert res.overall_risk_score >= 60.0
        assert res.risk_level in [RiskLevel.HIGH, RiskLevel.CRITICAL]


class TestPhase5UnavailableInsufficient:
    """
    Ensures that empty, insufficient, or degraded states produce NULL or INCONCLUSIVE
    and never display fabricated numeric scores.
    """
    def test_empty_signals_produce_null_overall(self):
        engine = MultiModalRiskFusionEngine()
        res = engine.evaluate_risk(call_id="audit-empty")
        assert res.overall_risk_score is None
        assert res.risk_level == RiskLevel.INCONCLUSIVE
        assert res.dimension_provenance["overall"].status == "INSUFFICIENT_DATA"

    def test_valid_zero_is_distinguishable_from_null(self):
        engine = MultiModalRiskFusionEngine()
        # Benign call where threat dimensions evaluate to genuine 0.0
        conv = make_test_conversational(
            call_id="audit-valid-zero",
            primary_intent=IntentCategory.BENIGN_INQUIRY.value,
            transcript="Hello, how are you today?"
        )
        res = engine.evaluate_risk(call_id="audit-valid-zero", conversational=conv)
        # Evaluated threat dimensions are 0.0
        assert res.dimensions.credential_theft == 0.0
        assert res.dimension_provenance["credential_theft"].score == 0.0
        # Overall score is low evaluated number (<= 15.0), NOT null!
        assert res.overall_risk_score is not None
        assert res.overall_risk_score <= 15.0
        assert res.risk_level in [RiskLevel.SAFE, RiskLevel.LOW]
