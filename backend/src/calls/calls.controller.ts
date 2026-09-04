import { Request, Response } from 'express';
import { z } from 'zod';
import { CallsService } from './calls.service';
import { DatabaseError } from '../database/db';

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
    try {
      CallsService.seedSampleCallsIfEmpty();
      const calls = await CallsService.listActiveCalls(req.user?.organizationId);
      res.status(200).json({
        success: true,
        data: calls,
        count: calls.length,
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

  public static async getCall(req: Request, res: Response): Promise<void> {
    try {
      const call = await CallsService.getCallById(req.params.id);
      if (!call) {
        res.status(404).json({
          success: false,
          error: 'CALL_NOT_FOUND',
          message: `Call ${req.params.id} does not exist`,
        });
        return;
      }

      // Tenant isolation — no cross-tenant access for any role
      if (call.organizationId !== req.user?.organizationId) {
        res.status(403).json({
          success: false,
          error: 'TENANT_ACCESS_DENIED',
          message: 'You do not have access to this resource',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: call,
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

    try {
      const orgId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
      const call = await CallsService.createCall({
        organizationId: orgId,
        ...parsed.data,
      });

      res.status(201).json({
        success: true,
        data: call,
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
      if (err instanceof DatabaseError) {
        res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'The database is currently unavailable.',
        });
        return;
      }
      res.status(404).json({
        success: false,
        error: 'UPDATE_FAILED',
        message: err.message,
      });
    }
  }
}
