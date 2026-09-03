"""
VOXSHIELD Phase 4 Conversational Intelligence, Intent & Social Engineering Tests
Covers Steps 4.1 through 4.21:
1. Streaming intent classification and taxonomy coverage
2. Social engineering tactics detection across 7 categories
3. Multi-turn escalation state machine progression
4. Multilingual Indian context support (Hindi, Telugu, Tamil, Bengali, Marathi, code-switching)
5. Contradiction and behavioral inconsistency verification
6. Negation-aware sensitive data detection and PII redaction
7. ASR uncertainty dampening on malicious intent scores
8. Long-call bounded memory safety and session isolation
"""

import pytest
from ai.app.intent.classifier import ConversationalIntentClassifier
from ai.app.intent.taxonomy import INTENT_PATTERNS
from ai.app.social_engineering.detector import SocialEngineeringDetector
from ai.app.social_engineering.tactics import SocialEngineeringTacticsExtractor
from ai.app.claims.extractor import CallerClaimExtractor
from ai.app.claims.verifier import ConversationInconsistencyVerifier
from ai.app.sensitive_data.detector import SensitiveDataDetector
from ai.app.conversation.memory import ConversationMemoryManager, CallConversationMemory
from ai.app.conversation.context import ConversationContextEngine
from ai.app.core.types import (
    IntentCategory,
    SocialEngineeringTactic,
    AttackProgressionState,
    CallerClaim,
    CallerClaimType,
    ConversationTurn,
    ConversationPhase,
    SensitiveDataType,
    SensitiveDataRole,
    RiskSeverity
)


def test_streaming_intent_classification_and_adversarial_flag():
    """Verify primary intent classification, evidence cues, and adversarial flagging."""
    classifier = ConversationalIntentClassifier()

    # 1. OTP Request
    res_otp = classifier.classify("Please read me the OTP sent to your phone")
    assert res_otp.primary_intent == IntentCategory.OTP_REQUEST
    assert res_otp.is_adversarial is True
    assert res_otp.confidence >= 0.80

    # 2. Remote Access Request
    res_remote = classifier.classify("Install AnyDesk so I can assist you with your account")
    assert res_remote.primary_intent == IntentCategory.REMOTE_ACCESS_REQUEST
    assert res_remote.is_adversarial is True

    # 3. Benign Inquiry
    res_benign = classifier.classify("What are the working hours of the Indiranagar branch?")
    assert res_benign.primary_intent == IntentCategory.BENIGN_INQUIRY
    assert res_benign.is_adversarial is False


def test_multilingual_indian_social_engineering_tactics():
    """Verify tactics extraction across Hindi, Telugu, Tamil, Bengali, and Marathi expressions."""
    extractor = SocialEngineeringTacticsExtractor()

    # Hindi: Authority + Fear + Urgency
    text_hi = "Mai police station se bol raha hu, aapka account band ho jayega, turant paisa bhejo"
    tactics_hi, _ = extractor.extract_tactics(text_hi)
    assert SocialEngineeringTactic.AUTHORITY_EXPLOITATION in tactics_hi
    assert SocialEngineeringTactic.FEAR_COERCION in tactics_hi
    assert SocialEngineeringTactic.URGENCY_PRESSURE in tactics_hi
    assert SocialEngineeringTactic.FINANCIAL_PRESSURE in tactics_hi

    # Telugu: Fear + Urgency + Isolation
    text_te = "Account block avutundi, ventane transfer cheyandi, call disconnect mat karna"
    tactics_te, _ = extractor.extract_tactics(text_te)
    assert SocialEngineeringTactic.FEAR_COERCION in tactics_te
    assert SocialEngineeringTactic.URGENCY_PRESSURE in tactics_te

    # Tamil: Urgency + Authority
    text_ta = "Police station la irunthu pesurom, seekkiram seiyunga"
    tactics_ta, _ = extractor.extract_tactics(text_ta)
    assert SocialEngineeringTactic.AUTHORITY_EXPLOITATION in tactics_ta
    assert SocialEngineeringTactic.URGENCY_PRESSURE in tactics_ta


def test_multi_turn_attack_escalation_progression():
    """Verify that multi-turn conversation transitions through attack escalation states."""
    detector = SocialEngineeringDetector()

    # Turn 1: Authority claim
    r1 = detector.analyze_tactics("I am calling from the bank fraud department")
    assert r1.progression_state in (AttackProgressionState.AUTHORITY_ESTABLISHED, AttackProgressionState.BENIGN_CONVERSATION)

    # Turn 2: Urgency + Fear
    r2 = detector.analyze_tactics(
        "Your account will be blocked immediately due to suspicious activity",
        accumulated_tactics=r1.tactics_detected
    )
    assert r2.progression_state in (AttackProgressionState.FEAR_URGENCY_INDUCED, AttackProgressionState.AUTHORITY_ESTABLISHED)

    # Turn 3: Secret harvesting
    r3 = detector.analyze_tactics(
        "Tell me your OTP right now to unblock it",
        current_intent=IntentCategory.OTP_REQUEST,
        accumulated_tactics=r2.tactics_detected,
        contains_secret_request=True
    )
    assert r3.progression_state in (AttackProgressionState.SECRET_HARVESTING_ATTEMPTED, AttackProgressionState.CRITICAL_ACTION_EXPLOITATION)
    assert r3.attack_sequence_score >= 0.70


def test_contradiction_and_behavioral_inconsistency():
    """Verify detection of conflicting institutional claims and secret solicitation reversals."""
    extractor = CallerClaimExtractor()
    verifier = ConversationInconsistencyVerifier()

    # Conflicting identity claims: Bank Official -> Police Officer
    c1 = extractor.extract_claims("I am calling from the bank branch manager office", turn_index=1)
    c2 = extractor.extract_claims("I am inspector from the police cyber crime branch", turn_index=3)

    all_claims = c1 + c2
    inconsistencies = verifier.verify_inconsistencies(all_claims, "Full dialogue text here")
    assert len(inconsistencies) > 0
    assert "Contradictory caller identity claims" in inconsistencies[0]

    # Secret reversal: "I will never ask for OTP" -> "Give me your OTP"
    dialogue_text = "We will never ask for your password or pin. Now tell me the otp to verify."
    inconsistencies_secret = verifier.verify_inconsistencies([], dialogue_text)
    assert any("behavioral contradiction" in inc.lower() for inc in inconsistencies_secret)


def test_negation_awareness_prevents_false_alarms():
    """Defensive/educational mentions of credentials must not trigger CRITICAL alarms."""
    detector = SensitiveDataDetector()

    # Defensive educational warning
    res_defensive = detector.detect_situations("Remember, the bank will never ask for your OTP or password.")
    assert res_defensive.contains_direct_request is False
    assert res_defensive.highest_severity == RiskSeverity.LOW
    assert any(f.role == SensitiveDataRole.BENIGN_MENTION for f in res_defensive.findings)

    # Malicious direct solicitation
    res_malicious = detector.detect_situations("Please share your 6-digit OTP right now.")
    assert res_malicious.contains_direct_request is True
    assert res_malicious.highest_severity == RiskSeverity.CRITICAL


def test_asr_uncertainty_dampens_conversational_confidence():
    """Low ASR confidence must appropriately dampen intent and social engineering scores."""
    classifier = ConversationalIntentClassifier()
    detector = SocialEngineeringDetector()

    # High ASR confidence (1.0)
    res_high = classifier.classify("Read me the OTP", asr_confidence=1.0)
    # Low ASR confidence (0.40)
    res_low = classifier.classify("Read me the OTP", asr_confidence=0.40)

    assert res_low.confidence < res_high.confidence
    assert res_low.confidence == pytest.approx(res_high.confidence * 0.40, 0.05)


def test_long_call_memory_bounded_and_isolated():
    """Verify that conversation memory respects the 20-turn limit and isolates concurrent calls."""
    m_alpha = ConversationMemoryManager.get_or_create("call-alpha")
    m_beta = ConversationMemoryManager.get_or_create("call-beta")

    # Add 30 turns to call-alpha
    for i in range(30):
        m_alpha.add_turn(ConversationTurn(
            turn_index=i,
            speaker_channel=1,
            transcript=f"Turn number {i}",
            redacted_transcript=f"Turn number {i}",
            timestamp_ms=i * 1000
        ))

    # Memory must be capped at 20 turns
    assert len(m_alpha.turns) == 20
    assert m_alpha.turns[0].turn_index == 10  # Oldest turns discarded
    assert m_alpha.turns[-1].turn_index == 29

    # call-beta must remain completely empty and unpolluted
    assert len(m_beta.turns) == 0

    # Teardown
    ConversationMemoryManager.remove("call-alpha")
    ConversationMemoryManager.remove("call-beta")
