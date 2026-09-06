import { Request, Response } from 'express';
import client from 'prom-client';

// Initialize the default Prometheus registry
const register = new client.Registry();

// Add default node.js metrics (memory, CPU, event loop, etc.)
client.collectDefaultMetrics({ register });

// --- Custom Metrics ---

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(httpRequestsTotal);

export const httpRequestDurationMs = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 250, 500, 1000, 5000],
});
register.registerMetric(httpRequestDurationMs);

export const activeWsConnections = new client.Gauge({
  name: 'active_ws_connections',
  help: 'Number of currently active WebSocket connections',
});
register.registerMetric(activeWsConnections);

export const wsErrorsTotal = new client.Counter({
  name: 'ws_errors_total',
  help: 'Total number of WebSocket errors',
  labelNames: ['error_type'],
});
register.registerMetric(wsErrorsTotal);

export const aiInferenceLatencyMs = new client.Histogram({
  name: 'ai_inference_latency_ms',
  help: 'Duration of AI inference in milliseconds',
  labelNames: ['model_type', 'status'],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000],
});
register.registerMetric(aiInferenceLatencyMs);

export const dbConnectionFailuresTotal = new client.Counter({
  name: 'db_connection_failures_total',
  help: 'Total number of database connection failures',
});
register.registerMetric(dbConnectionFailuresTotal);

// --- Phase 5 Custom Metrics ---

export const audioErrorsTotal = new client.Counter({
  name: 'audio_errors_total',
  help: 'Total number of telephony audio processing errors',
  labelNames: ['type'],
});
register.registerMetric(audioErrorsTotal);

export const streamBufferQueueDepth = new client.Gauge({
  name: 'stream_buffer_queue_depth',
  help: 'Current total queued chunks across active telephony stream buffers',
  labelNames: ['protocol'],
});
register.registerMetric(streamBufferQueueDepth);

export const policyActionsTotal = new client.Counter({
  name: 'policy_actions_total',
  help: 'Total number of policy and privacy firewall enforcement actions',
  labelNames: ['action'],
});
register.registerMetric(policyActionsTotal);

export const dbQueryDurationSeconds = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query execution duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
register.registerMetric(dbQueryDurationSeconds);

export const redisErrorsTotal = new client.Counter({
  name: 'redis_errors_total',
  help: 'Total number of Redis connection or operation errors',
});
register.registerMetric(redisErrorsTotal);

export const rateLimitEventsTotal = new client.Counter({
  name: 'rate_limit_events_total',
  help: 'Total number of rate limit exceeded events',
  labelNames: ['type'],
});
register.registerMetric(rateLimitEventsTotal);

// --- Master 4: Reliability & Circuit Breaker Metrics ---

export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'State of circuit breaker: 0=CLOSED, 1=HALF_OPEN, 2=OPEN',
  labelNames: ['service'],
});
register.registerMetric(circuitBreakerState);

export const circuitBreakerTripsTotal = new client.Counter({
  name: 'circuit_breaker_trips_total',
  help: 'Total number of times a circuit breaker has tripped to OPEN',
  labelNames: ['service', 'reason'],
});
register.registerMetric(circuitBreakerTripsTotal);

export const circuitBreakerFallbacksTotal = new client.Counter({
  name: 'circuit_breaker_fallbacks_total',
  help: 'Total number of times a circuit breaker returned a degraded fallback',
  labelNames: ['service'],
});
register.registerMetric(circuitBreakerFallbacksTotal);

export const webhookDeliveriesTotal = new client.Counter({
  name: 'webhook_deliveries_total',
  help: 'Total number of outbound webhook delivery attempts and outcomes',
  labelNames: ['event', 'status'],
});
register.registerMetric(webhookDeliveriesTotal);

export const webhookRetriesTotal = new client.Counter({
  name: 'webhook_retries_total',
  help: 'Total number of webhook retry attempts',
  labelNames: ['event'],
});
register.registerMetric(webhookRetriesTotal);

export const webhookReplaysRejectedTotal = new client.Counter({
  name: 'webhook_replays_rejected_total',
  help: 'Total number of incoming webhook requests rejected due to replay detection',
});
register.registerMetric(webhookReplaysRejectedTotal);

export const dbPoolSaturationRatio = new client.Gauge({
  name: 'db_pool_saturation_ratio',
  help: 'Ratio of active database pool connections in use (0.0 to 1.0)',
});
register.registerMetric(dbPoolSaturationRatio);

export const activeCallBuffers = new client.Gauge({
  name: 'active_call_buffers',
  help: 'Number of active call stream buffers currently tracked in memory',
});
register.registerMetric(activeCallBuffers);

export class MetricsController {
  public static async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err);
    }
  }
}
