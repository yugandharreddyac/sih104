"""
Unit Tests for Master 2: Quantitative Action Risk Scorer & Requested Action Extractor
Validates:
1. Deterministic quantitative scoring across all action types.
2. Contextual multipliers (urgency, authority, hesitation, refusal, multi-turn escalation).
3. Score bounds [0.0, 100.0] and [0.0, 1.0].
4. Multilingual action extraction (English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Marathi).
5. Explainability and contributing factors generation.
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from ai.app.action_risk.scorer import ActionRiskScorer
from ai.app.action.extractor import RequestedActionExtractor
from ai.app.core.types import ActionType, RiskSeverity, SocialEngineeringTactic
from ai.app.context.contract import AIConversationContext, ConversationTurn


class TestActionRiskScorer:
    def setup_method(self):
        self.scorer = ActionRiskScorer()
        self.extractor = RequestedActionExtractor()

    def test_benign_action_scoring(self):
        eval_res = self.scorer.evaluate_action(ActionType.BENIGN_ACTION, text="Hello how are you")
        assert eval_res.risk_score == 5.0
        assert eval_res.normalized_score == 0.05
        assert eval_res.severity == RiskSeverity.LOW
        assert eval_res.is_high_risk is False
        assert eval_res.urgency_multiplier == 1.0

    def test_remote_access_software_critical_risk(self):
        eval_res = self.scorer.evaluate_action(ActionType.INSTALL_REMOTE_SOFTWARE)
        assert eval_res.risk_score >= 95.0
        assert eval_res.severity == RiskSeverity.CRITICAL
        assert eval_res.is_high_risk is True
        assert eval_res.credential_sensitivity_weight >= 0.90
        assert "Remote access tool" in eval_res.contributing_factors[0]

    def test_otp_disclosure_critical_risk(self):
        eval_res = self.scorer.evaluate_action(ActionType.DISCLOSE_OTP)
        assert eval_res.risk_score >= 92.0
        assert eval_res.severity == RiskSeverity.CRITICAL
        assert eval_res.is_high_risk is True
        assert eval_res.credential_sensitivity_weight == 1.0

    def test_funds_transfer_with_urgency_modifier(self):
        eval_base = self.scorer.evaluate_action(ActionType.TRANSFER_FUNDS)
        eval_urgent = self.scorer.evaluate_action(
            ActionType.TRANSFER_FUNDS,
            tactics=[SocialEngineeringTactic.URGENCY_PRESSURE]
        )
        assert eval_urgent.risk_score > eval_base.risk_score
        assert eval_urgent.urgency_multiplier == 1.15
        assert any("Urgency pressure active" in f for f in eval_urgent.contributing_factors)

    def test_wire_transfer_with_fear_and_authority(self):
        eval_res = self.scorer.evaluate_action(
            ActionType.TRANSFER_FUNDS,
            tactics=[
                SocialEngineeringTactic.AUTHORITY_EXPLOITATION,
                SocialEngineeringTactic.FEAR_COERCION
            ]
        )
        assert eval_res.authority_multiplier == 1.20
        assert eval_res.risk_score >= 82.0 * 1.20

    def test_refusal_and_hesitation_escalation(self):
        ctx = AIConversationContext(call_id="test-escalate-call")
        ctx.hesitation_count = 1
        ctx.refusal_count = 1
        ctx.escalation_level = 3

        eval_res = self.scorer.evaluate_action(
            ActionType.DISCLOSE_PIN,
            context=ctx
        )
        assert eval_res.hesitation_multiplier == 1.25
        assert any("refusal count=1" in f for f in eval_res.contributing_factors)
        assert eval_res.risk_score <= 100.0

    def test_score_bounds_capped_at_100(self):
        # Apply every possible multiplier to ensure no overflow
        ctx = AIConversationContext(call_id="test-bounds-call")
        ctx.refusal_count = 5
        ctx.escalation_level = 5

        eval_res = self.scorer.evaluate_action(
            ActionType.INSTALL_REMOTE_SOFTWARE,
            tactics=[
                SocialEngineeringTactic.URGENCY_PRESSURE,
                SocialEngineeringTactic.FEAR_COERCION,
                SocialEngineeringTactic.DIGITAL_ARREST_THREAT,
                SocialEngineeringTactic.SECRECY_DEMAND
            ],
            context=ctx
        )
        assert eval_res.risk_score == 100.0
        assert eval_res.normalized_score == 1.0

    def test_legacy_score_action_interface(self):
        res = self.scorer.score_action("TRANSFER_FUNDS", {"tactics": ["URGENCY_PRESSURE"]})
        assert res["status"] == "AVAILABLE"
        assert res["action_type"] == "TRANSFER_FUNDS"
        assert res["risk_score"] > 85.0
        assert "rationale" in res


class TestRequestedActionExtractorMultilingual:
    def setup_method(self):
        self.extractor = RequestedActionExtractor()

    def test_english_anydesk_extraction(self):
        res = self.extractor.extract_action("Please install AnyDesk on your mobile phone right now")
        assert res.action_type == ActionType.INSTALL_REMOTE_SOFTWARE
        assert res.is_high_risk is True
        assert res.action_risk is not None
        assert res.action_risk.risk_score >= 95.0

    def test_hindi_otp_extraction(self):
        res = self.extractor.extract_action("Aapke phone par verification code aaya hai, OTP batao jaldi")
        assert res.action_type == ActionType.DISCLOSE_OTP
        assert res.is_high_risk is True
        assert res.action_risk.severity == RiskSeverity.CRITICAL

    def test_telugu_funds_transfer(self):
        res = self.extractor.extract_action("Ventane dabbulu transfer cheyandi")
        assert res.action_type == ActionType.TRANSFER_FUNDS
        assert res.is_high_risk is True

    def test_tamil_screen_share(self):
        res = self.extractor.extract_action("Ungal screen share pannunga ippove")
        assert res.action_type == ActionType.SHARE_SCREEN
        assert res.is_high_risk is True

    def test_kannada_money_transfer(self):
        res = self.extractor.extract_action("Thakshana duddu transfer maadi")
        assert res.action_type == ActionType.TRANSFER_FUNDS
        assert res.is_high_risk is True

    def test_malayalam_otp_solicitation(self):
        res = self.extractor.extract_action("OTP parayu udanadi")
        assert res.action_type == ActionType.DISCLOSE_OTP
        assert res.is_high_risk is True

    def test_bengali_money_transfer(self):
        res = self.extractor.extract_action("Apnar taka pathan ekhoni")
        assert res.action_type == ActionType.TRANSFER_FUNDS
        assert res.is_high_risk is True

    def test_marathi_otp_disclosure(self):
        res = self.extractor.extract_action("Tumcha OTP sanga twarit")
        assert res.action_type == ActionType.DISCLOSE_OTP
        assert res.is_high_risk is True

    def test_benign_inquiry(self):
        res = self.extractor.extract_action("What are your branch working hours on Saturday?")
        assert res.action_type == ActionType.BENIGN_ACTION
        assert res.is_high_risk is False
        assert res.action_risk.risk_score == 5.0
