# Deployment & Infrastructure Configuration Report

## Infrastructure Topology & Status Matrix

```text
               ┌─────────────────────────────────────────┐
               │    Client Application / Telephony Trunk │
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
               ┌─────────────────────────────────────────┐
               │      VOXSHIELD Backend (Node.js)        │
               │   REST API (:4000) & WebSocket (:ws)    │
               └───────────┬─────────────────┬───────────┘
                           │                 │
                           ▼                 ▼
             ┌──────────────────┐       ┌──────────────────┐
             │ PostgreSQL 16    │       │ Redis Pub/Sub    │
             │ (Data Storage)   │       │ (:6379)          │
             └──────────────────┘       └──────────────────┘
```

| Deployment Component | Status | Details |
| :--- | :--- | :--- |
| **Node.js Gateway Service** | `LIVE VERIFIED` | Fully verified locally via npm/tsx entrypoints (`src/server.ts`). |
| **Environment Variable Validation** | `TESTED` | Environment schema enforced via `src/config/env.ts` (strict type checks). |
| **Production Secret Validation** | `TESTED` | Enforces strong `JWT_SECRET` (>= 32 chars) in production; fails startup if default/weak. |
| **Docker Containerization** | `TESTED` | Multi-service orchestration defined in `docker-compose.yml` (`backend`, `postgres`, `redis`, `frontend`). |
| **Redis Cross-Instance Scaling** | `TESTED` | Verified Redis Pub/Sub horizontal message distribution across port 4001 and 4002 instances. |
| **Reproducible Local Startup** | `LIVE VERIFIED` | Clean initialization via `npm test` or `npm run dev` with automated fallback when services offline. |
| **Managed Production Cloud (GCP/AWS)** | `NOT VERIFIED` | Cloud Composer, Managed GKE, and remote production deployments not verified in local test suite. |
| **Live Telecom Carrier Trunks** | `NOT VERIFIED` | Direct SIP/PSTN carrier wiring to live telecom providers not verified (software adapter tested). |

---

## Environment Variables (`src/config/env.ts`)

| Variable Name | Required in Production | Default / Fallback | Purpose |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `4000` | HTTP and WebSocket server listening port. |
| `NODE_ENV` | Yes | `development` | Environment mode (`development`, `production`, `test`). |
| `CORS_ORIGIN` | Yes | `*` | Allowed CORS origins; enforced strictly when not `*`. |
| `JWT_SECRET` | Yes | Local default | Secret key for signing authentication JWT tokens. Must be >= 32 characters in production. |
| `DATABASE_URL` | No | PostgreSQL URL | PostgreSQL connection string. Defaults to local container. |
| `PERSISTENCE_MODE` | No | `fallback` | Database persistence mode (`fallback` or `strict`). |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis server connection URL for horizontal pub/sub. |
| `AI_SERVICE_URL` | No | `http://localhost:8000` | Microservice URL for Python AI inference pipeline. |

---

## Production Security Checks at Startup
1. **Secret Length Enforcement**: If `NODE_ENV=production` and `JWT_SECRET` is less than 32 characters or matches insecure defaults, the application throws an exception and halts execution.
2. **CORS Origin Check**: In production, `CORS_ORIGIN` must be explicitly defined to prevent unauthorized cross-origin requests.
3. **Strict Persistence Option**: Setting `PERSISTENCE_MODE=strict` forces all write operations to fail with HTTP 503 if PostgreSQL is unreachable, ensuring no data loss occurs in RAM.
