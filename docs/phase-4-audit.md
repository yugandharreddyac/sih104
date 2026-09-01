# VOXSHIELD: Phase 4 Architectural Audit & Integration Map

## 1. Existing System Interfaces & Baseline Audit

### A. Audio Input & Normalization Contract (Phase 2)
- **Input Channels**: Browser Web Audio API / Telephony PCM chunks.
- **Canonical Format**: Linear PCM, 16-bit signed little-endian, mono, 16 kHz (`pcm_s16le`).
- **Chunk Size Limit**: 512 KB per frame; bounded buffer memory capped at 5 MB (100 chunks) per call session (`backend/src/calls/stream_buffer.ts`).
- **Phase 4 Ingestion**: ASR engine (`ai/app/asr/`) consumes normalized 16kHz float32 audio arrays directly from the streaming pipeline.

### B. WebSocket Telemetry Contract (`backend/src/websocket/ws_server.ts`)
- **Transport Route**: `/ws` (authenticated full-duplex WebSocket gateway).
- **Existing Message Types**: `AUTHENTICATE`, `START_STREAM`, `AUDIO_CHUNK`, `AUDIO_TELEMETRY`, `STREAM_STATUS`, `END_STREAM`, `SOC_ALERT`, `PING`, `PONG`.
- **Phase 4 Additions**:
  - `ASR_PARTIAL`: Real-time interim transcription stream.
  - `ASR_FINAL`: Finalized conversational turn with timestamp and word confidence.
  - `CONVERSATION_SIGNAL`: Semantic intents, requested actions, and sensitive entity detections.
  - `SOCIAL_ENGINEERING_ALERT`: Multi-turn attack sequences, authority claims, urgency, and verification bypass alerts.

### C. Acoustic Intelligence Layer (Phase 3)
- **Status**: Live multi-domain acoustic engine (`ai/app/deepfake/`, `ai/app/speaker/`, `ai/app/replay/`, `ai/app/audio/manipulation.py`, `ai/app/audio/temporal_aggregator.py`).
- **Acoustic Assessment States**: `AUTHENTICITY_SUPPORTED`, `SUSPICIOUS`, `INCONCLUSIVE`, `INSUFFICIENT_AUDIO`.
- **Phase 4 Interoperability**: Acoustic metadata (e.g. speaker match score, replay cues) feeds alongside conversational semantic signals into the multi-turn state machine and Phase 5 fusion.

### D. Privacy Firewall & Redaction Engine (`backend/src/security/privacy_firewall.ts`)
- **Deterministic Redaction**: 11 categories (numeric OTPs, CVVs, passwords, PINs, credit card numbers, MFA tokens, SSN/Aadhaar/PAN formats).
- **In-Memory Guarantee**: Raw secrets must never reach persistent storage or unredacted audit trails.
- **Phase 4 Contract**: All transcripts and conversational claims must be sanitized via `PrivacyFirewall` prior to database logging or telemetry broadcast.

### E. Role-Based Access Control (RBAC) (`backend/src/auth/rbac.ts`)
- **Roles**: `ADMIN`, `SECURITY_ANALYST`, `SUPERVISOR`, `OPERATOR`, `VIEWER`.
- **Permissions**: `CALLS_READ`, `CALLS_STREAM`, `CALLS_INTERVENE`, `CALLS_TERMINATE`, `INCIDENTS_READ`, `INCIDENTS_WRITE`, `VERIFICATION_TRIGGER`, `USER_MANAGE`.
- **Phase 4 Contract**: Viewing live transcripts and conversational signals requires `CALLS_READ`; managing conversational alert escalation requires `INCIDENTS_WRITE`.

### F. Incident Management & Correlation (`backend/src/incidents/`)
- **Incident Lifecycle**: `OPEN` $\to$ `INVESTIGATING` $\to$ `CONTAINED` $\to$ `RESOLVED` $\to$ `FALSE_POSITIVE`.
- **Phase 4 Integration**: Aggregates high-severity multi-turn social engineering sequences into correlated incident evidence packages rather than spamming individual events.

---

## 2. Integration Points for Phase 4

```
Raw Audio Stream (16kHz PCM)
  ↓
[ Streaming ASR Engine ] ───> Partial/Final Transcripts (EN, HI, TE) + Word Confidence
  ↓
[ Bounded Conversation Memory ] ───> Rolling 10-turn window, Speaker Turn Tracking
  ↓
┌──────────────────────────────────────────────────────────┐
│           CONVERSATIONAL INTELLIGENCE SUITE              │
│                                                          │
│  ├── [ Intent Classifier ] ───> OTP, Payment, Bypass     │
│  ├── [ Sensitive Data Detector ] ───> Request vs Mention │
│  ├── [ Action Extractor ] ───> Disclose, Transfer, Install│
│  ├── [ Claims Extractor ] ───> Authority & Identity      │
│  ├── [ Social Engineering Tactics ] ───> Urgency, Fear   │
│  ├── [ Inconsistency Verifier ] ───> Contradictions      │
│  └── [ Multi-Turn Attack Progression State Machine ]     │
└──────────────────────────────────────────────────────────┘
  ↓
[ Privacy Firewall Redactor ] ───> Deterministic [REDACTED] Sanitization
  ↓
[ Real-Time Conversational Signals & WebSocket Telemetry ]
  ↓
[ Frontend SOC Live Conversation Intelligence Panel ]
```
