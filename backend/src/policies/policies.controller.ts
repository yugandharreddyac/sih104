import { Request, Response } from 'express';
import { z } from 'zod';
import { PoliciesService } from './policies.service';
import { DatabaseError } from '../database/db';

const evaluateSchema = z.object({
  context: z.record(z.any()),
});

export class PoliciesController {
  public static async listPolicies(req: Request, res: Response): Promise<void> {
    try {
      const policies = await PoliciesService.listPolicies(req.user?.organizationId);
      res.status(200).json({
        success: true,
        data: policies,
        count: policies.length,
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
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async getPolicy(req: Request, res: Response): Promise<void> {
    try {
      const policy = await PoliciesService.getPolicyById(req.params.id);
      if (!policy) {
        res.status(404).json({
          success: false,
          error: 'POLICY_NOT_FOUND',
          message: `Policy ${req.params.id} does not exist`,
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: policy,
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
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
    }
  }

  public static async evaluate(req: Request, res: Response): Promise<void> {
    const parsed = evaluateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    try {
      const orgId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
      const result = await PoliciesService.evaluateContext(orgId, parsed.data.context);

      res.status(200).json({
        success: true,
        data: result,
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
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
    }
  }
}
