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

  public static async submitTransactionContext(req: Request, res: Response): Promise<void> {
    try {
      const { callId, transactionId, amount, currency, transactionType, beneficiaryChange, otpRequested, metadata } = req.body;

      if (!callId || typeof callId !== 'string' || !callId.trim()) {
        res.status(400).json({ success: false, error: 'callId is required and must be a string.' });
        return;
      }
      if (!transactionId || typeof transactionId !== 'string' || !transactionId.trim()) {
        res.status(400).json({ success: false, error: 'transactionId is required and must be a string.' });
        return;
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        res.status(400).json({ success: false, error: 'amount is required and must be a non-negative finite number.' });
        return;
      }

      const result = await RiskService.submitTransactionContext({
        callId: callId.trim(),
        transactionId: transactionId.trim(),
        amount,
        currency: currency || 'INR',
        transactionType: transactionType || 'FUND_TRANSFER',
        beneficiaryChange: Boolean(beneficiaryChange),
        otpRequested: Boolean(otpRequested),
        metadata: metadata || {},
      }, req.user?.id);

      res.status(200).json({
        success: true,
        message: 'Transaction context ingested and risk dynamically recalculated.',
        data: result,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error processing transaction context.' });
    }
  }
}

