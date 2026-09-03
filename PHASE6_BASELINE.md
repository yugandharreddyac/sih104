# SIH104 — PHASE 6 ENGINEERING BASELINE AUDIT

**Generated**: September 3, 2026  
**Auditor**: Senior Production Engineer (Pair Programming Lead)  
**Repository**: `yugandharreddyac/sih104`

---

## 1. Current Architecture Overview

```
[Browser / Hardware Audio Streamer] ──(16 kHz Linear PCM over WebSocket)──> [Node.js Gateway (:4000)]
                                                                                   │
             ┌─────────────────────────────────────────────────────────────────────┴───────────────────────────────────┐
             ▼                                                                                                         ▼
[Fast Acoustic Path (Synchronous, 18-32ms)]                                                         [Conversational Path (Async VAD)]
  • Wav2Vec2 ONNX Deepfake (85.69 MB)                                                                  • VAD Speech Segmentation (~2-3s)
  • ECAPA-TDNN ONNX Speaker Verifier (80.24 MB)                                                       • Faster-Whisper Base INT8 (138.49 MB)
  • SciPy FFT Replay DSP                                                                              • 17-Class Intent Rule Classifier
  • SNR & Audio Quality Penalizer                                                                     • Multilingual Tactic Extractor
             │                                                                                                         │
             └──────────────────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                                                ▼
                                                [Multi-Modal Risk Fusion Matrix]
                                                  • 10 Canonical Dimensions
                                                  • Uncertainty Penalty & Degradation
                                                                │
                                                                ▼
                                                [Deterministic Policy Engine]
                                                  • POL-CRED-001 / POL-WIRE-002
                                                  • Deterministic Precedence: BLOCK > STEP_UP > WARN > ALLOW
                                                                │
                                                                ▼
                                                [SOC Dashboard & Audit Store]
                                                  • Next.js 14 SOC HUD
                                                  • In-Memory Dual-Mode Repositories (Strict Mode toggle)
                                                  • PrivacyFirewall Regex Sanitizer
```

---

## 2. Current Persistence & Database Behavior

* **PostgreSQL Schema**: Complete 13-table relational schema located in `infrastructure/docker/init-db.sql`.
* **Database Driver**: `pg.Pool` connector configured in `backend/src/database/db.ts`.
* **Runtime Reality**: No local PostgreSQL daemon listening on host port `5432`.
* **Fallback Behavior**: Repositories operate in volatile in-memory fallback mode. Dynamic calls, interventions, and incidents do not survive backend process restarts.
* **Production Guard**: `PERSISTENCE_MODE=strict` added to `backend/src/config/env.ts` to return HTTP `503 SERVICE UNAVAILABLE` when PostgreSQL is offline in production environments.

---

## 3. Current Redis Behavior

* **Configuration**: `REDIS_URL` defined in `.env` and `env.ts`.
* **Runtime Reality**: Redis is **CONFIGURED BUT NOT USED IN RUNTIME**. Rate limiting, stream buffers, and session state currently execute via in-memory data structures.

---

## 4. Current ASR Architecture & Identified Bottleneck

* **Engine**: `Faster-Whisper Base INT8` (`ai/models/asr/faster-whisper-base`, 138.49 MB).
* **Current Bottleneck**: Executing Whisper synchronously on every 256 ms chunk on CPU incurs $\approx 8.43\text{ seconds}$ per frame.
* **Phase 6 Solution**: Decouple ASR into an **asynchronous VAD-buffered worker loop** that operates across 2–3 second speech segments without blocking the fast acoustic security path (18–32 ms).

---

## 5. Current Test & Quality Baseline

* **Backend Jest Test Suite**: **13 / 13 Suites Passed, 97 / 97 Tests Passed (0 failures, 0 errors, 22.06s execution)**.
* **Python Pytest Suite**: **102 / 102 Tests Passed (0 failures, 0 errors, 643.37s execution)**.
* **TypeScript Build (`tsc`)**: **Clean (0 errors)**.
* **Frontend Next.js Build (`next build`)**: **Clean (12 static/dynamic pages compiled)**.

---

## 6. Files & Modules Modified for Phase 6

1. `backend/tests/acoustic_intelligence.test.ts`: Fixed timeout signals and mock fetch behavior.
2. `backend/tests/conversational_intelligence.test.ts`: Added network refusal mocks for offline AI testing.
3. `backend/tests/phase5_fusion_and_interventions.test.ts`: Added network refusal mocks.
4. `backend/tests/audio_pipeline.test.ts`: Added network refusal mocks.
5. `backend/src/speaker/speaker.service.ts`: Added `AbortSignal.timeout(1200)` to all fetch endpoints.
6. `backend/src/models/models.routes.ts`: Added `AbortSignal.timeout(1200)` to model discovery.
7. `ai/app/pipeline/orchestrator.py`: Hardened ASR failure path with `[UNTRUSTED_CLIENT_HINT]`.
8. `backend/src/incidents/incidents.service.ts`: Added `correlateOrEscalateIncident()`.
9. `backend/src/websocket/ws_server.ts`: Connected policy trigger to incident correlation and parallelized AI calls.
