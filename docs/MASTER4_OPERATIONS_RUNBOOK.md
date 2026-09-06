# VOXSHIELD Master 4: Operations & Incident Response Runbook

## 1. Scope & Objective

This runbook provides actionable, deterministic standard operating procedures (SOPs) for site reliability engineers (SREs), DevOps operators, and SOC engineers managing the VOXSHIELD voice fraud prevention platform.

---

## 2. Operational Procedures (SOP 1 – 15)

### SOP 1: Service Startup
1. Verify prerequisite infrastructure is healthy:
   ```bash
   # Check Postgres & Redis
   pg_isready -h postgres -p 5432
   redis-cli -h redis -a "$REDIS_PASSWORD" ping
   ```
2. Run database migrations:
   ```bash
   cd backend && npm run migrate
   ```
3. Start the AI service:
   ```bash
   cd ai && uvicorn ai.app.main:app --host 0.0.0.0 --port 8000
   ```
4. Start the Core Backend:
   ```bash
   cd backend && npm run start
   ```
5. Verify readiness:
   ```bash
   curl -f http://localhost:4000/api/health/ready
   ```

---

### SOP 2: Graceful Service Shutdown
1. Signal shutdown to backend instance:
   ```bash
   kill -SIGTERM <backend_pid>
   ```
2. The server executes deterministic graceful teardown:
   - Closes HTTP listener (stops accepting new connections).
   - Drains in-flight requests.
   - Terminates active WebSocket sockets cleanly with close code 1001.
   - Stops UDP RTP telephony listener.
   - Flushes and terminates Redis client.
   - Closes PostgreSQL connection pool (`db.close()`).
   - Clears ephemeral in-memory audio buffers (`StreamBufferManager.clearAll()`).
   - Exits process with code 0 within 10 seconds.

---

### SOP 3: PostgreSQL Outage
**Symptom**: `/api/health` indicates `database.status = "DISCONNECTED"`; log warnings indicate `Failed to persist incident ... Falling back to degraded in-memory mode`.
1. Check persistence mode:
   - If `PERSISTENCE_MODE=strict`: Readiness probe `/api/health/ready` returns 503 to stop ingress traffic.
   - If `PERSISTENCE_MODE=fallback`: Service operates in degraded mode, accumulating incidents up to `MAX_FALLBACK_INCIDENTS = 2000` in memory.
2. Check database container / cluster status:
   ```bash
   docker ps | grep postgres
   docker logs --tail 100 voxshield-postgres
   ```
3. Restart or failover to read-write replica:
   ```bash
   docker restart voxshield-postgres
   ```
4. As soon as PostgreSQL recovers, `db.probeConnection()` passes and live queries resume with exponential backoff retry.

---

### SOP 4: Redis Outage
**Symptom**: Log notices `Redis initialization failed / Redis Client Error`. Replay cache warning logged.
1. Confirm platform stability:
   - In-flight calls and risk evaluations continue uninterrupted.
   - Replay protection transitions automatically to degraded bounded local memory cache (`MAX_CACHE_SIZE = 10000`).
   - Rate limiting falls back to local memory hit counters.
2. Inspect Redis logs:
   ```bash
   docker logs --tail 100 voxshield-redis
   ```
3. If memory saturated, check eviction policy in `redis.conf` (`maxmemory-policy volatile-lru`).
4. Restart Redis:
   ```bash
   docker restart voxshield-redis
   ```
5. Redis reconnect strategy automatically reconnects and re-establishes distributed state.

---

### SOP 5: AI Microservice Outage
**Symptom**: High count of `circuit_breaker_trips_total{service="ai_service"}`; `/api/health` shows `aiService.status = "OFFLINE_OR_PENDING"`.
1. Verify fail-safe threat handling:
   - Core backend automatically returns `overall_assessment: "NOT_AVAILABLE"` with `uncertainty: 1.0`.
   - The policy engine treats `NOT_AVAILABLE` as protected/suspicious, requiring human analyst confirmation or step-up verification. **Zero false benign ratings are emitted**.
2. Check AI service container & memory:
   ```bash
   docker logs --tail 100 voxshield-ai
   ```
3. Test direct health probe:
   ```bash
   curl -f http://localhost:8000/health
   ```
4. Restart AI service container:
   ```bash
   docker restart voxshield-ai
   ```
5. Once healthy, `AiClient` circuit breaker transitions `OPEN` -> `HALF_OPEN` -> `CLOSED` automatically.

---

### SOP 6: High Error Rate (> 1% 5xx Responses)
1. Inspect Prometheus error rates:
   ```promql
   sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100
   ```
2. Correlate with recent application logs filtered by level:
   ```bash
   grep '"level":"ERROR"' /var/log/voxshield/backend.log | tail -n 50
   ```
3. Check circuit breaker trips:
   ```promql
   sum by (service) (increase(circuit_breaker_trips_total[5m]))
   ```
4. If related to database saturation, inspect `db_pool_saturation_ratio`.

---

### SOP 7: High Latency Spikes (p95 > 500ms)
1. Identify bottleneck module via Prometheus histograms:
   - HTTP duration: `http_request_duration_ms`
   - AI latency: `ai_inference_latency_ms`
   - DB query duration: `db_query_duration_seconds`
2. If AI inference is slow:
   - Check if heavy model is executing without batching.
   - Verify GPU / CPU resource allocation on the AI container.
3. If Database query duration is elevated:
   - Run `EXPLAIN ANALYZE` on slow query candidates in `incidents` or `audit_logs`.
   - Verify indexes on `calls(id)`, `incidents(organization_id, detected_at)`.

---

### SOP 8: WebSocket SOC Instability / Dropped Clients
1. Check active WebSocket connection gauge:
   ```promql
   active_ws_connections
   ```
2. Verify if clients are hitting rate limit (100 msgs/sec) or gateway maximum capacity (500 connections):
   ```promql
   sum by (error_type) (increase(ws_errors_total[5m]))
   ```
3. If `ws_errors_total{error_type="MAX_CONNECTIONS_EXCEEDED"}` is firing, increase `MAX_CONCURRENT_CONNECTIONS` or scale backend pods horizontally behind a load balancer with sticky sessions.

---

### SOP 9: Outbound Webhook Delivery Failures
**Symptom**: `webhook_deliveries_total{status="failure"}` or `status="circuit_open"` is increasing.
1. Check downstream partner endpoint URL and connectivity:
   ```bash
   curl -I -X POST "${INTERVENTION_WEBHOOK_URL}"
   ```
2. If downstream is dead, verify VOXSHIELD circuit breaker has tripped to `OPEN` to prevent internal latency spikes.
3. Once downstream recovers, reset the circuit breaker or allow automated probe recovery:
   ```bash
   # Fast reset via internal admin API or pod restart
   ```

---

### SOP 10: PostgreSQL Database Recovery & Re-indexing
1. Terminate runaway locks:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
   WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 minutes';
   ```
2. Re-index critical tables to clear bloat:
   ```sql
   REINDEX TABLE CONCURRENTLY incidents;
   REINDEX TABLE CONCURRENTLY audit_logs;
   ```

---

### SOP 11: Redis Recovery & Cache Flushing
1. If Redis keyspace is corrupt or corrupted by test runs:
   ```bash
   redis-cli -a "$REDIS_PASSWORD" FLUSHDB
   ```
2. Test atomic replay protection:
   ```bash
   redis-cli -a "$REDIS_PASSWORD" SET webhook_replay:test_key "val" EX 60 NX
   ```

---

### SOP 12: Fast Production Rollback Procedure
1. If newly deployed release exhibits genuine regressions:
   ```bash
   # Kubernetes rollback
   kubectl rollout undo deployment/voxshield-backend
   kubectl rollout undo deployment/voxshield-ai
   kubectl rollout undo deployment/voxshield-frontend
   ```
2. Revert git release tag if needed and verify rollback health:
   ```bash
   curl -f http://localhost:4000/api/health
   ```

---

### SOP 13: Platform Health Verification
Run the unified health audit:
```bash
# 1. Liveness
curl -i http://localhost:4000/api/health/live
# Expected: HTTP 200 {"status": "ALIVE"}

# 2. Readiness
curl -i http://localhost:4000/api/health/ready
# Expected: HTTP 200 {"ready": true}

# 3. Component Deep Health
curl -i http://localhost:4000/api/health
# Expected: HTTP 200 with component statuses for backend, database, redis, aiService
```

---

### SOP 14: Security Incident & Threat Investigation
1. Retrieve incident record and timeline:
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:4000/api/incidents/INC-2026-1001
   ```
2. Query immutable audit trail for the associated `callId`:
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     "http://localhost:4000/api/audit?resourceId=call-uuid-here"
   ```
3. Verify evidence graph hashes (`evidenceReferences`) match original stream frames.

---

### SOP 15: Log & Metrics Inspection
1. Metrics endpoint inspection:
   ```bash
   curl -s http://localhost:4000/metrics | grep -E "circuit_breaker|http_requests|ai_inference"
   ```
2. Structured JSON log searching by Correlation ID:
   ```bash
   grep '"correlationId":"req-1788675410394"' /var/log/voxshield/backend.log | jq .
   ```
