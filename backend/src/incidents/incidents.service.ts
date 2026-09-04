import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../security/audit.service';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { db } from '../database/db';
import { isStrictMode } from '../config/env';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'FALSE_POSITIVE';

export interface IncidentRecord {
  id: string;
  incidentNumber: string;
  callId?: string;
  organizationId: string;
  severity: IncidentSeverity;
  attackClassification: string;
  status: IncidentStatus;
  detectedAt: Date;
  resolvedAt?: Date;
  summary: string;
  assignedToUserId?: string;
  triggeredPolicies: string[];
  actionsTaken: string[];
  evidenceReferences: Array<{ id: string; type: string; description: string; hash: string }>;
  events: Array<{ type: string; actorUserId?: string; description: string; timestamp: Date }>;
  metadata: Record<string, any>;
}

export class IncidentsService {
  private static incidents: Map<string, IncidentRecord> = new Map();
  private static sequence = 1001;

  /**
   * Maps a PostgreSQL row to the IncidentRecord interface.
   */
  private static rowToIncidentRecord(row: any): IncidentRecord {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    return {
      id: row.id,
      incidentNumber: row.incident_number,
      callId: row.call_id || undefined,
      organizationId: row.organization_id,
      severity: row.severity as IncidentSeverity,
      attackClassification: row.attack_classification,
      status: row.status as IncidentStatus,
      detectedAt: new Date(row.detected_at),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      summary: row.summary,
      assignedToUserId: row.assigned_to_user_id || undefined,
      // These fields are stored in the metadata JSONB column
      triggeredPolicies: meta.triggeredPolicies || [],
      actionsTaken: meta.actionsTaken || [],
      evidenceReferences: meta.evidenceReferences || [],
      events: meta.events || [],
      metadata: meta.extra || {},
    };
  }

  public static async createIncident(params: {
    organizationId: string;
    severity: IncidentSeverity;
    attackClassification: string;
    callId?: string;
    summary: string;
    triggeredPolicies?: string[];
    actionsTaken?: string[];
    evidenceReferences?: Array<{ id: string; type: string; description: string; hash: string }>;
    assignedToUserId?: string;
    metadata?: Record<string, any>;
  }): Promise<IncidentRecord> {
    const id = uuidv4();
    const incidentNumber = `INC-${new Date().getFullYear()}-${this.sequence++}`;
    const sanitizedSummary = PrivacyFirewall.sanitize(params.summary).sanitizedText;
    const sanitizedMetadata = PrivacyFirewall.sanitizeObject(params.metadata || {});

    const incident: IncidentRecord = {
      id,
      incidentNumber,
      callId: params.callId,
      organizationId: params.organizationId,
      severity: params.severity,
      attackClassification: params.attackClassification,
      status: 'OPEN',
      detectedAt: new Date(),
      summary: sanitizedSummary,
      assignedToUserId: params.assignedToUserId,
      triggeredPolicies: params.triggeredPolicies || [],
      actionsTaken: params.actionsTaken || [],
      evidenceReferences: params.evidenceReferences || [],
      events: [
        {
          type: 'INCIDENT_CREATED',
          description: `Security incident created: ${sanitizedSummary}`,
          timestamp: new Date(),
        },
      ],
      metadata: sanitizedMetadata,
    };

    this.incidents.set(id, incident);

    await AuditService.record({
      organizationId: params.organizationId,
      action: 'INCIDENT_CREATED',
      resourceType: 'INCIDENT',
      resourceId: id,
      result: 'SUCCESS',
      metadata: { incidentNumber, severity: params.severity, classification: params.attackClassification },
    });

    try {
      // Store sub-domain arrays in the metadata JSONB column
      const dbMetadata = JSON.stringify({
        triggeredPolicies: incident.triggeredPolicies,
        actionsTaken: incident.actionsTaken,
        evidenceReferences: incident.evidenceReferences,
        events: incident.events,
        extra: incident.metadata,
      });

      await db.query(
        `INSERT INTO incidents (id, call_id, organization_id, incident_number, severity, attack_classification, status, assigned_to_user_id, detected_at, summary, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          incident.id,
          incident.callId || null,
          incident.organizationId,
          incident.incidentNumber,
          incident.severity,
          incident.attackClassification,
          incident.status,
          incident.assignedToUserId || null,
          incident.detectedAt,
          incident.summary,
          dbMetadata,
        ]
      );
    } catch (err) {
      if (isStrictMode()) {
        this.incidents.delete(id);
        throw err;
      }
      // Standalone mode — silently proceed with in-memory only
    }

    return incident;
  }

  public static async correlateOrEscalateIncident(params: {
    organizationId: string;
    severity: IncidentSeverity;
    attackClassification: string;
    callId: string;
    summary: string;
    triggeredPolicies?: string[];
    actionsTaken?: string[];
    evidenceReferences?: Array<{ id: string; type: string; description: string; hash: string }>;
    assignedToUserId?: string;
    metadata?: Record<string, any>;
  }): Promise<{ incident: IncidentRecord; isNew: boolean }> {
    // For correlation, use in-memory for both modes (correlation is a transient real-time operation)
    const existing = Array.from(this.incidents.values()).find(
      (i) =>
        i.callId === params.callId &&
        i.organizationId === params.organizationId &&
        (i.status === 'OPEN' || i.status === 'INVESTIGATING')
    );

    if (existing) {
      const severityRank: Record<IncidentSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      if (severityRank[params.severity] > severityRank[existing.severity]) {
        existing.severity = params.severity;
      }
      if (params.triggeredPolicies) {
        existing.triggeredPolicies = Array.from(new Set([...existing.triggeredPolicies, ...params.triggeredPolicies]));
      }
      if (params.actionsTaken) {
        existing.actionsTaken = Array.from(new Set([...existing.actionsTaken, ...params.actionsTaken]));
      }
      existing.events.push({
        type: 'THREAT_ESCALATION',
        description: PrivacyFirewall.sanitize(params.summary).sanitizedText,
        timestamp: new Date(),
      });
      return { incident: existing, isNew: false };
    }

    const newInc = await this.createIncident(params);
    return { incident: newInc, isNew: true };
  }

  public static async listIncidents(organizationId?: string): Promise<IncidentRecord[]> {
    if (isStrictMode()) {
      if (organizationId) {
        const result = await db.query(
          'SELECT * FROM incidents WHERE organization_id = $1 ORDER BY detected_at DESC',
          [organizationId]
        );
        return result.rows.map(this.rowToIncidentRecord);
      }
      const result = await db.query('SELECT * FROM incidents ORDER BY detected_at DESC');
      return result.rows.map(this.rowToIncidentRecord);
    }
    this.seedSampleIncidentsIfEmpty();
    const all = Array.from(this.incidents.values());
    if (organizationId) {
      return all.filter((i) => i.organizationId === organizationId);
    }
    return all;
  }

  public static async getIncidentById(id: string): Promise<IncidentRecord | null> {
    if (isStrictMode()) {
      const result = await db.query('SELECT * FROM incidents WHERE id = $1', [id]);
      if (result.rows.length === 0) return null;
      return this.rowToIncidentRecord(result.rows[0]);
    }
    this.seedSampleIncidentsIfEmpty();
    return this.incidents.get(id) || null;
  }

  public static async updateStatus(
    id: string,
    status: IncidentStatus,
    actorUserId?: string,
    notes?: string
  ): Promise<IncidentRecord> {
    if (isStrictMode()) {
      const existing = await this.getIncidentById(id);
      if (!existing) {
        throw new Error(`Incident ${id} not found`);
      }

      const resolvedAt = (status === 'RESOLVED' || status === 'FALSE_POSITIVE') ? new Date() : null;

      await db.query(
        'UPDATE incidents SET status = $1, resolved_at = $2 WHERE id = $3',
        [status, resolvedAt, id]
      );

      await AuditService.record({
        actorUserId,
        organizationId: existing.organizationId,
        action: `INCIDENT_STATUS_${status}`,
        resourceType: 'INCIDENT',
        resourceId: id,
        result: 'SUCCESS',
        metadata: { status, notes },
      });

      return { ...existing, status, resolvedAt: resolvedAt || existing.resolvedAt };
    }

    // Fallback mode
    const incident = this.incidents.get(id);
    if (!incident) {
      throw new Error(`Incident ${id} not found`);
    }

    incident.status = status;
    if (status === 'RESOLVED' || status === 'FALSE_POSITIVE') {
      incident.resolvedAt = new Date();
    }

    incident.events.push({
      type: `STATUS_CHANGED_${status}`,
      actorUserId,
      description: notes || `Status updated to ${status}`,
      timestamp: new Date(),
    });

    await AuditService.record({
      actorUserId,
      organizationId: incident.organizationId,
      action: `INCIDENT_STATUS_${status}`,
      resourceType: 'INCIDENT',
      resourceId: id,
      result: 'SUCCESS',
      metadata: { status, notes },
    });

    return incident;
  }

  private static seedSampleIncidentsIfEmpty(): void {
    if (this.incidents.size > 0) return;

    const orgId = '00000000-0000-0000-0000-000000000001';
    const sample: IncidentRecord = {
      id: 'i1111111-0000-0000-0000-000000000001',
      incidentNumber: 'INC-2026-1001',
      callId: 'c1111111-0000-0000-0000-000000000002',
      organizationId: orgId,
      severity: 'HIGH',
      attackClassification: 'ID_HELPDESK_IT_IMPERSONATION / OBJ_MFA_DEVICE_REBIND',
      status: 'INVESTIGATING',
      detectedAt: new Date(Date.now() - 300000),
      summary: 'Suspicious caller claiming IT Helpdesk requested MFA device re-registration with high urgency cues.',
      triggeredPolicies: ['Authentication Secret & OTP Exfiltration Prevention'],
      actionsTaken: ['WARN_OPERATOR', 'REQUIRE_STEP_UP_VERIFICATION'],
      evidenceReferences: [
        {
          id: 'ev-01',
          type: 'REDACTED_TRANSCRIPT',
          description: 'Sanitized live transcript with authentication codes redacted.',
          hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ],
      events: [
        {
          type: 'INCIDENT_CREATED',
          description: 'Policy violation triggered automatic incident creation.',
          timestamp: new Date(Date.now() - 300000),
        },
      ],
      metadata: { channel: 'INTERNAL-PBX' },
    };

    this.incidents.set(sample.id, sample);
  }
}
