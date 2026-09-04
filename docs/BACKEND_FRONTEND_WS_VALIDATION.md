# Backend → Frontend / WebSocket Contract Validation Report (Phase 5)

**System**: SIH104 / VoxShield Voice Security Gateway  
**Role**: Member 1 / Technical Lead  
**Phase**: Phase 5 — Backend → WebSocket → Frontend Contract Validation  
**Branch**: `feature/member1-core`  
**Base Commit**: `45e0fac`  

---

## 1. Executive Summary & Architecture Overview

Phase 5 validates the end-to-end security contract from the Backend multi-modal risk engine through the real-time WebSocket Gateway down to the Next.js SOC operator `/calls` user interface.

```
+-------------------------------------------------------------------------+
|                  BACKEND RISK & POLICY INTELLIGENCE                     |
|                                                                         |
|  +--------------------+   +---------------------+   +----------------+  |
|  | Acoustic Service   |   | Conversation Service|   | Risk Service   |  |
|  | - Deepfake Spoof   |   | - VAD Buffer / ASR  |   | - 10D Fusion   |  |
|  | - Speaker Biometric|   | - Social Engineering|   | - Trajectory   |  |
|  | - Replay Injection |   | - Privacy Redaction |   | - Contradiction|  |
|  +---------+----------+   +----------+----------+   +-------+--------+  |
|            |                         |                      |           |
|            +-------------------------+----------------------+           |
|                                      |                                  |
|                         +------------v------------+                     |
|                         |  Policy Engine / Rules  |                     |
|                         |  (BLOCK / STEP-UP/ALLOW)|                     |
|                         +------------+------------+                     |
+--------------------------------------|----------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------+
|                     WEBSOCKET GATEWAY (ws_server.ts)                    |
|                                                                         |
|  - Strict JWT Authentication (`AUTHENTICATE`) Handshake                 |
|  - Role-Based Access Control (RBAC: `calls:stream`)                     |
|  - Multi-Tenant Organization Isolation (`organizationId`)               |
|  - Automatic Secret Redaction (`PrivacyFirewall.sanitize`)              |
|  - Non-Blocking Broadcast Gateway                                       |
+--------------------------------------|----------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------+
|                   FRONTEND SOC INTERFACE (/calls Page)                  |
|                                                                         |
|  - Call / Session Correlation Filter (`selectedCallId`)                |
|  - Sequence-Numbered Stale Frame Rejection (`latestRiskSeqRef`)         |
|  - Deterministic Traffic-Light HUD & 10D Threat Matrix Rendering       |
|  - Fail-Safe UI Rule: Missing/null AI -> GRAY (NEVER FALSE GREEN)       |
+-------------------------------------------------------------------------+
```

---

## 2. WebSocket Event Contracts & Schemas

| WebSocket Event | Direction | Producer | Consumer | Status | Description |
|---|---|---|---|---|---|
| `CONNECTED` | S → C | WebSocket Gateway | Frontend Client | **TESTED** | Initial connection handshake requiring client authentication. |
| `AUTHENTICATE` | C → S | Frontend Client | WebSocket Gateway | **TESTED** | Client sends JWT bearer token for role and tenant validation. |
| `AUTHENTICATED` | S → C | WebSocket Gateway | Frontend Client | **TESTED** | Server acknowledges valid JWT with user profile details. |
| `START_STREAM` | C → S | Frontend Client | Call Manager | **TESTED** | Operator starts streaming session for authenticated `callId`. |
| `STREAM_STARTED` | S → C | WebSocket Gateway | Frontend Client | **TESTED** | Confirms stream initialization and audio format (`PCM_16K_MONO`). |
| `AUDIO_CHUNK` | C → S | Frontend Client / Ingest | Ingest Pipeline | **TESTED** | Base64-encoded PCM audio frames with sequence numbers. |
| `AUDIO_TELEMETRY` | S → C | Acoustic Engine | /calls HUD | **TESTED** | RMS level, VAD status, model states without raw PCM buffers. |
| `ASR_FINAL` | S → C | Async ASR Engine | Transcript Log | **TESTED** | Final turn transcript with sensitive PII/OTP redacted. |
| `SOCIAL_ENGINEERING_ALERT` | S → C | NLP Engine | SOC Threat Feed | **TESTED** | Real-time social engineering tactic and progression alerts. |
| `UNIFIED_RISK_ASSESSMENT` | S → C | Multi-Modal Fusion | Risk HUD / Matrix | **TESTED** | Authoritative 10-dimensional risk score and trajectory. |
| `POLICY_ENFORCEMENT_TRIGGER` | S → C | Policy Engine | SOC Banner / Modal| **TESTED** | Enforces `BLOCK_DISCLOSURE`, `REQUIRE_STEP_UP`, `WARN_OPERATOR`. |
| `SOC_ALERT` | S → C | Alerting Broadcaster | Global SOC Feed | **TESTED** | Sanitized incident notifications broadcast to tenant users. |
| `END_STREAM` | C → S | Frontend Client | Stream Manager | **TESTED** | Graceful audio stream termination and buffer flush. |
| `STREAM_ENDED` | S → C | WebSocket Gateway | Frontend Client | **TESTED** | Confirms stream teardown and final audit recording. |
| `ERROR` | S → C | WebSocket Gateway | Frontend Error UI | **TESTED** | Standardized error payload (`code`, `message`, `timestamp`). |

---

## 3. Canonical Risk Payload Schema

The `UNIFIED_RISK_ASSESSMENT` payload represents the single source of truth for security decisions:

```json
{
  "status": "AVAILABLE",
  "call_id": "c-9281-vox",
  "stream_id": "stream-1725430000",
  "turn_index": 3,
  "overall_risk_score": 85.0,
  "risk_level": "HIGH",
  "confidence": 0.92,
  "uncertainty": 0.08,
  "dimensions": {
    "deepfake_synthetic": 10.0,
    "identity_impersonation": 20.0,
    "replay_injection": 5.0,
    "social_engineering": 80.0,
    "credential_theft": 85.0,
    "financial_fraud": 60.0,
    "account_takeover": 75.0,
    "verification_bypass": 70.0,
    "inconsistency": 15.0,
    "overall": 85.0
  },
  "risk_velocity": 5.0,
  "risk_trajectory_trend": "RISING",
  "primary_drivers": [
    "Credential Harvesting Attempt detected in turn 3"
  ],
  "contradicting_signals": [],
  "evidence_graph": {
    "nodes": [{ "cue": "OTP Solicitation", "layer": "NLP" }],
    "edges": []
  },
  "policy_recommendation": {
    "action": "BLOCK_DISCLOSURE",
    "is_triggered": true,
    "target": "AGENT",
    "reason": "Active OTP solicitation detected"
  },
  "fusion_latency_ms": 2.5,
  "timestamp": "2026-09-04T12:00:00.000Z"
}
```

---

## 4. Frontend Traffic-Light & Fail-Safe Rendering Rules

The frontend UI at `/calls` enforces strict deterministic mapping from the backend payload:

| Backend `risk_level` | `overall_risk_score` | Frontend Traffic Light | UI State Label | Policy Action Displayed |
|---|---|---|---|---|
| `LOW` / `SAFE` | Valid number (0.0 – 34.0) | 🟢 **GREEN** | Low Risk / Secure | Nominal / Allow |
| `ELEVATED` / `GUARDED` | Valid number (35.0 – 69.0) | 🟡 **YELLOW** | Elevated Risk | Monitor / Warn Operator |
| `HIGH` | Valid number (70.0 – 89.0) | 🔴 **RED** | High Risk | Restrict / Step-Up |
| `CRITICAL` | Valid number (90.0 – 100.0)| 🔴 **RED (Flashing)** | Critical Threat | Block Disclosure / Terminate |
| `INCONCLUSIVE` | Any / `null` | ⚪ **GRAY** | Inconclusive | Manual Verification |
| `NOT_AVAILABLE` | `null` | ⚪ **GRAY** | AI Unavailable | Fail-Safe Degraded |
| Malformed / Missing | `null` / `undefined` / `NaN` | ⚪ **GRAY** | Degraded State | Require Step-Up |

### Mandatory Fail-Safe Rules:
1. **Never False Green**: An unavailable, uninitialized, or degraded AI engine (`overall_risk_score === null` or `NaN`) **NEVER** defaults to `0` or `GREEN / SAFE / ALLOW`. It renders as `GRAY / NOT_AVAILABLE`.
2. **Authoritative Backend**: The frontend **NEVER** re-calculates risk scores or overrides backend policy actions (`BLOCK_DISCLOSURE`, `REQUIRE_STEP_UP_VERIFICATION`).
3. **Contradiction Preservation**: If voice deepfake score is `0.02` (authentic human) but transcript exhibits OTP solicitation, the frontend displays `CRITICAL RISK` and `BLOCK_DISCLOSURE`, adhering to multi-modal fusion.

---

## 5. Security, Multi-Tenancy & Privacy Review

### Authentication & RBAC (`TESTED`)
- Anonymous sockets receive `CONNECTED` with `requiresAuth: true`. All streaming requests (`START_STREAM`, `AUDIO_CHUNK`) prior to `AUTHENTICATE` are rejected with `UNAUTHENTICATED`.
- Valid JWT tokens verify user role and tenant organization.
- Sockets with role `VIEWER` attempting `calls:stream` are rejected with `403 FORBIDDEN`.

### Multi-Tenant Isolation (`TESTED`)
- Calls belonging to Organization 1 (`00000000-0000-0000-0000-000000000001`) are rejected when accessed by an Operator from Organization 2 (`00000000-0000-0000-0000-000000000002`).
- WebSocket broadcast dispatcher checks client authentication and tenant ID. Cross-tenant broadcasts are strictly prevented.

### Concurrent Call Session Correlation (`TESTED`)
- Tested with 5 simultaneous concurrent active streams.
- Each WebSocket client receives telemetry and risk assessments strictly correlated with its own `callId`.
- No cross-call telemetry leakage occurred.

### Event Ordering & Stale State Prevention (`TESTED`)
- `latestRiskSeqRef` tracks monotonic sequence numbers.
- When an out-of-order delayed frame (e.g. sequence 2 arriving after sequence 3) is received, the frontend drops the stale frame and preserves the higher sequence state.

### Privacy Firewall & Secrets Redaction (`TESTED`)
- `ASR_FINAL` and `SOC_ALERT` messages pass through `PrivacyFirewall.sanitize()`.
- One-time passwords (`"OTP code 839201"`), credit card numbers (`"4532 0150 2849 1920"`), CVVs (`"CVV 891"`), and passwords (`"secretPassword123"`) are automatically masked to `[AUTHENTICATION_CODE_REDACTED]`, `[CARD_NUMBER_REDACTED]`, `[CVV_REDACTED]`, and `[PASSWORD_REDACTED]`.
- No raw PCM audio chunks are persisted or returned in `AUDIO_TELEMETRY`.

---

## 6. Verification & Test Execution Results

| Test Category | Suite File | Total Tests | Passed | Result |
|---|---|---|---|---|
| **Phase 5 WS Contract Tests** | `backend/tests/websocket_frontend_contract.test.ts` | 21 | 21 | **PASS** |
| **Full Backend Regression** | `backend/tests/*.test.ts` (18 suites) | 205 | 205 | **PASS** |
| **Frontend Production Build** | Next.js 14 `npm run build` | 12 routes | 12 | **PASS (0 errors)** |
| **AI Python Test Suite** | `ai/tests/test_*.py` | 102 | 102 | **PASS** |

---

## 7. Status Labels & System Limitations

- **Backend Risk Engine & Fusion**: `IMPLEMENTED`, `TESTED`
- **WebSocket Gateway & Auth**: `IMPLEMENTED`, `TESTED`
- **Multi-Tenant Isolation**: `IMPLEMENTED`, `TESTED`
- **Fail-Safe UI Rendering**: `IMPLEMENTED`, `TESTED`
- **Privacy Firewall Redaction**: `IMPLEMENTED`, `TESTED`
- **Live Carrier / PSTN Telephony**: `NOT VERIFIED` *(Mocked WebSockets & 16 kHz PCM buffers used for validation; no live telephony claimed)*
- **Persistent Durable Event Replay After Reconnect**: `NOT AVAILABLE` *(System relies on fresh real-time state broadcasts upon reconnection rather than durable broker replay)*
