import { Request, Response } from 'express';
import { AuditService } from '../security/audit.service';

export class AuditController {
  public static async list(req: Request, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const logs = AuditService.getRecentLogs(limit);
    res.status(200).json({
      success: true,
      data: logs,
      count: logs.length,
    });
  }
}
