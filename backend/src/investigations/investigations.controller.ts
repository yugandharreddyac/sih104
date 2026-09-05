import { Request, Response } from 'express';
import { CallsService } from '../calls/calls.service';
import { InvestigationsService } from './investigations.service';

export class InvestigationsController {
  public static async getInvestigation(req: Request, res: Response): Promise<void> {
    try {
      const { callId } = req.params;
      if (!callId) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'callId is required',
        });
        return;
      }

      const call = CallsService.getCallById(callId);
      if (!call) {
        res.status(404).json({
          success: false,
          error: 'CALL_NOT_FOUND',
          message: `Call ${callId} does not exist`,
        });
        return;
      }

      const userOrgId = req.user?.organizationId;

      if (!userOrgId) {
        res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Authenticated organization context is required',
        });
        return;
      }

      if (call.organizationId !== userOrgId) {
        res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access to call from another organization is denied',
        });
        return;
      }

      const investigation = await InvestigationsService.getInvestigation(callId, userOrgId);

      res.status(200).json({
        success: true,
        data: investigation,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'An unexpected internal error occurred during investigation aggregation.',
      });
    }
  }
}
