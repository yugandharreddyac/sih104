import { Request, Response } from 'express';
import { AuditService } from '../security/audit.service';
import { DatabaseError } from '../database/db';

export class AuditController {
  public static async list(req: Request, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    try {
      const logs = await AuditService.getRecentLogs(limit);
      res.status(200).json({
        success: true,
        data: logs,
        count: logs.length,
      });
    } catch (err: any) {
      if (err instanceof DatabaseError) {
        res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'The database is currently unavailable.',
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message,
      });
    }
  }
}
