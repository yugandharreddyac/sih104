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
