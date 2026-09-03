# SIH104 — DATABASE PERSISTENCE & MIGRATION GUIDE

## 1. Relational Database Overview

VOXSHIELD utilizes a multi-tenant PostgreSQL relational schema to store structured security events, calls, incidents, interventions, policies, and audit logs.

### Primary Entities & Schema (13 Tables)

| Table Name | Primary Responsibility | Retention Policy |
| :--- | :--- | :--- |
| `organizations` | Multi-tenant boundaries and subscription tiers | Permanent |
| `users` | RBAC credentials (bcrypt hash, 10 rounds), roles (`ADMIN`, `OPERATOR`, `VIEWER`) | Permanent |
| `calls` | Active and historical call session metadata, caller/dest IDs, duration | 90 Days |
| `incidents` | Correlated security incidents with severity, attack taxonomy, and status | 1 Year |
| `incident_events` | Granular timeline events correlated under parent incident ID | 1 Year |
| `interventions` | SOC recommendations, analyst decisions (`APPROVED` / `OVERRIDDEN`), justifications | 1 Year |
| `policy_definitions` | Deterministic policy rules (`POL-CRED-001`, `POL-WIRE-002`), priority, action mapping | Versioned |
| `audit_logs` | Immutable audit trail with actor ID, organization ID, action, redacted metadata | Permanent / 7 Years |
| `speaker_profiles` | Biometric voice embeddings metadata (zero raw audio stored) | Permanent / Revocable |
| `model_registry` | Machine learning model versions, checksums, framework metadata | Versioned |

---

## 2. Migration & Schema Initialization Workflow

The schema is maintained in `infrastructure/docker/init-db.sql`.

### Clean Initialization Procedure
```bash
# 1. Start PostgreSQL 16
docker compose up -d postgres

# 2. Execute database initialization
psql -h localhost -p 5432 -U postgres -d voxshield -f infrastructure/docker/init-db.sql
```

### Migration Ordering & Schema Version Tracking
To execute incremental schema migrations, run the migration runner:
```bash
npm run migrate:up
```

---

## 3. Strict Persistence Mode (`PERSISTENCE_MODE=strict`)

* **Development Default**: `PERSISTENCE_MODE=fallback` allows local development with in-memory maps when PostgreSQL is not running.
* **Production Invariant**: `PERSISTENCE_MODE=strict` must be set in production environments. When PostgreSQL is disconnected:
  - Mutation endpoints (`POST /api/calls`, `POST /api/incidents`, `POST /api/interventions/*`) fail safely with HTTP `503 SERVICE UNAVAILABLE`.
  - The health endpoint (`/api/health`) reports `"database": { "status": "DISCONNECTED" }`.
  - No dynamic data is silently dropped or lost in volatile RAM.

---

## 4. Verification Queries

```sql
-- Verify Call Ingestion
SELECT id, call_id, caller_id, destination_id, status, created_at FROM calls ORDER BY created_at DESC LIMIT 5;

-- Verify Incident Timeline Correlation
SELECT i.incident_number, i.severity, i.attack_classification, count(e.id) as timeline_events
FROM incidents i
LEFT JOIN incident_events e ON e.incident_id = i.id
GROUP BY i.id, i.incident_number, i.severity, i.attack_classification;

-- Verify Privacy Redaction in Audit Log
SELECT action, result, metadata FROM audit_logs WHERE metadata::text ILIKE '%[REDACTED]%' LIMIT 10;
```
