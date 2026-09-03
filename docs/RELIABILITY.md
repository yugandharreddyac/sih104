# SIH104 — SYSTEM RELIABILITY & RESILIENCE GUIDE

## 1. Failure Modes & Degradation Matrix

| Component | Failure Mode | System Reaction | Emitted Telemetry / Status | Security Policy Invariant |
| :--- | :--- | :--- | :--- | :--- |
| **Python AI Microservice** | Offline / Network Refusal (`ECONNREFUSED`) | Express gateway catches error in $1200\text{ ms}$; falls back to degraded structure | `status: "NOT_AVAILABLE"`, `overall_assessment: "INCONCLUSIVE"`, `uncertainty: 1.0` | Never fabricate `SAFE` / $0.0\text{ score}$; policy falls back to `MONITOR` |
| **Acoustic ONNX Failure** | ONNX Runtime exception | Engage NumPy/SciPy DSP fallback analysis | `deepfake.engine_provenance: "DSP_FALLBACK"`, `uncertainty_penalty: 0.20` | Acoustic risk continues with expanded uncertainty |
| **Faster-Whisper ASR** | Model fault / CPU timeout | Mark ASR degraded; tag any client text as `[UNTRUSTED_CLIENT_HINT]` | `asr.status: "NOT_AVAILABLE"`, `confidence: 0.0`, `uncertainty: 1.0` | Client transcript cannot trigger enforcement policies |
| **WebSocket Connection** | Client disconnect / Network drop | Gateway purges session ring buffer and marks call as `TERMINATED` | Connection closed; ring buffer freed | Bounded memory; no orphaned buffers |
| **Audio Stream** | Malformed / Non-canonical PCM bytes | Normalizer rejects with 400 | `type: "ERROR"`, `error: "INVALID_AUDIO_FORMAT"` | Audio stream aborted safely |
| **PostgreSQL Database** | Port 5432 unreachable | `PERSISTENCE_MODE=strict` throws 503; fallback mode writes to in-memory store | Health endpoint reports `"database": { "status": "DISCONNECTED" }` | Transparent persistence status exposed |

---

## 2. Circuit Breaker & Timeout Configuration

* **AI Microservice Timeout**: All downstream HTTP requests to `:8000` are protected by `AbortSignal.timeout(1200)`.
* **Bounded Stream Ring Buffer**: `StreamBufferManager` maintains a maximum of $50\text{ chunks}$ ($12.8\text{ seconds}$) per active call. Under backpressure, oldest chunks are dropped without memory growth.
* **Conversation Memory Bound**: `ConversationMemoryManager` caps turn history at $20\text{ dialogue turns}$ per call.
