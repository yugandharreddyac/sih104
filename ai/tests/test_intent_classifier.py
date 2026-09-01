"""
Unit Tests for Conversational Intent Classifier (Phase 4)
"""

import pytest
from ai.app.intent.classifier import ConversationalIntentClassifier
from ai.app.core.types import IntentCategory


def test_intent_classification_adversarial_vs_benign():
    classifier = ConversationalIntentClassifier()

    # 1. OTP Request Intent
    res_otp = classifier.classify("Please read me the 6-digit OTP you just received on your phone.")
    assert res_otp.primary_intent == IntentCategory.OTP_REQUEST
    assert res_otp.is_adversarial is True
    assert res_otp.confidence >= 0.85

    # 2. Money Transfer Intent
    res_wire = classifier.classify("Transfer $50,000 immediately to the new vendor account.")
    assert res_wire.primary_intent == IntentCategory.MONEY_TRANSFER_REQUEST
    assert res_wire.is_adversarial is True

    # 3. Remote Access Software Intent
    res_remote = classifier.classify("Install AnyDesk on your computer so I can fix your system.")
    assert res_remote.primary_intent == IntentCategory.REMOTE_ACCESS_REQUEST
    assert res_remote.is_adversarial is True

    # 4. Authentication Bypass Intent
    res_bypass = classifier.classify("Skip the manager approval and I will verify you directly.")
    assert res_bypass.primary_intent == IntentCategory.AUTHENTICATION_BYPASS
    assert res_bypass.is_adversarial is True

    # 5. Benign Conversational Statement
    res_benign = classifier.classify("Hello, I would like to inquire about your business hours tomorrow.")
    assert res_benign.primary_intent == IntentCategory.BENIGN_INQUIRY
    assert res_benign.is_adversarial is False
