import { Request, Response } from 'express';
import { z } from 'zod';
import { CallsService } from './calls.service';

const createCallSchema = z.object({
  callerIdentifier: z.string().min(3),
  destinationIdentifier: z.string().min(3),
  externalCallId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['INITIALIZING', 'ACTIVE', 'VERIFYING', 'TERMINATED', 'FLAGGED', 'BLOCKED']),
  reason: z.string().optional(),
});

export class CallsController {
  public static async listCalls(req: Request, res: Response): Promise<void> {
    CallsService.seedSampleCallsIfEmpty();
    const calls = CallsService.listActiveCalls(req.user?.organizationId);
    res.status(200).json({
      success: true,
      data: calls,
      count: calls.length,
    });
  }

  public static async getCall(req: Request, res: Response): Promise<void> {
    const call = CallsService.getCallById(req.params.id);
    if (!call) {
      res.status(404).json({
        success: false,
        error: 'CALL_NOT_FOUND',
        message: `Call ${req.params.id} does not exist`,
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: call,
    });
  }

  public static async createCall(req: Request, res: Response): Promise<void> {
    const parsed = createCallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    const orgId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
    const call = await CallsService.createCall({
      organizationId: orgId,
      ...parsed.data,
    });

    res.status(201).json({
      success: true,
      data: call,
    });
  }

  public static async updateStatus(req: Request, res: Response): Promise<void> {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    try {
      const updated = await CallsService.updateCallStatus(
        req.params.id,
        parsed.data.status,
        parsed.data.reason
      );
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        error: 'UPDATE_FAILED',
        message: err.message,
      });
    }
  }
}
