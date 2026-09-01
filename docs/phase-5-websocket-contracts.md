# VOXSHIELD Phase 5 WebSocket Real-Time Contracts

## 1. Gateway Route & Handshake
- **Route**: `ws://localhost:3000/ws`
- **Protocol**: JSON-RPC over secure WebSocket.
- **Authentication**: JWT token exchange via `AUTHENTICATE` frame.

---

## 2. Real-Time Telemetry Message Schemas

### A. `UNIFIED_RISK_ASSESSMENT`
Broadcasts the complete 10-dimensional risk assessment and evidence summary to connected SOC consoles.
```json
{
  "type": "UNIFIED_RISK_ASSESSMENT",
  "callId": "call-sec-demo-101",
  "sequenceNumber": 4,
  "payload": {
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
      "Biometric speaker mismatch against claimed CFO identity."
    ],
    "evidence_graph": [
      { "layer": "Acoustic", "cue": "Speaker similarity 0.38 (Threshold 0.70)" },
      { "layer": "Semantic", "cue": "Solicited OTP [REDACTED] with high urgency" }
    ],
    "policy_recommendation": {
      "policy_id": "POL-CRED-001",
      "action": "REQUIRE_STEP_UP_VERIFICATION"
    }
  },
  "timestamp": "2026-09-01T00:20:00Z"
}
```

### B. `POLICY_ENFORCEMENT_TRIGGER`
Emitted immediately when a critical policy rule fires.
```json
{
  "type": "POLICY_ENFORCEMENT_TRIGGER",
  "callId": "call-sec-demo-101",
  "payload": {
    "policy_id": "POL-CRED-001",
    "action": "REQUIRE_STEP_UP_VERIFICATION",
    "requires_human_approval": true,
    "explanation": "High-risk credential harvesting detected."
  },
  "timestamp": "2026-09-01T00:20:00Z"
}
```

### C. `HUMAN_DECISION_EVENT`
Emitted when an operator approves, overrides, or rejects an intervention.
```json
{
  "type": "HUMAN_DECISION_EVENT",
  "callId": "call-sec-demo-101",
  "payload": {
    "operator_id": "u-analyst-01",
    "decision": "APPROVED",
    "action_executed": "STEP_UP_VERIFICATION_CHALLENGE"
  },
  "timestamp": "2026-09-01T00:20:05Z"
}
```
