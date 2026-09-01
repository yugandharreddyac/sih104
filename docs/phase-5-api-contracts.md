# VOXSHIELD Phase 5 REST API Contracts

## 1. Unified Risk Analysis & Evaluation APIs

### `POST /api/risk/evaluate`
Evaluates multi-modal risk for an active call or historical turn sequence.
- **Permission**: `CALLS_READ` or `CALLS_STREAM`
- **Request Body**:
```json
{
  "callId": "call-sec-demo-101",
  "streamId": "stream-1725148800",
  "chunkIndex": 4,
  "claimedSpeakerId": "speaker-cfo-001"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "call_id": "call-sec-demo-101",
    "overall_risk_score": 88.5,
    "risk_level": "CRITICAL",
    "dimensions": {
      "overall": 88.5,
      "identity_impersonation": 85.0,
      "deepfake_synthetic": 12.0,
      "replay_injection": 8.0,
      "social_engineering": 92.0,
      "credential_theft": 95.0,
      "financial_fraud": 88.0,
      "account_takeover": 45.0,
      "verification_bypass": 90.0,
      "inconsistency": 0.0
    },
    "risk_velocity": 14.2,
    "primary_drivers": [
      "Credential theft solicitation detected (OTP_REQUEST).",
      "Biometric speaker mismatch against claimed CFO identity.",
      "Behavioral attack progression reached secret harvesting stage."
    ],
    "policy_recommendation": {
      "policy_id": "POL-CRED-001",
      "action": "REQUIRE_STEP_UP_VERIFICATION",
      "target_channel": "OUT_OF_BAND_HARDWARE_TOKEN",
      "requires_human_approval": true
    },
    "timestamp": "2026-09-01T00:20:00Z"
  }
}
```

---

## 2. Policy Management APIs

### `GET /api/policies`
Returns active deterministic security policies.
- **Permission**: `POLICIES_READ`

### `POST /api/policies`
Creates or updates a deterministic security policy.
- **Permission**: `POLICIES_WRITE` / `ADMIN`

---

## 3. Intervention & Step-Up APIs

### `POST /api/interventions/step-up`
Dispatches an out-of-band verification challenge.
- **Permission**: `VERIFICATION_TRIGGER`
- **Request Body**:
```json
{
  "callId": "call-sec-demo-101",
  "targetUserId": "u-cfo-real-01",
  "method": "FIDO2_WEBAUTHN_PUSH",
  "reason": "Policy POL-CRED-001 step-up enforcement"
}
```

### `POST /api/interventions/decision`
Records a human SOC decision (Approve, Override, or Reject).
- **Permission**: `CALLS_INTERVENE` or `VERIFICATION_OVERRIDE`
- **Request Body**:
```json
{
  "callId": "call-sec-demo-101",
  "riskAssessmentId": "risk-eval-94812",
  "decision": "APPROVED",
  "reason": "Confirmed suspicious credential solicitation pattern"
}
```
