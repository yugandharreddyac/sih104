# SIH104 — PRODUCTION DEPLOYMENT & TELEPHONY INTEGRATION

## 1. Containerized Service Topology

VOXSHIELD deploys across four isolated container services:

```
                  ┌─────────────────────────────────────┐
                  │          Reverse Proxy / TLS        │
                  └──────────────────┬──────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  frontend:3000   │       │   backend:4000   │       │    ai-ml:8000    │
│  (Next.js 14)    │       │ (Node.js Gateway)│       │ (FastAPI / ONNX) │
└──────────────────┘       └─────────┬────────┘       └──────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌──────────────────┐                                   ┌──────────────────┐
│  postgres:5432   │                                   │    redis:6379    │
│ (PostgreSQL 16)  │                                   │ (Optional Cache) │
└──────────────────┘                                   └──────────────────┘
```

---

## 2. Machine Requirements

### Minimum Specifications (Testing/Demo)
- **CPU**: 4 Cores
- **RAM**: 8 GB (16 GB Recommended for AI models)
- **Storage**: 20 GB SSD
- **OS**: Linux (Ubuntu 22.04 LTS recommended) / Docker Engine 24+

### Production Specifications (Per Node)
- **CPU**: 8+ Cores (AVX-512 support preferred for AI inference)
- **RAM**: 32 GB
- **Storage**: 100 GB NVMe SSD
- **GPU**: NVIDIA T4 or better (optional but highly recommended for `ai-ml` scaling)

---

## 3. Environment Configuration & Secret Handling

### Required Backend Environment Variables
```env
PORT=4000
NODE_ENV=production
PERSISTENCE_MODE=strict

# Database
DATABASE_URL=postgresql://voxshield:${POSTGRES_PASSWORD}@postgres:5432/voxshield

# Redis (Requires Password)
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# Secrets (No fallbacks allowed)
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long_prod
ENCRYPTION_KEY=super_secret_aes_256_key_32_bytes_long_prod!
WEBHOOK_SECRET=your_production_webhook_secret_key_here

# Internal Services
AI_SERVICE_URL=http://ai-ml:8000
```

### Secret Handling
- **Never** hardcode passwords in `docker-compose.yml` or source code.
- Provide secrets via Docker Swarm Secrets, Kubernetes Secrets, or a secure `.env` file mounted only at runtime.
- The backend actively rejects weak or missing `JWT_SECRET` and `WEBHOOK_SECRET` on startup in `production` mode.

---

## 4. Docker / Compose Setup & Startup Sequence

### Startup Sequence
The system relies on Docker Compose dependencies (`depends_on`) and active healthchecks to orchestrate startup:
1. `postgres` and `redis` start first.
2. `postgres` waits for `pg_isready` healthcheck.
3. `ai-ml` starts and loads ONNX checkpoints into memory.
4. `backend` starts (waits for `postgres` and `redis`).
5. `frontend` starts (waits for `backend` to be healthy on port 4000).

### Launching the Stack
```bash
# Build the containers securely
docker compose build

# Start the cluster in detached mode
docker compose up -d
```

---

## 5. Network & Service Isolation (Security Considerations)

VOXSHIELD implements strict network isolation to minimize the attack surface:
- **No host exposure** for `postgres` (5432) or `redis` (6379). These are only accessible to the internal `voxshield-network`.
- **No host exposure** for `ai-ml` (8000). Only the `backend` can reach the AI service directly.
- **Non-root execution**: The frontend, backend, and AI containers execute as a restricted non-root `node` or `appuser` user.

---

## 6. PostgreSQL Migration Procedure

Database migrations run automatically on startup via `sync()` in the `db.ts` file if `PERSISTENCE_MODE=strict`. In production, the backend gracefully degrades to an in-memory fallback if the connection drops, though features requiring persistence will fail.

---

## 7. Redis Setup, Authentication, & Degraded Behavior

- **Authentication**: Redis runs with `--requirepass` forcing the backend to authenticate.
- **Degradation**: If Redis goes offline or authentication fails, the backend `RedisPubSubService` degrades to an in-memory event emitter. The system will continue to function on a single node, but cross-instance Pub/Sub scaling will be temporarily disabled.

---

## 8. Health, Readiness, and Observability

### Health Checks
- Backend: `/api/health`
- Frontend: `/api/health`
- AI Service: `/health`

### Observability & Prometheus Metrics
- Prometheus metrics are exposed on the backend at `/metrics`.
- Tracks: `http_requests_total`, `http_request_duration_ms`, `ai_inference_latency_ms`, `active_ws_connections`, `audio_errors_total`.

### Application Logs
- Logs are structured in JSON format.
- Every request log includes a `correlationId` to track requests across services.
- Sensitive data (OTP, PIN, passwords, raw audio, transcripts, Webhook signatures) is explicitly redacted by the logger and `PrivacyFirewall`.

---

## 9. Rollback Procedure

Since PostgreSQL handles schema migrations via `sync`, schema rollbacks require manual DBA intervention.
For application rollbacks:
```bash
# Revert to previous image tag
docker compose down
# Edit docker-compose.yml to the previous stable image tag
docker compose up -d
```

---

## 10. Telephony Adapter Integration Points

VOXSHIELD's audio ingestion layer is media-agnostic. Any SIP, RTP, PBX, or WebRTC gateway can connect to VOXSHIELD by streaming normalized Linear PCM audio over the existing WebSocket gateway or via direct RTP.

### Protocol Contract
* **Format**: 16-bit Signed Linear PCM (`pcm_s16le`)
* **Sampling Rate**: 16,000 Hz
* **Channels**: 1 (Mono)
* **Frame Chunk**: 4096 samples ($256\text{ ms}$)
* **Payload Format**: Base64 encoded inside `AUDIO_CHUNK` JSON message or standard raw RTP.

---

## 11. Verified vs Not-Verified Infrastructure

### ✔️ Verified Locally
- Docker non-root execution and service isolation.
- Webhook HMAC signature, replay protection, and provider identity validation.
- RTP sequence tracking, duplicate handling, packet loss detection, and codec rejection.
- Production secret rejection and strict environment validation.
- Graceful shutdown (`SIGTERM`/`SIGINT`) for Node.js process.
- Database and Redis degradation behavior.

### ❌ Not Verified (Requires Cloud/Carrier Provisioning)
- Real-world Carrier SIP trunk integrations / latency over public WAN.
- Multi-node Redis Cluster partitioning.
- AWS IAM / GCP Service Account identity bindings.
- Load Balancer TLS termination connection draining.
