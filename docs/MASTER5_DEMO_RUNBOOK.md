# MASTER 5 — CANONICAL SIH DEMO RUNBOOK
**Project**: VOXSHIELD — Real-Time Voice Fraud Defense Platform  
**Target Evaluation**: Smart India Hackathon (SIH) Technical Jury Evaluation  
**Version**: 1.0.0 (Master 5 Verified)

---

## 1. System Prerequisites & Environment Setup

VOXSHIELD can run in full microservice mode (with Docker PostgreSQL & Redis) or in standalone standalone/fallback mode using in-memory stores.

### 1.1 Port Allocation
| Service | Technology | Default Port | Health Probe |
|---|---|---|---|
| **Frontend Console** | Next.js 14 | `3000` | `http://localhost:3000` |
| **Backend Core API** | Node.js / TypeScript | `4000` | `http://localhost:4000/api/health` |
| **AI Microservice** | FastAPI / PyTorch | `8000` | `http://localhost:8000/health` |
| **PostgreSQL** (Optional) | PostgreSQL 16 | `5432` | TCP `5432` |
| **Redis** (Optional) | Redis 7.2 | `6379` | TCP `6379` |

### 1.2 Environment Configuration

#### Backend (`backend/.env`)
```bash
PORT=4000
NODE_ENV=development
JWT_SECRET=voxshield-production-demo-secret-key-2026
AI_SERVICE_URL=http://localhost:8000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/voxshield
REDIS_URL=redis://localhost:6379
STRICT_PERSISTENCE=false
```
*(Note: If `STRICT_PERSISTENCE=false`, the backend gracefully operates in degraded in-memory mode if PostgreSQL/Redis are not running).*

#### AI Microservice (`ai/.env`)
```bash
AI_PORT=8000
DEVICE=cpu
MODEL_CACHE_DIR=./models
LOG_LEVEL=INFO
```

#### Frontend (`frontend/.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
```

---

## 2. Service Startup Sequence

Follow this exact order to start all VOXSHIELD tiers:

### Step 1: Start AI Microservice (Terminal 1)
```powershell
cd C:\Users\anves\OneDrive\Desktop\projects\sih104\ai
.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*Verification*: Open `http://localhost:8000/health` in browser or curl. Expect:
`{"status":"healthy","models_loaded":true}`

### Step 2: Start Backend Core API (Terminal 2)
```powershell
cd C:\Users\anves\OneDrive\Desktop\projects\sih104\backend
npm run dev
```
*Verification*: Open `http://localhost:4000/api/health`. Expect:
`{"status":"HEALTHY","timestamp":"..."}`

### Step 3: Start Frontend Analyst Console (Terminal 3)
```powershell
cd C:\Users\anves\OneDrive\Desktop\projects\sih104\frontend
npm run dev
```
*Verification*: Open `http://localhost:3000` in browser. The VOXSHIELD dashboard will load.

---

## 3. Canonical Demonstration Scenarios

### Scenario A: Benign Legitimate Banking Inquiry (Baseline)
- **Objective**: Demonstrate low false-positive rate and seamless customer journey.
- **Input Conversation**:
  > Customer: "Hello, I would like to check the current balance on my savings account ending in 4102."  
  > Agent: "Certainly, let me verify your voice biometric."
- **Execution**:
  1. In the Frontend, navigate to `/calls` and click **"Simulate Live Ingestion"**.
  2. Select **"Scenario A: Normal Human Interaction"**.
- **Engine Analysis**:
  - Speaker Biometrics: Match score `0.88` (Threshold: `0.70` - MATCH).
  - Anti-Spoofing: Deepfake probability `0.04`, Replay probability `0.02`.
  - Intent / Social Engineering: `GENERAL_INQUIRY`, Pressure `0.00`.
- **Fused Decision**:
  - **Overall Risk**: `0.06` (`LOW` - Green).
  - **Policy Action**: `ALLOW`.
  - **Analyst Console**: Displays clean green status, customer verified.

---

### Scenario B: AI Voice Clone / Deepfake Impersonation
- **Objective**: Detect synthetic voice cloning and block fraud in real time.
- **Input Conversation**:
  > Synthetic Voice (Generated via TTS): "Good afternoon, this is senior manager Ramesh. I am authorizing an urgent offshore wire transfer for account 9981."
- **Execution**:
  1. Navigate to `/calls` -> Click **"Scenario B: Synthetic Deepfake Impersonation"**.
- **Engine Analysis**:
  - Speaker Biometrics: Mismatch score (Similarity `0.32` vs enrolled customer).
  - Anti-Spoofing: High-frequency spectral rolloff anomaly detected; Deepfake probability `0.94`.
  - Replay Defense: Transmission distortion flagged.
- **Fused Decision**:
  - **Overall Risk**: `0.92` (`CRITICAL` - Red).
  - **Policy Action**: `REQUIRE_STEP_UP_VERIFICATION` + `BLOCK_TRANSACTION`.
- **Analyst Console Action**:
  - Flash warning appears on UI: **"CRITICAL: Synthetic Voice Clone Detected"**.
  - Audio waveform highlights spectral anomalies.
  - An automated incident `INC-xxxx` is created with biometric evidence package.

---

### Scenario C: Social Engineering & Urgent OTP Extraction
- **Objective**: Demonstrate detection of human caller committing coercion / OTP theft.
- **Input Conversation**:
  > Caller: "I am calling from the Central Police Cyber Fraud cell. Your account is implicated in money laundering. You will be arrested within 30 minutes unless you share the 6-digit verification code you just received on your phone!"
- **Execution**:
  1. Click **"Scenario C: Social Engineering & Pressure"**.
- **Engine Analysis**:
  - Speaker Biometrics: Human voice (Deepfake score `0.05`).
  - Sensitive Entity Extraction: Detected OTP request attempt (`requested_information: "OTP"`).
  - Social Engineering Tactics: High Urgency (`0.95`), False Authority (`0.90`), Fear/Intimidation (`0.92`).
  - Privacy Firewall: Real-time redacts the OTP code.
- **Fused Decision**:
  - **Overall Risk**: `0.89` (`CRITICAL` - Red).
  - **Policy Action**: `BLOCK_DISCLOSURE`.
- **Demonstration Key Point**:
  - VOXSHIELD does **not** rely solely on voice cloning detection. The multi-modal intelligence detects conversational coercion and credential theft even when the caller uses a real human voice.

---

### Scenario D: System Degradation & Fail-Safe Demonstration
- **Objective**: Prove VOXSHIELD fails safely and never produces false benign ratings when an internal model fails.
- **Execution**:
  1. Stop the AI microservice in Terminal 1 (`Ctrl+C`).
  2. Send a call verification request from the frontend or test harness.
- **Engine Analysis**:
  - Backend `AiClient` circuit breaker trips to `OPEN`.
  - Emits safe degraded assessment: `overall_assessment: "NOT_AVAILABLE"`, `uncertainty: 1.0`.
- **Fused Decision**:
  - The Policy Engine enforces `REQUIRE_STEP_UP_VERIFICATION`.
  - **Analyst UI**: Displays **"AI Telemetry Inconclusive (Safe Degradation Active)"** in amber/gray. The call is guarded, never granted false green approval.

---

## 4. Troubleshooting & Recovery Runbook

1. **Frontend shows "Backend Disconnected"**:
   - Check if Backend is running on port 4000: `curl http://localhost:4000/api/health`.
   - Verify WebSocket connection to `ws://localhost:4000`.
2. **AI Microservice returns 500 or timeout**:
   - Verify Python virtual environment dependencies: `.venv\Scripts\python -c "import torch; print(torch.__version__)"`.
   - Check CPU memory usage.
3. **Database connection warning in backend logs**:
   - Backend automatically runs in in-memory fallback mode if PostgreSQL is not active. All demo scenarios function identically.

---

## 5. Clean Shutdown
To cleanly terminate the demonstration:
1. In Terminal 3 (Frontend): Press `Ctrl+C`.
2. In Terminal 2 (Backend): Press `Ctrl+C`. The graceful shutdown handler will drain connections and close audio buffers.
3. In Terminal 1 (AI): Press `Ctrl+C`.
