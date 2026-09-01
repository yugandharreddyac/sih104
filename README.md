# VOXSHIELD: AI-Powered Real-Time Voice Impersonation, Social Engineering & Fraud Prevention Platform

> **Official Problem Statement:** *"AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks"*
> 
> **Core Axiom:** *"A voice being genuine does not automatically make the interaction trustworthy."*

---

## 1. Overview & Phase 1 Scope

VOXSHIELD is a real-time cybersecurity defense platform that operates alongside existing enterprise telephony, PBX, and contact-center environments. It defends organizations against AI voice cloning, deepfake audio synthesis, real-time voice conversion, speaker impersonation, credential harvesting, and multi-turn social engineering fraud.

### Phase 4 — Conversational Intelligence & Streaming ASR
- **Streaming Multilingual ASR Engine**: Word-level timestamps, partial/final segment emissions, confidence estimation, and multilingual detection (English, Hindi, Telugu).
- **Bounded Conversation Context Engine**: In-memory rolling turn history (20 turns, max 4KB) with conversation phase tracking.
- **Contextual Intent Classifier**: Multi-token classification for OTP, wire transfer, remote access, and credential harvesting.
- **Situational Sensitive Data Gating**: Distinguishes benign defensive mentions vs. adversarial direct requests with pre-persistence redaction (`[REDACTED]`).
- **Behavioral Social Engineering Tactics**: Extracts Authority, Urgency, Fear, Secrecy, Isolation, and Verification Bypass.
- **Multi-Turn Attack Sequence State Machine**: Tracks progression from identity establishment to critical action exploitation.

### Phase 5 — Multi-Modal Risk Fusion, Policy Enforcement & Step-Up Intervention
- **Unified 10-Dimensional Risk Model**: Evaluates threat across Overall, Identity, Deepfake, Replay, Social Engineering, Credential Theft, Financial Fraud, Account Takeover, Verification Bypass, and Inconsistency dimensions.
- **Cross-Modal Corroboration & Uncertainty Damping**: Scales threat confidence under multi-source alignment while dampening certainty on degraded audio ($SNR < 6\text{ dB}$).
- **Temporal Risk Dynamics & Velocity**: Tracks rate of escalation ($\Delta R / \Delta t$) and trajectory over rolling call windows.
- **Evidence Graph (DAG)**: Constructs directed acyclic graph linking physical acoustic cues to semantic findings and policy triggers.
- **Deterministic Policy Engine**: Enforces precedence-driven rules (`EMERGENCY` > `CREDENTIAL` > `FINANCIAL` > `MONITOR`) with versioned audit trails.
- **Out-of-Band Step-Up Orchestration**: Dispatches independent identity challenges to pre-registered hardware devices and IdP push endpoints.
- **Human-in-the-Loop Decision Workflow**: State transitions preserving AI advice vs. human authorization (`AI_RECOMMENDED` $\to$ `POLICY_APPROVED` $\to$ `AWAITING_HUMAN` $\to$ `EXECUTED`).
- **Live SOC Command Center**: Real-time 10-dimensional radar/meter HUD, risk velocity ticker, evidence graph viewer, and human intervention controls.

---

## 2. System Architecture

```
VOXSHIELD/
│
├── docs/                     # Comprehensive engineering & scientific documentation
│   ├── problem-statement.md
│   ├── threat-model.md
│   ├── attack-taxonomy.md
│   ├── requirements.md
│   ├── architecture.md
│   ├── privacy-model.md
│   ├── security-model.md
│   ├── evaluation-plan.md
│   └── research-contribution.md
│
├── frontend/                 # Next.js 14 SOC Dashboard (TypeScript, Tailwind CSS, Lucide)
├── backend/                  # Node.js Core Backend (Express, TypeScript, WebSocket, pg, Redis)
├── ai/                       # AI Service (Python FastAPI, Modular Detection Interfaces)
├── security/                 # Shared security specifications & types
├── integrations/             # Telephony (SIP), VoIP (WebRTC), IdP, and SIEM connectors
├── evaluation/               # Benchmark datasets, attack models & evaluation metrics
├── infrastructure/           # Dockerfiles & PostgreSQL schema initialization
└── docker-compose.yml        # Orchestration definition for full local stack
```

---

## 3. Quickstart & Local Execution

### Option A: Running with Docker Compose (Single Command)
```bash
docker-compose up --build
```
This boots all 5 containers:
1. **PostgreSQL** (Port `5432`): Database with all 17 schema tables and default roles
2. **Redis** (Port `6379`): In-memory cache & event broker
3. **AI Service** (Port `8000`): FastAPI AI engine endpoints & health check
4. **Backend** (Port `4000`): Node.js Core API & WebSocket gateway
5. **Frontend** (Port `3000`): SOC Web Application console

---

### Option B: Running Standalone Locally

#### 1. Backend Service
```bash
cd backend
npm install
npm run dev
# Backend runs on http://localhost:4000
```

#### 2. AI Service
```bash
cd ai
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# AI Service runs on http://localhost:8000
```

#### 3. Frontend Web SOC
```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:3000
```

---

## 4. Default Credentials (SOC Console)

| Role | Email | Password |
| :--- | :--- | :--- |
| **`ADMIN`** | `admin@voxshield.security` | `VoxShield@2026!` |
| **`SECURITY_ANALYST`** | `analyst@voxshield.security` | `VoxShield@2026!` |
| **`SUPERVISOR`** | `supervisor@voxshield.security` | `VoxShield@2026!` |
| **`OPERATOR`** | `operator@voxshield.security` | `VoxShield@2026!` |
| **`VIEWER`** | `viewer@voxshield.security` | `VoxShield@2026!` |

---

## 5. Automated Test Suite Execution

### Backend Test Suite (Auth, RBAC, Privacy Firewall, Policies, Incidents, Audits)
```bash
cd backend
npm test
```

### AI Service Test Suite (FastAPI Health & Modular Interface Statuses)
```bash
cd ai
pytest
```

---

## 6. Phase 2 Roadmap
- [ ] PyTorch & ONNX neural acoustic model integration for deepfake vocoder detection
- [ ] Silero / WebRTC VAD streaming audio chunker
- [ ] Streaming Whisper / Conformer ASR engine
- [ ] Fine-tuned NLP classifier for multi-turn social engineering & urgency tactics
- [ ] Zero-shot NER sensitive entity extraction
- [ ] Live SIP trunking with Asterisk / FreeSWITCH / Twilio
