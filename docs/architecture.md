# VOXSHIELD: System Architecture & Design

## 1. High-Level System Architecture

VOXSHIELD follows a clean, modular tiered architecture consisting of an enterprise Security Operations Center (SOC) Frontend, a Node.js/TypeScript Core Security Backend, a dedicated Python AI Engine Service, a PostgreSQL persistence layer, and a Redis event broker.

```
+-----------------------------------------------------------------------------------+
|                              VOXSHIELD ARCHITECTURE                               |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                            FRONTEND (Next.js / TS)                          |  |
|  |   - SOC Live Dashboard       - Incident Center      - Policy Configurator   |  |
|  |   - Verification Hub         - Audit Explorer       - System Health Matrix  |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        | HTTPS / WSS                              |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  |                        BACKEND SERVICE (Node.js / Express)                  |  |
|  |  +-----------------------+ +-----------------------+ +--------------------+ |  |
|  |  | Auth & RBAC Guard     | | Privacy & Redaction   | | Policy Engine      | |  |
|  |  +-----------------------+ +-----------------------+ +--------------------+ |  |
|  |  | Call Session Manager | | Incident Controller   | | Verification Engine| |  |
|  |  +-----------------------+ +-----------------------+ +--------------------+ |  |
|  |  | Risk Fusion Aggregator| | Audit Logger          | | WebSocket Streamer | |  |
|  |  +-----------------------+ +-----------------------+ +--------------------+ |  |
|  +-------------------+--------------------+--------------------+---------------+  |
|                      |                    |                    |                  |
|                      v                    v                    v                  |
|         +-----------------------+  +--------------+  +-------------------+        |
|         | PostgreSQL Database   |  | Redis Cache  |  | AI Service (Fast) |        |
|         | - Calls & Incidents   |  | & PubSub     |  | - VAD & Acoustic  |        |
|         | - Policies & Audits   |  |              |  | - NLP & Intent    |        |
|         | - Redacted Transcripts|  |              |  | - Risk Fusion     |        |
|         +-----------------------+  +--------------+  +-------------------+        |
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Directory Architecture

```
VOXSHIELD/
│
├── docs/                     # Architectural, threat, security, and research documentation
├── frontend/                 # Next.js 14 SOC web application (TypeScript, Tailwind, React Query)
├── backend/                  # Core backend (Node.js, Express, TypeScript, WebSocket, pg, Redis)
│   ├── src/
│   │   ├── auth/             # JWT, Password hashing, RBAC middleware
│   │   ├── calls/            # Communication adapters & session lifecycle
│   │   ├── incidents/        # Incident management & workflow automation
│   │   ├── policies/         # Deterministic rule evaluation engine
│   │   ├── verification/     # Step-up out-of-band verification coordinator
│   │   ├── risk/             # Explainable multi-factor risk model
│   │   ├── security/         # Privacy firewall, redaction, encryption, audit
│   │   ├── database/         # Migrations, connection pooling, typed repository
│   │   ├── websocket/        # Real-time bidirectional streaming gateway
│   │   └── server.ts         # Main server initialization
│   └── tests/                # Comprehensive Jest test suite
│
├── ai/                       # Dedicated AI analysis microservice (Python / FastAPI)
│   ├── app/
│   │   ├── main.py           # FastAPI application entrypoint
│   │   ├── audio/            # Streaming audio ingest, VAD, preprocessing
│   │   ├── deepfake/         # Deepfake acoustic artifact detection interface
│   │   ├── speaker/          # Biometric speaker verification interface
│   │   ├── replay/           # Replay attack detector interface
│   │   ├── asr/              # Streaming ASR interface
│   │   ├── intent/           # Semantic intent classification interface
│   │   ├── social_engineering/# High-urgency and manipulation detector interface
│   │   ├── sensitive_data/   # Entity detection & tokenization interface
│   │   ├── context/          # Anomaly & baseline deviation interface
│   │   ├── action_risk/      # Financial & operational action scoring interface
│   │   └── fusion/           # Multi-modal risk fusion engine interface
│   └── tests/                # Pytest test suite
│
├── security/                 # System-wide security configurations & schemas
├── integrations/             # Telephony (SIP, WebRTC, Twilio, Asterisk) & SIEM adapters
├── evaluation/               # Benchmark datasets, attack testcases & evaluation plans
├── infrastructure/           # Dockerfiles & deployment configurations
└── docker-compose.yml        # Orchestration definition for local and production deployment
```

---

## 3. Communication & Data Flow

### A. Real-Time Audio Ingestion
1. Telephony or WebRTC stream arrives at the `CommunicationAdapter`.
2. Audio is chunked into standardized temporal frames (e.g. 500ms sliding windows).
3. The chunk is forwarded via high-speed async transport to the AI Service.

### B. Parallel Processing Pipeline
1. **Acoustic Lane**: Analyzes for neural synthesis artifacts, spectral discontinuities, vocoder signatures, and replay markers.
2. **Semantic Lane**: Transcribes chunk via ASR, detects social engineering cues, extracts intent, and flags requested sensitive entities.
3. **Contextual Lane**: Compares caller claims against caller history, transaction value, and organizational baseline.

### C. Redaction & Privacy-First Persistence
1. Before any transcript is logged or stored, the `PrivacyFirewall` inspects text streams for OTPs, CVVs, passwords, or personal credentials.
2. Redacted text (`[AUTHENTICATION_CODE_REDACTED]`) is persisted to PostgreSQL.
3. No raw audio containing sensitive credential bursts is stored without explicit policy exemption and tokenized encryption.

### D. Policy Evaluation & SOC Alerting
1. Risk factors are synthesized into an explainable `RiskAssessment`.
2. The `PolicyEngine` evaluates organizational security rules.
3. If an anomaly is detected, real-time alerts are pushed to the SOC dashboard over WebSockets and an `Incident` is generated.
