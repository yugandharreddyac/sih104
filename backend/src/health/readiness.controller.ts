import { Request, Response } from 'express';
import { db } from '../database/db';
import { isStrictMode } from '../config/env';

/**
 * Readiness probe — determines if the node can serve traffic.
 * In strict mode: requires DB connectivity → 200 or 503.
 * In fallback mode: always 200 (in-memory is acceptable).
 */
export class ReadinessController {
  public static async check(req: Request, res: Response): Promise<void> {
    if (isStrictMode()) {
      const dbReady = await db.probeConnection();
      if (!dbReady) {
        res.status(503).json({
          ready: false,
          reason: 'Database connection unavailable in strict persistence mode.',
        });
        return;
      }
    }

    res.status(200).json({
      ready: true,
    });
  }
}
