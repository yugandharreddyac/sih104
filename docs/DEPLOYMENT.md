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

## 2. Environment Configuration

### Required Backend Environment Variables
```env
PORT=4000
NODE_ENV=production
PERSISTENCE_MODE=strict
DATABASE_URL=postgresql://voxshield:voxshield_secure_password@postgres:5432/voxshield
REDIS_URL=redis://redis:6379
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long_prod
AI_SERVICE_URL=http://ai-ml:8000
```

---

## 3. Telephony Adapter Integration Points

VOXSHIELD's audio ingestion layer is media-agnostic. Any SIP, RTP, PBX, or WebRTC gateway can connect to VOXSHIELD by streaming normalized Linear PCM audio over the existing WebSocket gateway:

```
[Enterprise PBX / SIP Trunk] ──> [Media Fork / RTP Receiver] ──(16 kHz Mono Linear PCM)──> [VOXSHIELD /ws Gateway]
```

### Protocol Contract
* **Format**: 16-bit Signed Linear PCM (`pcm_s16le`)
* **Sampling Rate**: 16,000 Hz
* **Channels**: 1 (Mono)
* **Frame Chunk**: 4096 samples ($256\text{ ms}$)
* **Payload Format**: Base64 encoded inside `AUDIO_CHUNK` JSON message
