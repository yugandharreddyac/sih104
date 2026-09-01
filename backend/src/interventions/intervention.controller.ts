import { Request, Response } from 'express';
import { InterventionService } from './intervention.service';

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
      const { interventionId, decision, reason } = req.body;
      const actorUserId = req.user?.id || 'unknown-user';

      if (!interventionId || !decision) {
        res.status(400).json({ success: false, error: 'interventionId and decision are required.' });
        return;
      }

      const updated = await InterventionService.recordHumanDecision({
        interventionId,
        actorUserId,
        decision,
        reason: reason || 'SOC operator review action',
      });

      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}
