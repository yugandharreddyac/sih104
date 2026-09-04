import { Request, Response } from 'express';
import { AuditService } from '../security/audit.service';
import { RoleName, Permission } from '../auth/types';

export class AuditController {
  public static async list(req: Request, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const isGlobalAdmin = req.user?.role === RoleName.ADMIN || (req.user?.permissions && req.user.permissions.includes(Permission.ALL));
    const orgId = isGlobalAdmin ? undefined : req.user?.organizationId;
    const logs = AuditService.getRecentLogs(limit, orgId);
    res.status(200).json({
      success: true,
      data: logs,
      count: logs.length,
    });
  }
}
