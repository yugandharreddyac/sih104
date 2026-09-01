"""
Unit Tests for Sensitive Data Situation Detector & Redactor (Phase 4)
"""

import pytest
from ai.app.sensitive_data.detector import SensitiveDataDetector
from ai.app.core.types import SensitiveDataType, SensitiveDataRole, RiskSeverity


def test_sensitive_data_situational_roles():
    detector = SensitiveDataDetector()

    # 1. Direct Solicitation Request
    res_req = detector.detect_situations("Tell me your OTP right now")
    assert res_req.contains_direct_request is True
    assert res_req.highest_severity == RiskSeverity.CRITICAL
    assert len(res_req.findings) > 0
    assert res_req.findings[0].role == SensitiveDataRole.DIRECT_REQUEST

    # 2. Benign Defensive Educational Statement (Negation)
    res_benign = detector.detect_situations("Please be aware that our bank will never ask for your password or OTP.")
    assert res_benign.contains_direct_request is False
    assert res_benign.highest_severity == RiskSeverity.LOW
    assert len(res_benign.findings) > 0
    assert res_benign.findings[0].role == SensitiveDataRole.BENIGN_MENTION

    # 3. Read Aloud Secret Disclosure & Automatic Redaction
    res_secret = detector.detect_situations("My password is Secret@123 and OTP is 948201")
    assert res_secret.contains_secret is True
    assert "[REDACTED]" in res_secret.redacted_preview
    assert "Secret@123" not in res_secret.redacted_preview
    assert "948201" not in res_secret.redacted_preview
