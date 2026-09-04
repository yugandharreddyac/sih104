import { v4 as uuidv4 } from 'uuid';
import { InterventionRecord, InterventionLevel, HumanDecision, InterventionStatus } from './types';
import { AuditService } from '../security/audit.service';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { db } from '../database/db';
import { isStrictMode } from '../config/env';
import { policyActionsTotal } from '../health/metrics.controller';

export class InterventionService {
  private static interventions: Map<string, InterventionRecord> = new Map();

  /**
   * Maps a PostgreSQL row to the InterventionRecord interface.
   */
  private static rowToInterventionRecord(row: any): InterventionRecord {
    const evidenceSummary = typeof row.evidence_summary === 'string'
      ? JSON.parse(row.evidence_summary)
      : (row.evidence_summary || []);
    const metadata = typeof row.metadata === 'string'
      ? JSON.parse(row.metadata)
      : (row.metadata || {});

    return {
      id: row.id,
      callId: row.call_id,
      organizationId: row.organization_id,
      policyId: row.policy_id || undefined,
      riskAssessmentId: row.risk_assessment_id || undefined,
      level: row.level as InterventionLevel,
      actionType: row.action_type,
      status: row.status as InterventionStatus,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by || undefined,
      humanDecision: row.human_decision as HumanDecision | undefined,
      decisionReason: row.decision_reason || undefined,
      evidenceSummary,
      createdAt: new Date(row.created_at),
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      metadata,
    };
  }

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
    policyActionsTotal.inc({ action: 'alert' });

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
          JSON.stringify(record.metadata || {}),
          record.createdAt,
        ]
      );
    } catch (err) {
      if (isStrictMode()) {
        this.interventions.delete(id);
        throw err;
      }
      // Standalone mode — silently proceed with in-memory only
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

    return record;
  }

  public static async listInterventions(organizationId?: string): Promise<InterventionRecord[]> {
    if (isStrictMode()) {
      if (organizationId) {
        const result = await db.query(
          'SELECT * FROM interventions WHERE organization_id = $1 ORDER BY created_at DESC',
          [organizationId]
        );
        return result.rows.map(this.rowToInterventionRecord);
      }
      const result = await db.query('SELECT * FROM interventions ORDER BY created_at DESC');
      return result.rows.map(this.rowToInterventionRecord);
    }
    const all = Array.from(this.interventions.values());
    if (organizationId) {
      return all.filter((i) => i.organizationId === organizationId);
    }
    return all;
  }

  public static async getInterventionById(id: string): Promise<InterventionRecord | null> {
    if (isStrictMode()) {
      const result = await db.query('SELECT * FROM interventions WHERE id = $1', [id]);
      if (result.rows.length === 0) return null;
      return this.rowToInterventionRecord(result.rows[0]);
    }
    return this.interventions.get(id) || null;
  }

  public static async recordHumanDecision(params: {
    interventionId: string;
    actorUserId: string;
    decision: HumanDecision;
    reason: string;
  }): Promise<InterventionRecord> {
    if (isStrictMode()) {
      const item = await this.getInterventionById(params.interventionId);
      if (!item) {
        throw new Error(`Intervention ${params.interventionId} not found`);
      }
      if (item.status === 'EXECUTED' || item.status === 'REJECTED') {
        throw new Error(`Intervention ${params.interventionId} has already been resolved (${item.status})`);
      }

      let newStatus: InterventionStatus;
      if (params.decision === 'APPROVED') {
        newStatus = 'EXECUTED';
      } else if (params.decision === 'OVERRIDDEN') {
        newStatus = 'OVERRIDDEN';
      } else {
        newStatus = 'REJECTED';
      }

      const sanitizedReason = PrivacyFirewall.sanitize(params.reason).sanitizedText;
      const executedAt = new Date();

      await db.query(
        `UPDATE interventions SET status = $1, approved_by = $2, human_decision = $3, decision_reason = $4, executed_at = $5 WHERE id = $6`,
        [newStatus, params.actorUserId, params.decision, sanitizedReason, executedAt, params.interventionId]
      );

      await AuditService.record({
        actorUserId: params.actorUserId,
        organizationId: item.organizationId,
        action: `INTERVENTION_DECISION_${params.decision}`,
        resourceType: 'INTERVENTION',
        resourceId: params.interventionId,
        result: params.decision === 'APPROVED' ? 'SUCCESS' : 'DENIED',
        metadata: { callId: item.callId, decision: params.decision, reason: sanitizedReason },
      });

      return {
        ...item,
        status: newStatus,
        approvedBy: params.actorUserId,
        humanDecision: params.decision,
        decisionReason: sanitizedReason,
        executedAt,
      };
    }

    // Fallback mode — in-memory
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
