import { v4 as uuidv4 } from 'uuid';
import { InterventionRecord, InterventionLevel, HumanDecision, InterventionStatus } from './types';
import { AuditService } from '../security/audit.service';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { WebhookDispatcher } from './webhook_dispatcher';
import { db } from '../database/db';

export class InterventionService {
  private static interventions: Map<string, InterventionRecord> = new Map();

  public static async createIntervention(params: {
    callId: string;
    organizationId: string;
    level: InterventionLevel;
    actionType: string;
    policyId?: string;
    riskAssessmentId?: string;
    requestedBy?: string;
    evidenceSummary?: string[];
    metadata?: Record<string, any>;
  }): Promise<InterventionRecord> {
    const id = uuidv4();
    const sanitizedMetadata = PrivacyFirewall.sanitizeObject(params.metadata || {});
    const sanitizedEvidence = (params.evidenceSummary || []).map((e) => PrivacyFirewall.sanitize(e).sanitizedText);

    const record: InterventionRecord = {
      id,
      callId: params.callId,
      organizationId: params.organizationId,
      policyId: params.policyId,
      riskAssessmentId: params.riskAssessmentId,
      level: params.level,
      actionType: params.actionType,
      status: 'AWAITING_HUMAN',
      requestedBy: params.requestedBy || 'AI_POLICY_ENGINE',
      evidenceSummary: sanitizedEvidence,
      createdAt: new Date(),
      metadata: sanitizedMetadata,
    };

    this.interventions.set(id, record);

    // Persist to PostgreSQL if available
    try {
      await db.query(
        `INSERT INTO interventions (id, call_id, organization_id, policy_id, risk_assessment_id, level, action_type, status, requested_by, evidence_summary, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          record.id,
          record.callId,
          record.organizationId,
          record.policyId || null,
          record.riskAssessmentId || null,
          record.level,
          record.actionType,
          record.status,
          record.requestedBy,
          JSON.stringify(record.evidenceSummary),
          JSON.stringify(record.metadata),
          record.createdAt,
        ]
      );
    } catch {
      // Standalone mode support
    }

    await AuditService.record({
      actorUserId: params.requestedBy,
      organizationId: params.organizationId,
      action: 'INTERVENTION_RECOMMENDED',
      resourceType: 'INTERVENTION',
      resourceId: id,
      result: 'SUCCESS',
      metadata: { callId: params.callId, level: params.level, actionType: params.actionType },
    });

    // Dispatch outbound webhook for high-priority policy interventions
    WebhookDispatcher.dispatch({
      event: 'POLICY_INTERVENTION_TRIGGERED',
      callId: params.callId,
      riskScore: null,
      riskLevel: params.level,
      action: params.actionType,
      reasons: sanitizedEvidence,
      correlationId: `int-${id}`,
      metadata: {
        interventionId: id,
        policyId: params.policyId,
        level: params.level,
      },
    }).catch(() => {});

    return record;
  }


  public static listInterventions(organizationId?: string): InterventionRecord[] {
    const all = Array.from(this.interventions.values());
    if (organizationId) {
      return all.filter((i) => i.organizationId === organizationId);
    }
    return all;
  }

  public static clearInterventions(): void {
    this.interventions.clear();
  }

  public static getInterventionById(id: string): InterventionRecord | null {
    return this.interventions.get(id) || null;
  }

  public static async recordHumanDecision(params: {
    interventionId: string;
    actorUserId: string;
    decision: HumanDecision;
    reason: string;
    overrideAction?: string;
    organizationId?: string;
    isGlobalAdmin?: boolean;
  }): Promise<InterventionRecord> {
    const item = this.interventions.get(params.interventionId);
    if (!item) {
      const err: any = new Error(`Intervention ${params.interventionId} not found`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (params.organizationId && !params.isGlobalAdmin && item.organizationId !== params.organizationId) {
      const err: any = new Error('Access to intervention from another organization is denied');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (item.status === 'EXECUTED' || item.status === 'REJECTED' || item.status === 'OVERRIDDEN') {
      const err: any = new Error(`Intervention ${params.interventionId} has already been resolved (${item.status})`);
      err.statusCode = 409;
      err.code = 'ALREADY_RESOLVED';
      throw err;
    }

    item.approvedBy = params.actorUserId;
    item.humanDecision = params.decision;
    item.decisionReason = PrivacyFirewall.sanitize(params.reason).sanitizedText;
    item.executedAt = new Date();

    if (params.decision === 'APPROVED') {
      item.status = 'EXECUTED';
    } else if (params.decision === 'OVERRIDDEN') {
      item.status = 'OVERRIDDEN';
      item.originalActionType = item.originalActionType || item.actionType;
      item.overrideAction = params.overrideAction || 'ALLOW';
    } else {
      item.status = 'REJECTED';
    }

    await AuditService.record({
      actorUserId: params.actorUserId,
      organizationId: item.organizationId,
      action: `INTERVENTION_DECISION_${params.decision}`,
      resourceType: 'INTERVENTION',
      resourceId: params.interventionId,
      result: params.decision === 'APPROVED' || params.decision === 'OVERRIDDEN' ? 'SUCCESS' : 'DENIED',
      metadata: {
        callId: item.callId,
        decision: params.decision,
        originalAction: item.originalActionType || item.actionType,
        overrideAction: item.overrideAction,
        reason: item.decisionReason,
        analystId: params.actorUserId,
      },
    });

    return item;
  }
}
