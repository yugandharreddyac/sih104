# Database Architecture & Persistence Report

## Overview
VOXSHIELD utilizes a multi-tenant PostgreSQL relational schema for storing calls, incidents, interventions, policies, audit logs, and speaker metadata, backed by an automatic in-memory fallback layer for local testing and degraded operation.

---

## Status Matrix

| Capability / Subsystem | Status | Description |
| :--- | :--- | :--- |
| **Relational Schema Definition** | `IMPLEMENTED` | SQL tables defined in `infrastructure/docker/init-db.sql` with foreign keys and `organizationId` multi-tenancy. |
| **Connection Pooling** | `IMPLEMENTED` | `pg.Pool` client configured in `backend/src/database/index.ts` with connection retry logic. |
| **Tenant Isolation (`organizationId`)** | `LIVE VERIFIED` | All database queries partition data by `organizationId`; cross-tenant access returns HTTP 403. |
| **Fallback Store** | `LIVE VERIFIED` | Seamless fallback to in-memory store when PostgreSQL is offline, preventing service crashes. |
| **Strict Mode (`PERSISTENCE_MODE=strict`)** | `TESTED` | Rejects write mutations with HTTP 503 when DB is offline instead of using volatile RAM store. |
| **Restart Durability & Outage Recovery** | `TESTED` | Tested database reconnection and recovery in automated integration suite (`p0_persistence_security.test.ts`). |
| **Database Indexes** | `IMPLEMENTED` | B-tree indexes defined on `organization_id`, `call_id`, and `created_at` fields in SQL schema. |
| **Production PostgreSQL Instance** | `NOT VERIFIED` | Tested against local PostgreSQL container / in-memory mock; managed production DB not connected in test env. |

---

## Primary Tables & Schema Architecture

| Table Name | Description | Multi-Tenant Index |
| :--- | :--- | :--- |
| `organizations` | Tenant organization accounts and metadata | `id` (PK) |
| `users` | User accounts, hashed passwords (bcrypt), roles | `organization_id` |
| `calls` | Call session records, duration, status, metadata | `organization_id`, `call_id` |
| `incidents` | Correlated security incidents and severity levels | `organization_id` |
| `incident_events` | Granular timeline events bound to parent incident | `incident_id` |
| `interventions` | SOC human decision records (`APPROVED` / `OVERRIDDEN`) | `organization_id` |
| `policy_definitions` | Deterministic security policies (`POL-CRED-001`) | `organization_id` |
| `audit_logs` | Immutable audit trail with redacted metadata | `organization_id`, `created_at` |
| `speaker_profiles` | Biometric voice profile metadata (zero raw audio stored) | `organization_id` |

---

## Behavior Under Database Outage & Recovery

1. **Fallback Mode (`PERSISTENCE_MODE=fallback` - Default)**:
   - When PostgreSQL connection fails, the application logs a warning (`⚠️ Database connection unavailable. Operating in fallback mode.`) and routes queries to in-memory seed stores (`AuthService`, `CallsService`, `PoliciesService`).
   - System remains fully operational for streaming and REST requests without crashing.

2. **Strict Mode (`PERSISTENCE_MODE=strict`)**:
   - Write mutations return `503 SERVICE UNAVAILABLE` with structured JSON error response when PostgreSQL is offline.
   - Prevents silent data loss or unpersisted mutations in production environments.

3. **Reconnection & Recovery**:
   - Connection pool automatically retries connection. Once database connectivity is restored, system resumes executing queries against PostgreSQL.
