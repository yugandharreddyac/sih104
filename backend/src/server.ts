import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiRateLimiter } from './security/rate_limiter';
import { authRoutes } from './auth/auth.routes';
import { callRoutes } from './calls/calls.routes';
import { incidentRoutes } from './incidents/incidents.routes';
import { policyRoutes } from './policies/policies.routes';
import { verificationRoutes } from './verification/verification.routes';
import { riskRoutes } from './risk/risk.routes';
import { auditRoutes } from './audit/audit.routes';
import { healthRoutes } from './health/health.routes';
import { MetricsController, httpRequestsTotal, httpRequestDurationMs } from './health/metrics.controller';
import { WebSocketGateway } from './websocket/ws_server';
import { AuthService } from './auth/auth.service';
import { PoliciesService } from './policies/policies.service';
import { CallsService } from './calls/calls.service';

import acousticRoutes from './acoustic/acoustic.routes';
import speakerRoutes from './speaker/speaker.routes';
import modelsRoutes from './models/models.routes';
import conversationRoutes from './conversation/conversation.routes';
import interventionRoutes from './interventions/intervention.routes';

export const app = express();

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      baseUri: ["'self'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // May interfere with API
}));
app.disable('x-powered-by');

app.use(cors({
  origin: env.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(apiRateLimiter);

// Correlation ID & Request Logger Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
});

// Prometheus HTTP Metrics Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/metrics') {
    return next();
  }
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationMs = (diff[0] * 1e3) + (diff[1] * 1e-6);
    // Use req.path instead of req.route to avoid high cardinality if there are many unique paths,
    // but in a production setup, it's better to use actual route patterns. For this scale, it's fine.
    const route = req.path;
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
    httpRequestDurationMs.observe({ method: req.method, route, status_code: res.statusCode }, durationMs);
  });
  next();
});

// Initialize in-memory seed stores
AuthService.initializeDefaultUsers();
PoliciesService.initializeDefaultPolicies();
CallsService.seedSampleCallsIfEmpty();

// Mount API Namespaces
app.use('/api/health', healthRoutes);
app.get('/metrics', MetricsController.getMetrics);
app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/acoustic', acousticRoutes);
app.use('/api/speakers', speakerRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/conversation', conversationRoutes);
app.use('/api/interventions', interventionRoutes);

// Root Welcome & Discovery
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'VOXSHIELD Platform API',
    description: 'AI-Powered Real-Time Voice Impersonation, Social Engineering & Fraud Prevention Platform',
    version: '1.0.0-phase1',
    phase: 'PHASE_1_FOUNDATION',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      calls: '/api/calls',
      incidents: '/api/incidents',
      policies: '/api/policies',
      verification: '/api/verification',
      risk: '/api/risk',
      audit: '/api/audit',
      websocket: '/ws',
    },
  });
});

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Unhandled Exception:', err);
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal error occurred. Zero secrets exposed.',
    correlationId: req.correlationId,
  });
});

// Server Initialization
export const server = http.createServer(app);

// Ensure WebSocket connections and intervals are cleaned up when the HTTP server closes
server.on('close', async () => {
  await WebSocketGateway.close();
});

if (process.env.NODE_ENV !== 'test') {
  WebSocketGateway.initialize(server).catch(err => console.error('WS Init failed:', err));
  server.listen(env.PORT, () => {
    console.info(`🛡️ VOXSHIELD Core Backend listening on port ${env.PORT}`);
    console.info(`🛡️ Phase 1 Foundation Active. Ready for SOC requests.`);
  });
}

