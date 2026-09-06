"""
Unit Tests for Master 2: Social Engineering Tactical & Escalation Intelligence
Validates:
1. Detection of authority impersonation (Police, CBI, Bank, Cyber Crime).
2. Digital arrest threat detection.
3. Account suspension threat detection.
4. Reward / lottery scam detection.
5. Secrecy demand and victim isolation attempts.
6. Refusal handling and multi-turn escalation progression.
7. Multilingual tactic expressions (Hindi, Telugu, Tamil, Kannada, Malayalam).
"""

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from ai.app.social_engineering.detector import SocialEngineeringDetector
from ai.app.social_engineering.tactics import SocialEngineeringTacticsExtractor
from ai.app.core.types import SocialEngineeringTactic, AttackProgressionState, IntentCategory


class TestSocialEngineeringMaster2:
    def setup_method(self):
        self.extractor = SocialEngineeringTacticsExtractor()
        self.detector = SocialEngineeringDetector()

    def test_digital_arrest_detection(self):
        text = "You are under digital arrest by CBI cyber crime. Stay on skype and do not leave the room."
        tactics, evidence = self.extractor.extract_tactics(text)
        assert SocialEngineeringTactic.DIGITAL_ARREST_THREAT in tactics
        assert SocialEngineeringTactic.AUTHORITY_EXPLOITATION in tactics
        assert any("digital arrest" in e.lower() for e in evidence)

    def test_account_suspension_threat(self):
        text = "Your SIM card will be deactivated today due to pending KYC verification failure."
        tactics, evidence = self.extractor.extract_tactics(text)
        assert SocialEngineeringTactic.ACCOUNT_SUSPENSION_THREAT in tactics

    def test_reward_lottery_scam(self):
        text = "Congratulations you have won a lottery prize of 25 lakh, claim your reward immediately."
        tactics, evidence = self.extractor.extract_tactics(text)
        assert SocialEngineeringTactic.REWARD_SCAM in tactics
        assert SocialEngineeringTactic.URGENCY_PRESSURE in tactics

    def test_secrecy_and_isolation(self):
        text = "Keep this strictly confidential. Do not tell anyone in your family and stay on the line."
        tactics, evidence = self.extractor.extract_tactics(text)
        assert SocialEngineeringTactic.SECRECY_DEMAND in tactics
        assert SocialEngineeringTactic.ISOLATION_ATTEMPT in tactics

    def test_refusal_escalation_tactic(self):
        text = "If you do not cooperate police officers are on the way to your house right now."
        tactics, evidence = self.extractor.extract_tactics(text)
        assert SocialEngineeringTactic.REFUSAL_ESCALATION in tactics
        assert SocialEngineeringTactic.URGENCY_PRESSURE in tactics

    def test_multilingual_kannada_tactics(self):
        text = "Naavu bankinda maathadiddivi, thakshana duddu transfer maadi, yarigoo helabeda"
        tactics, evidence = self.extractor.extract_tactics(text)
        assert SocialEngineeringTactic.AUTHORITY_EXPLOITATION in tactics
        assert SocialEngineeringTactic.URGENCY_PRESSURE in tactics
        assert SocialEngineeringTactic.SECRECY_DEMAND in tactics

    def test_multilingual_malayalam_tactics(self):
        text = "ningal panam ayakkuka udanadi, aarodum parayaruthu, call disconnect cheyyaruthu"
        tactics, evidence = self.extractor.extract_tactics(text)
        assert SocialEngineeringTactic.FINANCIAL_PRESSURE in tactics
        assert SocialEngineeringTactic.URGENCY_PRESSURE in tactics
        assert SocialEngineeringTactic.SECRECY_DEMAND in tactics
        assert SocialEngineeringTactic.ISOLATION_ATTEMPT in tactics

    def test_full_detector_attack_progression(self):
        res = self.detector.analyze_tactics(
            text_transcript="I am calling from bank fraud department. Tell me your OTP immediately or your account will be frozen.",
            current_intent=IntentCategory.OTP_REQUEST,
            contains_secret_request=True
        )
        assert res.attack_sequence_score >= 0.85
        assert res.progression_state == AttackProgressionState.SECRET_HARVESTING_ATTEMPTED
        assert res.authority_pressure is True
        assert res.urgency_detected is True
        assert res.fear_coercion_detected is True
