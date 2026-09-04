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
