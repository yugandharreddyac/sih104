# VOXSHIELD Phase 5 Privacy-by-Design & Data Governance

## 1. Zero Raw Audio & Zero Raw Secret Persistence
VOXSHIELD enforces the privacy principle:
> **The platform processes streaming signals ephemerally and persists only sanitized, structured security evidence.**

```
Audio Frame (16kHz PCM) ──► Ephemeral In-Memory Analysis ──► VAD / Acoustic Features
                                                                     │
Transcript Stream ───────► Privacy Firewall Sanitization ────► [REDACTED] Evidence
                                                                     │
                                                                     ▼
                                                      Encrypted Database Record
                                                      (Zero Raw Audio / Zero Secrets)
```

---

## 2. Data Classification & Retention Schedules

| Data Category | Examples | Storage Location | Retention Window | Encryption |
| :--- | :--- | :--- | :--- | :--- |
| **Ephemeral Raw Audio** | Streaming PCM chunks | In-memory stream buffer | Cleared immediately on stream termination | RAM only |
| **Sanitized Transcripts** | *"Tell me the OTP [REDACTED]"* | PostgreSQL `conversation_sessions` | Configurable (30–90 days) | AES-256-GCM |
| **Biometric Embeddings** | 128-dim normalized x-vectors | PostgreSQL `speaker_profiles` | Permanent until deleted by Admin | Column-level Encrypted |
| **Risk Assessments** | Dimension scores, evidence DAG | PostgreSQL `risk_assessments` | 1 year (Audit compliance) | At Rest & In Transit |
| **Audit Logs** | Operator approvals, policy triggers | PostgreSQL `audit_logs` | 7 years (Immutable SOC trail) | Append-only & Encrypted |
