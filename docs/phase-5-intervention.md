# VOXSHIELD Phase 5 Step-Up Orchestration & Intervention Engine

## 1. Out-of-Band Step-Up Orchestration Architecture
Step-up verification provides an independent, cryptographically isolated proof of identity that bypasses the potentially compromised audio channel.

### Absolute Security Invariants:
1. **Never Trust In-Call Endpoints**: The system will **never** send an authentication code or verification push to a phone number or email provided verbally by the caller during the active call.
2. **Pre-Registered Identity Providers**: Step-up challenges are dispatched exclusively to verified records stored in the enterprise directory (FIDO2 WebAuthn keys, registered Authenticator apps, enterprise IdP push notifications).
3. **No Voice-Dependent Fallbacks**: Step-up verification never accepts voice confirmation on the same channel as proof of resolution.

---

## 2. Human-in-the-Loop Decision State Machine

```
              ┌────────────────────────┐
              │     AI_RECOMMENDED     │
              └───────────┬────────────┘
                          │ (Evaluated by Policy Engine)
                          ▼
              ┌────────────────────────┐
              │    POLICY_APPROVED     │
              └───────────┬────────────┘
                          │ (Requires SOC Authorization)
                          ▼
              ┌────────────────────────┐
              │     AWAITING_HUMAN     │
              └───────────┬────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
  [ SOC APPROVE ]  [ SOC OVERRIDE ]  [ SOC REJECT ]
         │                │                │
         ▼                ▼                ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │ EXECUTED  │    │OVERRIDDEN │    │ REJECTED  │
   └───────────┘    └───────────┘    └───────────┘
```

### State Definitions:
- `AI_RECOMMENDED`: Multi-modal fusion identified elevated threat and proposed an action.
- `POLICY_APPROVED`: Deterministic policy validated that the action complies with organizational guidelines.
- `AWAITING_HUMAN`: SOC operator is alerted and presented with the explainability summary.
- `EXECUTED`: Operator clicked "Approve" (or emergency low-friction auto-trigger executed per policy).
- `OVERRIDDEN`: Operator clicked "Override" and supplied an audited justification.
- `REJECTED`: Operator marked the event as a false positive.
