# VOXSHIELD — Architecture Audit Report

**Date:** 2026-09-07  
**Auditor:** Senior Software Architect & SIH Technical Review Lead  
**Scope:** Documented Architecture vs. Actual Implementation Verification  

---

## 1. System Overview & End-to-End Pipeline

VOXSHIELD is architected as a real-time voice biometric security, acoustic deepfake detection, and conversational fraud prevention system for enterprise/financial call centers and telephony infrastructure.

```
+-----------------------------------------------------------------------------------+
|                                TELEPHONY INGESTION                                |
|  [SIP / RTP Telephony Stream] / [Audio File Upload] / [WebSocket PCM Stream]      |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                        VOXSHIELD BACKEND (Node.js/Express)                        |
|  - Rate Limiter, Helmet Security, CORS, JWT Auth & Multi-Tenant Isolation         |
|  - Session Manager & Call State Tracker                                           |
|  - Privacy Firewall & Sensitive Data Redaction                                    |
|  - Real-Time WebSocket Server (Broadcast to SOC Frontend)                          |
+-----------------------------------------------------------------------------------+
         │                                                           ▲
   Audio Chunks /                                           Inference Signals &
   Transcript Context                                        Risk Evaluation
         │                                                           │
         ▼                                                           │
+───────────────────────────────────────────────────────────────────┼───────────────+
|                      VOXSHIELD AI SUBSYSTEM (Python/FastAPI)       │               |
|                                                                   │               |
|  [ Acoustic Deepfake Engine ]        [ Multi-Lingual ASR & VAD ]  │               |
|  - MiniAcousticCNN / ResNet          - Faster-Whisper / CTranslate2               |
|  - Mel-Spectrogram + Spectral Flux   - Hindi, Tamil, Telugu, English              |
|  - Replay & Telephony Artifact Det.  - Chunk-wise streaming                       |
|                                                                   │               |
|  [ Speaker Biometric Verifier ]      [ Conversational Intelligence ]              |
|  - 192D ResNet/ECAPA Embeddings      - Social Engineering Intent Tagger           |
|  - Cosine Similarity vs Voiceprint   - Urgency, Coercion, Authority Detection     |
|  - In-memory Voiceprint Registry     - Action-Risk & OTP/Account Extraction       |
|                                                                   │               |
|                        [ 10-D Multi-Modal Risk Fusion ]           │               |
|                        - Weighted multi-vector dynamic aggregator ─┘               |
+───────────────────────────────────────────────────────────────────────────────────+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                       POLICY ENGINE & INTERVENTION ENGINE                         |
|  - Dynamic Rule Evaluator (ALLOW / WARN_AGENT / STEP_UP_AUTH / TERMINATE_CALL)     |
|  - Outbound Signed Webhook Dispatcher                                             |
|  - Incident Auto-Creation & Escalation Matrix                                     |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                     VOXSHIELD FRONTEND (Next.js 14 / React 18)                    |
|  - SOC Live Operations Command Center                                             |
|  - 10D Risk Tensor Real-Time Radar / Heatmap                                      |
|  - Live Call Audio & Transcript Stream with Word-level Threat Highlighting        |
|  - Incident Management & Manual Intervention Console                              |
|  - Policy Administration & Compliance Audit Trail                                 |
+-----------------------------------------------------------------------------------+
```

---

## 2. Documented Architecture vs. Actual Implementation Comparison

| Layer / Component | Documented Architecture | Actual Implementation | Discrepancy / Alignment Notes |
| :--- | :--- | :--- | :--- |
| **Telephony Adapter** | Ingests PCMU/PCMA/PCM16 RTP audio packets | Implemented in `backend/src/telephony/` with carrier harness and RTP parser | **ALIGNED**: Handles telephony PCM streams, packet loss simulation, and jitter buffering. |
| **Backend API Server** | Express 4, TypeScript, REST + WebSocket | Implemented in `backend/src/server.ts` | **ALIGNED**: Modular routes for calls, verification, policies, incidents, auth, health, metrics. |
| **AI Microservice** | FastAPI, PyTorch, CTranslate2, NumPy, Scikit-learn | Implemented in `ai/app/main.py` with modular subpackages | **ALIGNED**: Endpoints `/health`, `/evaluate/audio`, `/evaluate/conversation`, `/evaluate/stream`, `/voiceprints/enroll`. |
| **Acoustic Deepfake Detector** | Neural CNN model + heuristic spectral fallback | Implemented in `ai/app/deepfake/detector.py` & `ai/models/` | **ALIGNED**: Uses frozen `MiniAcousticCNN` with spectral artifact extraction, channel-aware thresholding, and robust fallback. |
| **ASR & Language Engine** | Multilingual streaming ASR (EN, HI, TA, TE) | Implemented in `ai/app/asr/engine.py` using Faster-Whisper | **ALIGNED**: Supports streaming transcription, fallback, and language routing. |
| **Speaker Biometrics** | Vector embeddings + enrolled voiceprints | Implemented in `ai/app/speaker/verifier.py` | **ALIGNED**: Extracts voiceprint vectors, computes cosine similarity, channel compensation. |
| **Conversational Intelligence** | Intent classifier + Sensitive Data Redaction + Social Engineering tactics | Implemented in `ai/app/conversation/`, `intent/`, `social_engineering/`, `sensitive_data/` | **ALIGNED**: Detects urgency, authority impersonation, credential harvesting, OTP coercion. |
| **Multi-Modal Risk Fusion** | 10-Dimensional Risk Tensor aggregation | Implemented in `ai/app/fusion/engine.py` & `backend/src/risk/` | **ALIGNED**: Outputs composite risk (0.0 to 1.0) and 10 individual risk vector dimensions. |
| **Policy & Interventions** | Configurable thresholds, automated step-up, call termination | Implemented in `backend/src/policies/` & `backend/src/interventions/` | **ALIGNED**: Generates action types, supports signed HMAC webhooks. |
| **Database & Storage** | PostgreSQL with in-memory fallback for decoupled testing | Implemented in `backend/src/database/` with robust mock/in-memory adapter and PG connection | **ALIGNED**: Seamless operation with or without external PostgreSQL instance. |
| **Frontend UI** | Next.js 14 App Router, Dark Theme SOC, Live WebSockets | Implemented in `frontend/src/app/` with Lucide icons and TailwindCSS | **ALIGNED**: High-fidelity dark mode SOC interface, real-time audio waveforms, 10D risk tensor, and incident triage. |

---

## 3. Architecture Audit Verdict
- **Status:** 100% ALIGNED & VERIFIED.
- All documented architectural components exist as concrete, functioning code modules without pseudo-code or hollow placeholders.
