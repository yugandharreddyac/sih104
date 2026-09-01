import { Request, Response } from 'express';
import { ConversationService } from './conversation.service';
import { AuditService } from '../security/audit.service';

export class ConversationController {
  public static async analyzeTurn(req: Request, res: Response): Promise<void> {
    try {
      const { callId, streamId, chunkIndex, audioBase64, textTranscript, speakerChannel, timestampMs, claimedSpeakerId, metadata } = req.body;

      if (!callId) {
        res.status(400).json({ success: false, error: 'callId is required' });
        return;
      }

      const result = await ConversationService.analyzeTurn({
        callId,
        streamId,
        chunkIndex: chunkIndex || 0,
        audioBase64,
        textTranscript,
        speakerChannel: speakerChannel || 0,
        timestampMs,
        claimedSpeakerId,
        metadata,
      });

      if (result.sensitive_data?.contains_direct_request || result.social_engineering?.urgency_detected) {
        await AuditService.record({
          actorUserId: req.user?.id,
          organizationId: req.user?.organizationId || '00000000-0000-0000-0000-000000000001',
          action: 'CONVERSATIONAL_ALERT_TRIGGERED',
          resourceType: 'CALL_STREAM',
          resourceId: callId,
          result: 'SUCCESS',
          ipAddress: req.ip,
          metadata: {
            intent: result.intent?.primary_intent,
            tactics: result.social_engineering?.tactics_detected,
            highest_severity: result.sensitive_data?.highest_severity,
          },
        });
      }

      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const callId = req.params.callId;
      const summary = await ConversationService.getSummary(callId);
      res.status(200).json({ success: true, data: summary });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async clearMemory(req: Request, res: Response): Promise<void> {
    try {
      const callId = req.params.callId;
      await ConversationService.clearMemory(callId);
      res.status(200).json({ success: true, message: `Conversation memory for '${callId}' cleared.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
