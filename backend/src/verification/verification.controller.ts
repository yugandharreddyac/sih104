import { Request, Response } from 'express';
import { z } from 'zod';
import { VerificationService, VerificationMechanism } from './verification.service';

const createVerificationSchema = z.object({
  callId: z.string().uuid(),
  mechanism: z.enum([
    'AUTHENTICATOR_PUSH',
    'IDP_VERIFIED_APP',
    'CORPORATE_CHANNEL',
    'INDEPENDENT_CALLBACK',
    'DUAL_AUTHORIZATION',
  ]),
  targetIdentity: z.string().min(3),
  payload: z.record(z.any()).optional(),
});

const resolveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  notes: z.string().optional(),
});

export class VerificationController {
  public static async list(req: Request, res: Response): Promise<void> {
    const list = VerificationService.listRequests(req.user?.organizationId);
    res.status(200).json({
      success: true,
      data: list,
      count: list.length,
    });
  }

  public static async create(req: Request, res: Response): Promise<void> {
    const parsed = createVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    const orgId = req.user?.organizationId || '00000000-0000-0000-0000-000000000001';
    const reqRecord = await VerificationService.createVerificationRequest({
      organizationId: orgId,
      actorUserId: req.user?.id,
      ...parsed.data,
      mechanism: parsed.data.mechanism as VerificationMechanism,
    });

    res.status(201).json({
      success: true,
      data: reqRecord,
    });
  }

  public static async resolve(req: Request, res: Response): Promise<void> {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      });
      return;
    }

    try {
      const resolved = await VerificationService.resolveRequest(
        req.params.id,
        parsed.data.status,
        req.user?.id,
        parsed.data.notes
      );
      res.status(200).json({
        success: true,
        data: resolved,
      });
    } catch (err: any) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: err.message,
      });
    }
  }
}
