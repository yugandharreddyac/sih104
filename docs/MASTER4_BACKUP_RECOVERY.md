# VOXSHIELD Master 4: Backup & Disaster Recovery Architecture

## 1. Executive Summary

This document establishes the persistence hierarchy, automated backup procedures, Point-In-Time-Recovery (PITR) strategy, and disaster recovery runbooks for the VOXSHIELD voice fraud prevention platform.

---

## 2. Authoritative Persistence Architecture & Data Classification

VOXSHIELD categorizes operational data into three distinct tiers to determine durability guarantees and recovery requirements:

| Data Category | Authoritative Store | Durability Target | RPO Target | RTO Target | Reconstruction Feasibility |
|---|---|---|---|---|---|
| **Security Audit Logs** (`audit_logs`) | PostgreSQL Relational DB | Immutable / Highest | 0 seconds (sync WAL) | < 15 minutes | Cannot be reconstructed. Authoritative legal & regulatory record. |
| **Security Incidents & Interventions** (`incidents`, `incident_events`, `interventions`) | PostgreSQL Relational DB | High | < 1 minute | < 30 minutes | Cannot be reconstructed from memory. |
| **Policies & Tenants** (`policies`, `organizations`, `users`) | PostgreSQL Relational DB | High | < 1 hour | < 15 minutes | Can be re-seeded from infrastructure-as-code or Git repo. |
| **Biometric Voice Profiles** (`speaker_profiles`, AI registry) | PostgreSQL + AI Service Encrypted Embeddings | High | < 1 hour | < 1 hour | Embeddings can be re-enrolled; metadata must be persisted. |
| **Replay Attack Cache** | Redis `SETNX` (360s TTL) | Ephemeral / Degraded Cache | N/A | < 1 minute | Rebuilt ephemerally in local memory fallback during outages. |
| **In-Flight Audio Stream Buffers** (`StreamBuffer`, `SpeechBuffer`) | Ephemeral Node.js RAM | Ephemeral (Session) | N/A | Immediate reconnect | Ephemeral session state. Sockets reconnect and stream fresh frames. |
| **Rolling AI Turn Memory** (`ConversationMemoryManager`) | Ephemeral Python RAM (max 20 turns, max 500 sessions) | Ephemeral | N/A | Immediate | Rolling buffer for active calls; cleared upon call termination. |

---

## 3. PostgreSQL Backup Strategy

### 3.1 Logical vs. Physical Backups

In production VOXSHIELD deployments, two complementary backup layers are mandated:

1. **Continuous WAL Archiving & Point-In-Time Recovery (PITR)**:
   - Tooling: `pgBackRest` or AWS RDS automated snapshots.
   - Frequency: Continuous Write-Ahead Log (WAL) archiving every 60 seconds.
   - Retention: 30 days continuous PITR recovery window.
   - Purpose: Protect against catastrophic hardware failure, accidental data truncation, or operational mistakes with near-zero RPO.

2. **Daily Automated Logical Dumps**:
   - Tooling: `pg_dump` with custom compressed format (`-Fc`).
   - Schedule: Nightly at `02:00 UTC` via Kubernetes CronJob / scheduled worker.
   - Retention:
     - Daily snapshots retained for 14 days.
     - Weekly snapshots retained for 8 weeks.
     - Monthly snapshots retained for 12 months (compliance requirement).

### 3.2 Automated Backup Command Specifications

#### Logical Backup Script (`scripts/backup_postgres.sh`):
```bash
#!/usr/bin/env bash
set -eo pipefail

TIMESTAMP=$(date -u +%Y%m%d_%H%M%SZ)
BACKUP_DIR="/var/backups/voxshield/postgres"
BACKUP_FILE="${BACKUP_DIR}/voxshield_backup_${TIMESTAMP}.dump"
LOG_FILE="/var/log/voxshield_backup.log"

mkdir -p "${BACKUP_DIR}"

echo "[${TIMESTAMP}] Starting VOXSHIELD database backup..." >> "${LOG_FILE}"

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST:-postgres}" \
  -p "${POSTGRES_PORT:-5432}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -Fc \
  -b \
  -v \
  -f "${BACKUP_FILE}" 2>> "${LOG_FILE}"

# Calculate SHA-256 integrity checksum
sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"

# Verify backup integrity
pg_restore -l "${BACKUP_FILE}" > /dev/null

# Encrypt backup at rest using GPG
gpg --batch --yes --encrypt --recipient ops@voxshield.internal "${BACKUP_FILE}"
rm "${BACKUP_FILE}" # Retain only encrypted .dump.gpg

# Prune backups older than 14 days
find "${BACKUP_DIR}" -type f -name "voxshield_backup_*.dump.gpg" -mtime +14 -delete
find "${BACKUP_DIR}" -type f -name "voxshield_backup_*.sha256" -mtime +14 -delete

echo "[$(date -u +%Y%m%d_%H%M%SZ)] Backup completed and verified." >> "${LOG_FILE}"
```

---

## 4. Disaster Recovery & Restore Runbook

### 4.1 Prerequisites
1. Dedicated recovery target database instance running PostgreSQL 16.
2. Verified GPG private key and passphrase for archive decryption.
3. Matching schema migrations from the current release commit.

### 4.2 Step-by-Step Restoration Procedure

#### Step 1: Drain Traffic & Put Service in Maintenance Mode
```bash
# Set maintenance mode flag on ingress proxy or return 503
kubectl scale deployment/voxshield-backend --replicas=0
```

#### Step 2: Decrypt and Verify Archive Integrity
```bash
# Decrypt archive
gpg --decrypt voxshield_backup_20260906_020000Z.dump.gpg > restored.dump

# Verify SHA-256 matches the manifest
sha256sum -c voxshield_backup_20260906_020000Z.dump.sha256
```

#### Step 3: Restore Database Schema & Data
```bash
# Terminate existing connections
psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='voxshield' AND pid <> pg_backend_pid();"

# Drop and recreate target database
dropdb -U postgres voxshield
createdb -U postgres voxshield

# Restore from binary compressed dump
pg_restore \
  -h "${POSTGRES_HOST}" \
  -p 5432 \
  -U "${POSTGRES_USER}" \
  -d voxshield \
  -v \
  --single-transaction \
  restored.dump

rm restored.dump # Clean up unencrypted file immediately
```

#### Step 4: Run Post-Restore Health & Migration Verification
```bash
# Verify schema migrations are up to date
npx ts-node src/database/migrate.ts

# Run probe query
psql -U "${POSTGRES_USER}" -d voxshield -c "SELECT COUNT(*) AS incidents_count FROM incidents;"
psql -U "${POSTGRES_USER}" -d voxshield -c "SELECT COUNT(*) AS audit_logs_count FROM audit_logs;"
```

#### Step 5: Resume Traffic
```bash
kubectl scale deployment/voxshield-backend --replicas=3
curl -f http://localhost:4000/api/health/ready
```

---

## 5. Redis Persistence & Recovery Architecture

1. **Production Configuration (`AOF` + `RDB`)**:
   - `appendonly yes`: Synchronous Append-Only File with `appendfsync everysec`.
   - `save 900 1`: Snapshot every 15 minutes if at least 1 key changed.
   - `maxmemory 512mb`: Enforce hard memory limit.
   - `maxmemory-policy volatile-lru`: Evict expired keys first.
2. **Ephemeral Degradation Safety**:
   - Redis primarily tracks rate-limit counters and 6-minute replay attack tokens.
   - If Redis is lost completely, VOXSHIELD automatically transitions to **in-memory degraded protection** in `RedisService` and `webhook_auth.ts`.
   - No permanent business records or regulatory audit trails are stored exclusively in Redis.

---

## 6. Honest Environment Limitation Disclosure

> [!NOTE]
> This repository is running in a local development/testing environment. Standalone PostgreSQL and Redis container clusters were not actively running during this local audit. Automated tests validate database disconnection, reconnection backoff, transaction rollbacks, and in-memory degradation safety via unit mocks. Production PITR, WAL archiving, and cloud snapshot pipelines require staging/production cloud infrastructure.
