"""
Unit Tests for Social Engineering Tactics, Multi-Turn Sequences, and Contradiction Detection (Phase 4)
"""

import pytest
from ai.app.social_engineering.detector import SocialEngineeringDetector
from ai.app.claims.verifier import ConversationInconsistencyVerifier
from ai.app.core.types import (
    SocialEngineeringTactic,
    AttackProgressionState,
    IntentCategory,
    CallerClaim,
    CallerClaimType
)


def test_social_engineering_tactics_extraction():
    detector = SocialEngineeringDetector()
    res = detector.analyze_tactics(
        "I am calling from the police cyber crime branch. Your account will be frozen immediately and you will face arrest unless you stay on the line and keep this strictly confidential."
    )
    assert SocialEngineeringTactic.AUTHORITY_EXPLOITATION in res.tactics_detected
    assert SocialEngineeringTactic.FEAR_COERCION in res.tactics_detected
    assert SocialEngineeringTactic.URGENCY_PRESSURE in res.tactics_detected
    assert SocialEngineeringTactic.SECRECY_DEMAND in res.tactics_detected
    assert SocialEngineeringTactic.ISOLATION_ATTEMPT in res.tactics_detected


def test_multiturn_attack_sequence_progression():
    detector = SocialEngineeringDetector()

    # Turn 1: Authority
    r1 = detector.analyze_tactics("I am calling from your bank security team.")
    assert r1.progression_state == AttackProgressionState.AUTHORITY_ESTABLISHED

    # Turn 2: Urgency + Fear
    r2 = detector.analyze_tactics(
        "There is unauthorized activity and your account will be suspended in 5 minutes!",
        accumulated_tactics=r1.tactics_detected
    )
    assert r2.progression_state == AttackProgressionState.FEAR_URGENCY_INDUCED

    # Turn 3: Verification Bypass
    r3 = detector.analyze_tactics(
        "Do not call the branch number, I will verify you right here directly.",
        accumulated_tactics=r2.tactics_detected
    )
    assert r3.progression_state == AttackProgressionState.AUTHENTICATION_BYPASS_ATTEMPTED

    # Turn 4: Secret Solicitation
    r4 = detector.analyze_tactics(
        "Read the 6-digit OTP code sent to your phone right now.",
        current_intent=IntentCategory.OTP_REQUEST,
        accumulated_tactics=r3.tactics_detected,
        contains_secret_request=True
    )
    assert r4.progression_state == AttackProgressionState.SECRET_HARVESTING_ATTEMPTED
    assert r4.attack_sequence_score >= 0.85


def test_conversation_inconsistency_detection():
    verifier = ConversationInconsistencyVerifier()

    claims = [
        CallerClaim(claim_type=CallerClaimType.BANK_OFFICIAL, claimed_identity="Bank Manager", organization="Bank", confidence=0.9, stated_turn_index=0),
        CallerClaim(claim_type=CallerClaimType.POLICE_LAW_ENFORCEMENT, claimed_identity="Police Inspector", organization="Police", confidence=0.9, stated_turn_index=3),
    ]

    all_turns_text = "I am calling from your bank. Don't worry we never ask for your OTP. Actually I am from the police station, please read the code to me."
    inconsistencies = verifier.verify_inconsistencies(claims, all_turns_text)

    assert len(inconsistencies) >= 2
    assert any("Contradictory caller identity" in inc for inc in inconsistencies)
    assert any("Severe behavioral contradiction" in inc for inc in inconsistencies)
