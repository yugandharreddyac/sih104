import { logger } from '../../utils/logger';

import { Request, Response } from 'express';
import { z } from 'zod';
import { CallsService } from '../../calls/calls.service';

const webhookStartSchema = z.object({
  externalCallId: z.string().min(1),
  callerIdentifier: z.string().min(1),
  destinationIdentifier: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

const webhookEndSchema = z.object({
  externalCallId: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * TelephonyWebhookController
 * Provides the minimal HTTP webhook integration for receiving SIP signaling events
 * (e.g. from Twilio, Plivo, or an SBC) and bridging them to the RTP media pipeline.
 * 
 * Note: Implemented locally. In a real carrier integration, this would validate
 * cryptographic signatures (e.g., X-Twilio-Signature) from the telephony provider.
 */
export class TelephonyWebhookController {
  public static async onCallStart(req: Request, res: Response): Promise<void> {
    const parsed = webhookStartSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }

    try {
      const call = await CallsService.createCall({
        organizationId,
        callerIdentifier: parsed.data.callerIdentifier,
        destinationIdentifier: parsed.data.destinationIdentifier,
        externalCallId: parsed.data.externalCallId,
        metadata: {
          ...(parsed.data.metadata || {}),
          source: 'TELEPHONY_WEBHOOK',
        },
      });

      res.status(201).json({ success: true, data: call });
    } catch (err: any) {
      logger.error('Webhook Call Start Error:', err);
      res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
    }
  }

  public static async onCallEnd(req: Request, res: Response): Promise<void> {
    const parsed = webhookEndSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: parsed.error.format() });
      return;
    }

    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
      return;
    }

    try {
      // Find the call by externalCallId for this specific tenant
      const activeCalls = CallsService.listActiveCalls(organizationId);
      const call = activeCalls.find(c => c.externalCallId === parsed.data.externalCallId);

      if (!call) {
        res.status(404).json({ success: false, error: 'CALL_NOT_FOUND', message: 'Active call with this externalCallId not found' });
        return;
      }

      await CallsService.updateCallStatus(call.id, 'TERMINATED', parsed.data.reason || 'EXTERNAL_WEBHOOK_TERMINATION');
      
      res.status(200).json({ success: true, message: 'Call terminated successfully' });
    } catch (err: any) {
      logger.error('Webhook Call End Error:', err);
      res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
    }
  }
}
