import { Request, Response } from 'express';
import { RiskService } from './risk.service';

export class RiskController {
  public static async evaluateRisk(req: Request, res: Response): Promise<void> {
    try {
      const { callId, streamId, chunkIndex, sampleRate, channels, audioBase64, textTranscript, claimedSpeakerId, metadata } = req.body;
      if (!callId) {
        res.status(400).json({ success: false, error: 'callId is required.' });
        return;
      }

      const assessment = await RiskService.evaluateUnifiedRisk({
        callId,
        streamId,
        chunkIndex,
        sampleRate,
        channels,
        audioBase64,
        textTranscript,
        claimedSpeakerId,
        metadata,
      }, req.user?.id);

      res.json({ success: true, data: assessment });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static getAssessment(req: Request, res: Response): void {
    const { callId } = req.params;
    const assessment = RiskService.getAssessmentForCall(callId);
    res.json({ success: true, data: assessment });
  }

  public static getTimeline(req: Request, res: Response): void {
    const { callId } = req.params;
    const timeline = RiskService.getTimelineForCall(callId);
    res.json({ success: true, data: timeline });
  }

  public static getEvidence(req: Request, res: Response): void {
    const { callId } = req.params;
    const evidence = RiskService.getEvidenceForCall(callId);
    res.json({ success: true, data: evidence });
  }
}
