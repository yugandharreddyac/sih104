# Phase 4 — AI to Backend Contract Validation Specification & Report

**SIH104 — High-Confidence Deepfake & Social Engineering Voice Fraud Defense System**  
**Module**: AI ↔ Backend Canonical Signal Contract Validation  
**Date**: September 2026  
**Status**: `TESTED` / `IMPLEMENTED`

---

## 1. Executive Summary & Architecture Overview

Phase 4 validates the canonical interface contracts, data transport serialization, schema validation, failure degradation, and numerical robustness between the **Python AI Microservices** (`FastAPI` / `PyTorch` / `Wav2Vec2` / `Whisper` / `RoBERTa`) and the **Node.js / TypeScript Core Backend** (`AcousticService`, `ConversationService`, `RiskService`, `PolicyEngine`).

The system adheres to the non-fabrication principle:
> **The backend MUST NEVER make an unsafe decision (e.g., `0`, `SAFE`, `ALLOW`) because of a malformed, untrusted, or missing AI response.** Missing, corrupt, or out-of-range AI results must safely degrade to explicit `NOT_AVAILABLE` or `INCONCLUSIVE` states with `null` risk scores, recording structured security audit events.

```
Incoming 16 kHz Mono PCM Stream
        │
        ▼
┌────────────────────────────────────────────────────────┐
│                   Acoustic Pipeline                    │
│   Fast Audio Path (160ms chunks / 256ms windows)       │
│                                                        │
│   Python AI Services:                                  │
│   - Deepfake Spoof Probability [0.0 - 1.0]             │
│   - Speaker Cosine Similarity [0.0 - 1.0]              │
│   - Replay Acoustic Score [0.0 - 1.0]                  │
│   - VAD Voice Activity Probability [0.0 - 1.0]         │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ Canonical HTTP/REST Payloads
┌────────────────────────────────────────────────────────┐
│             TypeScript Backend AI Clients              │
│   - Schema Validation & Numerical Bounds Checking      │
│   - NaN / Infinity / String / Negative Sanitization    │
│   - Timeout & Circuit-Breaker Degradation              │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ Canonical Signal Events
┌────────────────────────────────────────────────────────┐
│           Conversation & NLP Pipeline (Async)          │
│   - Whisper ASR (Bounded 2-3s Speech Segments)         │
│   - RoBERTa Intent & Social Engineering Classification │
│   - PII / Privacy Firewall Redaction                   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ Multi-Modal Threat Matrix
┌────────────────────────────────────────────────────────┐
│            Unified Risk Fusion & Policy Engine         │
│   - Cross-Modal Contradiction Preservation             │
│   - Explicit Status Semantics & Zero-Fabrication       │
│   - Deterministic Security Rule Enforcement            │
└────────────────────────────────────────────────────────┘
```

---

## 2. Canonical Signal Contracts

Every AI signal consumed by the backend adheres to explicit status, confidence, uncertainty, score, and error semantics.

### 2.1 Deepfake Detection Contract
- **Service Endpoint**: `POST http://localhost:8001/analyze/acoustic`
- **Output Fields**:
  - `is_deepfake`: `boolean`
  - `spoof_probability`: `number` in `[0.0, 1.0]`
  - `bona_fide_probability`: `number` in `[0.0, 1.0]`
  - `confidence`: `number` in `[0.0, 1.0]`
  - `uncertainty`: `number` in `[0.0, 1.0]`
  - `status`: `"DETECTED" | "NOT_DETECTED" | "INCONCLUSIVE" | "NOT_AVAILABLE" | "ERROR"`
  - `model_version`: `string`
- **Degradation Semantics**: If `spoof_probability` is missing or out-of-range (`< 0` or `> 1` or `NaN`), backend assigns `status: NOT_AVAILABLE` and `confidence: 0`. A low deepfake probability (`0.01`) **never** cancels or overrides concurrent social engineering or replay signals.

### 2.2 Speaker Verification Contract
- **Service Endpoint**: `POST http://localhost:8001/analyze/acoustic`
- **Output Fields**:
  - `speaker_match`: `boolean | null`
  - `similarity_score`: `number` in `[0.0, 1.0]`
  - `enrolled_reference_id`: `string | null`
  - `confidence`: `number` in `[0.0, 1.0]`
  - `status`: `"MATCH" | "MISMATCH" | "NOT_ENROLLED" | "INCONCLUSIVE" | "ERROR"`
- **Critical Policy**: If a speaker profile is missing (`NOT_ENROLLED`), the backend assigns `similarity_score = null` and `status = "NOT_ENROLLED"`. Missing speaker enrollment is **never** interpreted as a verified caller.

### 2.3 Replay Detection Contract
- **Service Endpoint**: `POST http://localhost:8001/analyze/acoustic`
- **Output Fields**:
  - `is_replay`: `boolean`
  - `replay_score`: `number` in `[0.0, 1.0]`
  - `confidence`: `number` in `[0.0, 1.0]`
  - `spectral_artifacts`: `string[]`
  - `status`: `"DETECTED" | "NOT_DETECTED" | "INCONCLUSIVE" | "ERROR"`

### 2.4 Server-Side ASR Contract
- **Service Endpoint**: `POST http://localhost:8002/analyze/conversation`
- **Output Fields**:
  - `transcript`: `string` (sanitized through Privacy Firewall)
  - `asr_confidence`: `number` in `[0.0, 1.0]`
  - `language`: `string` (ISO 639-1)
  - `status`: `"AVAILABLE" | "NOT_AVAILABLE" | "ERROR"`
- **Trust Boundary**: Client-provided transcript hints (`textTranscript`) are treated as untrusted and never trigger security policies without server-side verification. An empty transcript does **not** equal "no threat".

### 2.5 Intent & Social Engineering Contract
- **Service Endpoint**: `POST http://localhost:8002/analyze/conversation`
- **Output Fields**:
  - `intent_category`: `"BENIGN" | "OTP_SOLICITATION" | "PASSWORD_RESET" | "WIRE_TRANSFER" | "MFA_BYPASS" | "AUTHORITY_IMPERSONATION" | "COERCION"`
  - `intent_confidence`: `number` in `[0.0, 1.0]`
  - `social_engineering_tactics`: `string[]`
  - `social_engineering_score`: `number` in `[0.0, 1.0]`
  - `urgency_level`: `"LOW" | "MEDIUM" | "HIGH" | "CRITICAL"`
  - `coercion_score`: `number` in `[0.0, 1.0]`
  - `credential_harvesting`: `boolean`
  - `financial_fraud_indicators`: `string[]`

---

## 3. Status & Value Semantics Matrix

The system enforces strict semantic separation between operational and analytical states:

| Status Code | Semantics | Numeric Score | Uncertainty | Triggers Policy? |
| :--- | :--- | :--- | :--- | :--- |
| **`DETECTED`** | Threat modality detected above confidence threshold | Finite `[0.0, 1.0]` | Low `[0.0, 0.3]` | **Yes** (Evaluated against rules) |
| **`NOT_DETECTED`** | Modality analyzed, confirmed bona fide | Finite `[0.0, 1.0]` | Low `[0.0, 0.3]` | **No** (Subject to other modalities) |
| **`INCONCLUSIVE`** | Modality analyzed, high ambiguity/borderline score | Moderate | High `[0.5, 1.0]` | **Requires Step-Up Verification** |
| **`NOT_AVAILABLE`** | Service offline, timeout, network error, unconfigured | `null` | `1.0` (Max) | **Never converts to SAFE/ALLOW** |
| **`ERROR`** | Corrupted payload, malformed JSON, NaN/Infinity | `null` | `1.0` (Max) | **Audit Event & Graceful Degradation** |

---

## 4. Numerical Validation & Boundary Enforcement

The backend validator (`isValidAcousticResponse`, `isValidConversationResponse`, `isValidRiskResponse`) strictly checks:

1. **Finiteness**: `Number.isFinite(v)` rejects `NaN`, `+Infinity`, `-Infinity`.
2. **Range Bounds**: Probabilities and normalized scores must satisfy `0.0 <= score <= 1.0`. Scores exceeding `1.0` or `< 0.0` are rejected.
3. **Type Safety**: Reject strings (`"0.95"`, `"high"`), objects, arrays, `null`, and `undefined` in numeric fields.
4. **Finite Degradation**: If an AI service produces invalid numeric values, the backend degrades to `overall_risk_score = null`, `status = "INCONCLUSIVE" / "NOT_AVAILABLE"`, and sets `confidence = 0`.

---

## 5. AI Failure Matrix & Behavioral Guarantees

| Failure Scenario | AI Output / Response | Backend Status | Policy Engine Action | Audit Trail Recorded |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP Timeout (>1500ms)** | Request Aborted | `NOT_AVAILABLE` | Retain prior state or enforce default step-up | `ACOUSTIC_AI_UNAVAILABLE` |
| **HTTP 500 / 503** | Server Error / JSON | `NOT_AVAILABLE` | Retain prior state or enforce default step-up | `CONVERSATION_AI_UNAVAILABLE` |
| **Network Unreachable** | `ECONNREFUSED` | `NOT_AVAILABLE` | Retain prior state or enforce default step-up | `RISK_FUSION_UNAVAILABLE` |
| **Malformed JSON** | `{"invalid":` | `ERROR` / `INCONCLUSIVE` | Rejects payload, `score = null` | `MALFORMED_AI_RESPONSE` |
| **NaN / Infinity Score** | `{"score": NaN}` | `ERROR` / `INCONCLUSIVE` | Rejects payload, `score = null` | `INVALID_NUMERIC_SCORE` |
| **Missing Modality** | `{}` | `NOT_AVAILABLE` | Multi-modal fusion with remaining signals | `DEGRADED_FUSION` |

---

## 6. Cross-Modal Contradiction Handling

The Risk Engine preserves multi-modal contradictions without allowing any single modality to suppress independent danger signals:

1. **High Deepfake + Strong Speaker Match**:
   - *Risk*: Synthetic voice cloning attacking an authorized account.
   - *Decision*: **`BLOCK_CALL`** or **`REQUIRE_STEP_UP_VERIFICATION`**. High acoustic similarity to enrollment does not override high synthetic spoof probability.
2. **Low Deepfake + Credential / OTP Solicitation**:
   - *Risk*: Live human social engineering / phishing attack.
   - *Decision*: **`BLOCK_DISCLOSURE`** / **`CRITICAL_RISK`**. Bona fide voice probability does not decrease conversational threat severity.
3. **Replay Detected + Strong Speaker Match**:
   - *Risk*: Replay of genuine voice recording.
   - *Decision*: **`SUSPICIOUS_REPLAY`** / Step-up authentication required.
4. **Strong Identity + Urgent High-Value Wire Transfer**:
   - *Risk*: Authorized user under coercion or compromised account.
   - *Decision*: **`REQUIRE_STEP_UP_VERIFICATION`** (Out-of-band push confirmation).

---

## 7. Multi-Call Correlation & Concurrency Isolation

- Tested with **5 and 10 simultaneous concurrent calls** (`call-c-1` through `call-c-10`).
- Each call processes independent audio streams, ASR transcripts, and risk assessments.
- **Results**:
  - `0` cross-call contamination.
  - `0` stale results applied to wrong sessions.
  - Correct transcript and risk score correlation verified across all concurrent sessions.

---

## 8. Privacy & Data Protection Boundary

- **Server-Side Sanitization**: `PrivacyFirewall` redacts numeric OTPs (`\b\d{4,8}\b`), CVVs, credit cards (16-digit Luhn candidates), MFA bypass codes, and cleartext passwords before persistence or telemetry emission.
- **Audit Trails**: Security audit events record metadata hashes, call IDs, and sanitized reason strings without storing raw credentials or unredacted transcripts.

---

## 9. Verification & Test Execution Results

| Test Suite | Components Tested | Total Tests | Passed | Failed | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AI ↔ Backend Contract Tests** | Deepfake, Speaker, Replay, ASR, NLP, Bounds, Matrix, Concurrency | 34 | 34 | 0 | `TESTED` |
| **Backend Integration Suite** | Auth, Calls, WebSocket, Policy, Incidents, Audit, Stream Normalizer | 184 | 184 | 0 | `TESTED` |
| **Frontend Production Build** | Next.js 14 SSR/SSG type check and bundle compilation | 12 routes | 12 routes | 0 | `TESTED` |
| **Python AI Suite** | ASR, VAD, Deepfake, Feature Extraction, Risk Fusion PyTest | 102 | 102 | 0 | `TESTED` |

---

## 10. Limitations & Boundaries

1. **Software Contract vs. Scientific Accuracy**:
   - Status: `TESTED` (Software interface and degradation contracts).
   - Status: `NOT VERIFIED` (Model biometric accuracy, real-world EER, and out-of-distribution acoustic generalization under severe line noise are outside the scope of Phase 4).
2. **Simulated Hardware Concurrency**:
   - Tested under Node.js async event loop and Jest environment for up to 10 concurrent calls. Real-world multi-tenant scaling beyond 100 concurrent streams requires horizontal GPU worker orchestration.
