import { Request, Response } from 'express';
import { InterventionService } from './intervention.service';
import { RoleName, Permission } from '../auth/types';

export class InterventionController {
  public static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.user?.organizationId;
      const list = InterventionService.listInterventions(orgId);
      res.json({ success: true, data: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async create(req: Request, res: Response): Promise<void> {
    try {
      const { callId, level, actionType, policyId, riskAssessmentId, evidenceSummary, metadata } = req.body;
      const orgId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
      const actorUserId = req.user?.id;

      if (!callId || !level || !actionType) {
        res.status(400).json({ success: false, error: 'callId, level, and actionType are required.' });
        return;
      }

      const created = await InterventionService.createIntervention({
        callId,
        organizationId: orgId,
        level,
        actionType,
        policyId,
        riskAssessmentId,
        requestedBy: actorUserId,
        evidenceSummary,
        metadata,
      });

      res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async recordDecision(req: Request, res: Response): Promise<void> {
    try {
      const { interventionId, decision, reason, overrideAction } = req.body;
      const actorUserId = req.user?.id || 'unknown-user';
      const isGlobalAdmin = req.user?.role === RoleName.ADMIN || (req.user?.permissions && req.user.permissions.includes(Permission.ALL));

      if (!interventionId || !decision) {
        res.status(400).json({ success: false, error: 'interventionId and decision are required.' });
        return;
      }

      if (!['APPROVED', 'OVERRIDDEN', 'REJECTED'].includes(decision)) {
        res.status(400).json({ success: false, error: 'Invalid decision. Must be APPROVED, OVERRIDDEN, or REJECTED.' });
        return;
      }

      const updated = await InterventionService.recordHumanDecision({
        interventionId,
        actorUserId,
        decision,
        reason: reason || 'SOC operator review action',
        overrideAction,
        organizationId: req.user?.organizationId,
        isGlobalAdmin,
      });

      res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      const status = err.statusCode || 400;
      res.status(status).json({ success: false, error: err.code || 'BAD_REQUEST', message: err.message });
    }
  }
}
