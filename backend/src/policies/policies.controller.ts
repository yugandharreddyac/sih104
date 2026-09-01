import { Request, Response } from 'express';
import { z } from 'zod';
import { PoliciesService } from './policies.service';

const evaluateSchema = z.object({
  context: z.record(z.any()),
});

export class PoliciesController {
  public static async listPolicies(req: Request, res: Response): Promise<void> {
    const policies = PoliciesService.listPolicies(req.user?.organizationId);
    res.status(200).json({
      success: true,
      data: policies,
      count: policies.length,
    });
  }

  public static async getPolicy(req: Request, res: Response): Promise<void> {
    const policy = PoliciesService.getPolicyById(req.params.id);
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

    const orgId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
    const result = PoliciesService.evaluateContext(orgId, parsed.data.context);

    res.status(200).json({
      success: true,
      data: result,
    });
  }
}
