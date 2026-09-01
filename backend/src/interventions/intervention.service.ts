import { v4 as uuidv4 } from 'uuid';
import { InterventionRecord, InterventionLevel, HumanDecision, InterventionStatus } from './types';
import { AuditService } from '../security/audit.service';
import { PrivacyFirewall } from '../security/privacy_firewall';

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

    await AuditService.record({
      actorUserId: params.requestedBy,
      organizationId: params.organizationId,
      action: 'INTERVENTION_RECOMMENDED',
      resourceType: 'INTERVENTION',
      resourceId: id,
      result: 'SUCCESS',
      metadata: { callId: params.callId, level: params.level, actionType: params.actionType },
    });

    return record;
  }

  public static listInterventions(organizationId?: string): InterventionRecord[] {
    const all = Array.from(this.interventions.values());
    if (organizationId) {
      return all.filter((i) => i.organizationId === organizationId);
    }
    return all;
  }

  public static getInterventionById(id: string): InterventionRecord | null {
    return this.interventions.get(id) || null;
  }

  public static async recordHumanDecision(params: {
    interventionId: string;
    actorUserId: string;
    decision: HumanDecision;
    reason: string;
  }): Promise<InterventionRecord> {
    const item = this.interventions.get(params.interventionId);
    if (!item) {
      throw new Error(`Intervention ${params.interventionId} not found`);
    }

    if (item.status === 'EXECUTED' || item.status === 'REJECTED') {
      throw new Error(`Intervention ${params.interventionId} has already been resolved (${item.status})`);
    }

    item.approvedBy = params.actorUserId;
    item.humanDecision = params.decision;
    item.decisionReason = PrivacyFirewall.sanitize(params.reason).sanitizedText;
    item.executedAt = new Date();

    if (params.decision === 'APPROVED') {
      item.status = 'EXECUTED';
    } else if (params.decision === 'OVERRIDDEN') {
      item.status = 'OVERRIDDEN';
    } else {
      item.status = 'REJECTED';
    }

    await AuditService.record({
      actorUserId: params.actorUserId,
      organizationId: item.organizationId,
      action: `INTERVENTION_DECISION_${params.decision}`,
      resourceType: 'INTERVENTION',
      resourceId: params.interventionId,
      result: params.decision === 'APPROVED' ? 'SUCCESS' : 'DENIED',
      metadata: { callId: item.callId, decision: params.decision, reason: item.decisionReason },
    });

    return item;
  }
}
