import { Request, Response } from 'express';
import { AcousticService } from './acoustic.service';

export class AcousticController {
  public static async analyze(req: Request, res: Response): Promise<void> {
    const { callId, streamId, chunkIndex, sampleRate, channels, audioBase64, claimedSpeakerId, metadata } = req.body;

    if (!callId) {
      res.status(400).json({ success: false, error: 'callId is required' });
      return;
    }

    const result = await AcousticService.analyze({
      callId,
      streamId,
      chunkIndex: chunkIndex || 0,
      sampleRate,
      channels,
      audioBase64,
      claimedSpeakerId,
      metadata,
    });

    res.status(200).json({ success: true, data: result });
  }

  public static async getStatus(req: Request, res: Response): Promise<void> {
    const status = await AcousticService.getStatus();
    res.status(200).json({ success: true, data: status });
  }
}
