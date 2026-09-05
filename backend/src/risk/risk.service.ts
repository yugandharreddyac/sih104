import { CallsService } from '../calls/calls.service';
import { v4 as uuidv4 } from 'uuid';
import { RiskAssessment } from './risk.model';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { AuditService } from '../security/audit.service';
import { db } from '../database/db';
import { WebhookDispatcher } from '../interventions/webhook_dispatcher';

export interface UnifiedRiskEvaluationPayload {
  callId: string;
  streamId?: string;
  chunkIndex?: number;
  sampleRate?: number;
  channels?: number;
  audioBase64?: string;
  textTranscript?: string;
  claimedSpeakerId?: string;
  metadata?: Record<string, any>;
}

export interface TransactionContextPayload {
  callId: string;
  transactionId: string;
  amount: number;
  currency: string;
  transactionType: 'FUND_TRANSFER' | 'BENEFICIARY_UPDATE' | 'CREDENTIAL_RESET' | 'CARD_MANAGEMENT' | string;
  beneficiaryChange?: boolean;
  otpRequested?: boolean;
  metadata?: Record<string, any>;
}

export class RiskService {
  public static readonly AI_TIMEOUT_MS = 1200;
  private static assessments: Map<string, any> = new Map();
  private static timelineHistory: Map<string, any[]> = new Map();
  private static transactionContexts: Map<string, TransactionContextPayload> = new Map();
  private static aiBaseUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';


  private static readonly VALID_RISK_LEVELS = new Set([
    'SAFE',
    'LOW',
    'GUARDED',
    'ELEVATED',
    'HIGH',
    'CRITICAL',
    'INCONCLUSIVE',
  ]);

  /**
   * Structural validator for AI Risk Fusion HTTP 200 response payload.
   */
  private static isValidRiskResponse(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (!data.dimensions || typeof data.dimensions !== 'object') return false;

    // Validate that each dimension, if present, is a finite number in [0, 100] or null
    for (const [key, val] of Object.entries(data.dimensions)) {
      if (val !== null && val !== undefined) {
        if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 100) {
          return false;
        }
      }
    }

    if (
      typeof data.overall_risk_score !== 'number' ||
      !Number.isFinite(data.overall_risk_score) ||
      data.overall_risk_score < 0 ||
      data.overall_risk_score > 100
    ) {
      return false;
    }
    if (typeof data.risk_level !== 'string' || !this.VALID_RISK_LEVELS.has(data.risk_level)) {
      return false;
    }
    if (data.confidence !== undefined && data.confidence !== null) {
      if (typeof data.confidence !== 'number' || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1) {
        return false;
      }
    }
    if (data.uncertainty !== undefined && data.uncertainty !== null) {
      if (typeof data.uncertainty !== 'number' || !Number.isFinite(data.uncertainty) || data.uncertainty < 0 || data.uncertainty > 1) {
        return false;
      }
    }
    return true;
  }

  /**
   * Constructs explicit safe degraded failure structure without fabricating benign scores.
   */
  private static buildDegradedResult(
    payload: UnifiedRiskEvaluationPayload,
    failureReason: string,
    httpStatus?: number
  ): any {
    return {
      status: 'NOT_AVAILABLE',
      call_id: payload.callId,
      stream_id: payload.streamId,
      turn_index: payload.chunkIndex || 0,
      analysis_status: failureReason,
      http_status: httpStatus ?? null,
      overall_risk_score: null,
      risk_level: 'INCONCLUSIVE',
      confidence: 0.0,
      uncertainty: 1.0,
      dimensions: {
        overall: null,
        identity_impersonation: null,
        deepfake_synthetic: null,
        replay_injection: null,
        social_engineering: null,
        credential_theft: null,
        financial_fraud: null,
        account_takeover: null,
        verification_bypass: null,
        inconsistency: null,
      },
      risk_velocity: 0.0,
      risk_trajectory_trend: 'STABLE',
      primary_drivers: ['Risk Fusion service unavailable; threat assessment degraded to INCONCLUSIVE.'],
      contradicting_signals: [],
      evidence_graph: {
        nodes: [],
        edges: [],
        primary_findings: ['Risk Fusion intelligence degraded; no multi-modal synthesis available.'],
        contradictions: [],
      },
      policy_recommendation: null,
      human_workflow_state: 'AI_RECOMMENDED',
      fusion_latency_ms: 0.0,
      timestamp: new Date().toISOString(),
    };
  }

  public static async evaluateUnifiedRisk(
    payload: UnifiedRiskEvaluationPayload,
    actorUserId?: string,
    organizationId?: string
  ): Promise<any> {
    const auditOrganizationId =
      organizationId ||
      CallsService.getCallById(payload.callId)?.organizationId ||
      '00000000-0000-0000-0000-000000000001';
    const sanitizedMetadata = PrivacyFirewall.sanitizeObject(payload.metadata || {});
    const sanitizedTranscript = payload.textTranscript ? PrivacyFirewall.sanitize(payload.textTranscript).sanitizedText : undefined;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.AI_TIMEOUT_MS);
    let failureReason = 'AI_UNAVAILABLE';
    let httpStatus: number | undefined = undefined;

    try {
      const response = await fetch(`${this.aiBaseUrl}/v1/fusion/evaluate-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: payload.callId,
          stream_id: payload.streamId,
          chunk_index: payload.chunkIndex || 0,
          sample_rate: payload.sampleRate || 16000,
          channels: payload.channels || 1,
          audio_base64: payload.audioBase64,
          text_transcript: sanitizedTranscript,
          claimed_speaker_id: payload.claimedSpeakerId,
          metadata: sanitizedMetadata,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        failureReason = 'AI_HTTP_ERROR';
        httpStatus = response.status;
      } else {
        try {
          const data = await response.json();
          if (this.isValidRiskResponse(data)) {
            this.assessments.set(payload.callId, data);

            if (!this.timelineHistory.has(payload.callId)) {
              this.timelineHistory.set(payload.callId, []);
            }
            this.timelineHistory.get(payload.callId)!.push({
              turnIndex: payload.chunkIndex || 0,
              overallScore: data.overall_risk_score,
              riskLevel: data.risk_level,
              velocity: data.risk_velocity,
              timestamp: data.timestamp || new Date().toISOString(),
            });

            if (data.overall_risk_score >= 80.0) {
              try {
                await AuditService.record({
                  actorUserId,
                  organizationId: auditOrganizationId,
                  action: 'CRITICAL_RISK_DETECTED',
                  resourceType: 'RISK_ASSESSMENT',
                  resourceId: payload.callId,
                  result: 'SUCCESS',
                  metadata: { callId: payload.callId, overallScore: data.overall_risk_score, level: data.risk_level },
                });
              } catch {}
            }

            return data;
          } else {
            failureReason = 'AI_INVALID_RESPONSE';
          }
        } catch {
          failureReason = 'AI_INVALID_RESPONSE';
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        failureReason = 'AI_TIMEOUT';
      } else {
        failureReason = 'AI_NETWORK_ERROR';
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Record audit event for degraded risk fusion
    try {
      await AuditService.record({
        actorUserId,
        organizationId: auditOrganizationId,
        action: 'RISK_FUSION_UNAVAILABLE',
        resourceType: 'RISK_FUSION_SERVICE',
        resourceId: payload.callId,
        result: 'ERROR',
        metadata: {
          streamId: payload.streamId,
          chunkIndex: payload.chunkIndex || 0,
          failureReason,
          httpStatus,
        },
      });
    } catch {}

    const fallback = this.buildDegradedResult(payload, failureReason, httpStatus);
    this.assessments.set(payload.callId, fallback);
    return fallback;
  }

  public static getAssessmentForCall(callId: string): any {
    if (this.assessments.has(callId)) {
      return this.assessments.get(callId)!;
    }

    // Default Phase 1 structured explainable baseline
    const assessment: RiskAssessment = {
      id: uuidv4(),
      callId,
      status: 'NOT_AVAILABLE',
      severity: 'LOW',
      compositeScore: null,
      confidence: null,
      uncertainty: null,
      factors: [
        {
          category: 'VOICE',
          factorName: 'Acoustic Deepfake & Vocoder Artifacts',
          score: null,
          weight: 1.0,
          contribution: null,
          explanation: 'Phase 1 Foundation: Acoustic deepfake engine interface ready.',
          evidenceRef: null,
        },
        {
          category: 'IDENTITY',
          factorName: 'Speaker Biometric Likelihood',
          score: null,
          weight: 0.8,
          contribution: null,
          explanation: 'Phase 1 Foundation: Speaker verification interface ready.',
          evidenceRef: null,
        },
        {
          category: 'CONVERSATION',
          factorName: 'Urgency & Social Engineering NLP',
          score: null,
          weight: 0.9,
          contribution: null,
          explanation: 'Phase 1 Foundation: Intent and urgency NLP interface ready.',
          evidenceRef: null,
        },
        {
          category: 'SENSITIVE_INFO',
          factorName: 'Sensitive Credential Disclosure',
          score: null,
          weight: 1.0,
          contribution: null,
          explanation: 'Phase 1 Foundation: Privacy firewall redaction active.',
          evidenceRef: null,
        },
      ],
      recommendedAction: null,
      evaluatedAt: new Date(),
      details: {
        voiceRiskStatus: 'AVAILABLE',
        identityRiskStatus: 'AVAILABLE',
        conversationRiskStatus: 'AVAILABLE',
        actionRiskStatus: 'AVAILABLE',
        contextRiskStatus: 'AVAILABLE',
        policyRiskStatus: 'AVAILABLE',
        phaseNote: 'Phase 5: Decision intelligence, deterministic policies, and multi-modal risk fusion active.',
      },
    };

    this.assessments.set(callId, assessment);
    return assessment;
  }

  public static getTimelineForCall(callId: string): any[] {
    return this.timelineHistory.get(callId) || [];
  }

  public static getEvidenceForCall(callId: string): any {
    const assessment = this.getAssessmentForCall(callId);
    return assessment.evidence_graph || { nodes: [], edges: [], primary_findings: [] };
  }

  public static recordCustomAssessment(assessment: any): void {
    const callId = assessment.callId || assessment.call_id;
    if (callId) {
      this.assessments.set(callId, assessment);
    }
  }

  /**
   * Ingests external core banking / fraud transaction context, persists it,
   * recalculates unified risk score dynamically, and emits live alerts.
   */
  public static async submitTransactionContext(
    payload: TransactionContextPayload,
    actorUserId?: string
  ): Promise<any> {
    const sanitizedMetadata = PrivacyFirewall.sanitizeObject(payload.metadata || {});

    const contextRecord: TransactionContextPayload = {
      callId: payload.callId,
      transactionId: payload.transactionId,
      amount: payload.amount,
      currency: payload.currency || 'INR',
      transactionType: payload.transactionType,
      beneficiaryChange: payload.beneficiaryChange ?? false,
      otpRequested: payload.otpRequested ?? false,
      metadata: sanitizedMetadata,
    };

    // Store in-memory cache
    this.transactionContexts.set(payload.callId, contextRecord);

    // Persist to PostgreSQL if available
    try {
      await db.query(
        `INSERT INTO transaction_contexts (id, call_id, transaction_id, amount, currency, transaction_type, beneficiary_change, otp_requested, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
         ON CONFLICT (call_id) DO UPDATE
         SET transaction_id = EXCLUDED.transaction_id,
             amount = EXCLUDED.amount,
             currency = EXCLUDED.currency,
             transaction_type = EXCLUDED.transaction_type,
             beneficiary_change = EXCLUDED.beneficiary_change,
             otp_requested = EXCLUDED.otp_requested,
             metadata = EXCLUDED.metadata,
             updated_at = CURRENT_TIMESTAMP`,
        [
          uuidv4(),
          contextRecord.callId,
          contextRecord.transactionId,
          contextRecord.amount,
          contextRecord.currency,
          contextRecord.transactionType,
          contextRecord.beneficiaryChange,
          contextRecord.otpRequested,
          JSON.stringify(contextRecord.metadata),
        ]
      );
    } catch {
      // Standalone mode support
    }

    // Build synthetic context indicators to elevate financial fraud and credential theft dimensions
    const contextSignals: string[] = [];
    if (contextRecord.beneficiaryChange) {
      contextSignals.push('New or modified payment beneficiary detected on active call session.');
    }
    if (contextRecord.otpRequested) {
      contextSignals.push('One-time password (OTP) verification requested during high-value transaction.');
    }
    if (contextRecord.amount >= 50000) {
      contextSignals.push(`High-value financial transaction in progress (${contextRecord.currency} ${contextRecord.amount}).`);
    }

    // Recalculate unified risk score with injected transaction context
    const existingAssessment = this.assessments.get(payload.callId);
    const updatedRisk = await this.evaluateUnifiedRisk({
      callId: payload.callId,
      chunkIndex: (existingAssessment?.turn_index || 0) + 1,
      metadata: {
        transaction: contextRecord,
        contextSignals,
      },
    }, actorUserId);

    // If transaction creates high risk or triggers policy, dispatch outbound signed intervention webhook
    if (updatedRisk.overall_risk_score >= 70.0 || updatedRisk.policy_recommendation?.is_triggered) {
      const action = updatedRisk.policy_recommendation?.recommended_action || 'REQUIRE_STEP_UP_VERIFICATION';
      const reasons = [
        ...contextSignals,
        ...(updatedRisk.primary_drivers || []),
      ];

      WebhookDispatcher.dispatch({
        event: 'TRANSACTION_RISK_ELEVATED',
        callId: payload.callId,
        riskScore: updatedRisk.overall_risk_score,
        riskLevel: updatedRisk.risk_level,
        action,
        reasons,
        correlationId: `tx-corr-${contextRecord.transactionId}`,
        metadata: {
          transactionId: contextRecord.transactionId,
          amount: contextRecord.amount,
          currency: contextRecord.currency,
        },
      }).catch(() => {});
    }

    await AuditService.record({
      actorUserId,
      organizationId: CallsService.getCallById(payload.callId)?.organizationId || '00000000-0000-0000-0000-000000000001',
      action: 'TRANSACTION_CONTEXT_INGESTED',
      resourceType: 'TRANSACTION',
      resourceId: payload.transactionId,
      result: 'SUCCESS',
      metadata: {
        callId: payload.callId,
        amount: payload.amount,
        currency: payload.currency,
        type: payload.transactionType,
        riskScore: updatedRisk.overall_risk_score,
        riskLevel: updatedRisk.risk_level,
      },
    }).catch(() => {});

    return {
      success: true,
      transaction: contextRecord,
      riskAssessment: updatedRisk,
    };
  }

  public static getTransactionContext(callId: string): TransactionContextPayload | null {
    return this.transactionContexts.get(callId) || null;
  }
}

