import { Request, Response } from 'express';
import { SpeakerService } from './speaker.service';
import { AuditService } from '../security/audit.service';

export class SpeakerController {
  public static async enroll(req: Request, res: Response): Promise<void> {
    try {
      const { speakerId, speakerName, audioUtterancesBase64, sampleRate, metadata } = req.body;

      if (!speakerId || !speakerName || !audioUtterancesBase64 || !Array.isArray(audioUtterancesBase64)) {
        res.status(400).json({
          success: false,
          error: 'speakerId, speakerName, and audioUtterancesBase64 (array) are required',
        });
        return;
      }

      const result = await SpeakerService.enroll({
        speakerId,
        speakerName,
        audioUtterancesBase64,
        sampleRate,
        metadata,
      });

      await AuditService.record({
        actorUserId: req.user?.id,
        organizationId: req.user?.organizationId || '00000000-0000-0000-0000-000000000001',
        action: 'SPEAKER_PROFILE_ENROLLED',
        resourceType: 'SPEAKER_PROFILE',
        resourceId: speakerId,
        result: 'SUCCESS',
        ipAddress: req.ip,
        metadata: { speakerName, utteranceCount: audioUtterancesBase64.length },
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async list(req: Request, res: Response): Promise<void> {
    const profiles = await SpeakerService.listProfiles();
    res.status(200).json({ success: true, data: profiles });
  }

  public static async getById(req: Request, res: Response): Promise<void> {
    const profile = await SpeakerService.getProfile(req.params.id);
    if (!profile) {
      res.status(404).json({ success: false, error: `Speaker profile '${req.params.id}' not found` });
      return;
    }
    res.status(200).json({ success: true, data: profile });
  }

  public static async delete(req: Request, res: Response): Promise<void> {
    const deleted = await SpeakerService.deleteProfile(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: `Speaker profile '${req.params.id}' not found` });
      return;
    }

    await AuditService.record({
      actorUserId: req.user?.id,
      organizationId: req.user?.organizationId || '00000000-0000-0000-0000-000000000001',
      action: 'SPEAKER_PROFILE_DELETED',
      resourceType: 'SPEAKER_PROFILE',
      resourceId: req.params.id,
      result: 'SUCCESS',
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: `Speaker profile '${req.params.id}' deleted` });
  }
}
