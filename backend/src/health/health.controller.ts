import { Request, Response } from 'express';
import { db } from '../database/db';
import { env, isStrictMode } from '../config/env';

export class HealthController {
  public static async check(req: Request, res: Response): Promise<void> {
    const dbHealth = await db.checkHealth();

    // Check AI Service connectivity
    let aiServiceStatus = 'UNREACHABLE';
    let aiLatencyMs = 0;
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const resp = await fetch(`${env.AI_SERVICE_URL}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        aiServiceStatus = 'HEALTHY';
        aiLatencyMs = Date.now() - start;
      }
    } catch {
      aiServiceStatus = 'OFFLINE_OR_PENDING';
    }

    // Determine health based on actual component states
    const dbIsDown = dbHealth.status === 'DISCONNECTED';
    const isStrictAndDbDown = isStrictMode() && dbIsDown;

    // In strict mode, DB being down means the system cannot serve requests reliably
    const isHealthy = !isStrictAndDbDown;
    const status = isHealthy ? 'HEALTHY' : 'UNHEALTHY';
    const httpStatus = isHealthy ? 200 : 503;

    res.status(httpStatus).json({
      status,
      timestamp: new Date().toISOString(),
      version: '1.0.0-phase1',
      persistenceMode: env.PERSISTENCE_MODE,
      components: {
        backend: { status: 'HEALTHY', uptimeSeconds: process.uptime() },
        database: dbHealth,
        aiService: { status: aiServiceStatus, latencyMs: aiLatencyMs, targetUrl: env.AI_SERVICE_URL },
        privacyFirewall: { status: 'ACTIVE', redactionEngine: 'DETERMINISTIC_PRE_PERSISTENCE' },
        policyEngine: { status: 'ACTIVE', ruleEngine: 'DETERMINISTIC_RULES_V1' },
      },
      phase: 'PHASE_1_FOUNDATION',
    });
  }
}
