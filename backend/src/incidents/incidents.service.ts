import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../security/audit.service';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { db } from '../database/db';

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

  public static clearIncidents(): void {
    this.incidents.clear();
  }

  public static listIncidents(organizationId?: string): IncidentRecord[] {
    this.seedSampleIncidentsIfEmpty();
    const all = Array.from(this.incidents.values());
    if (organizationId) {
      return all.filter((i) => i.organizationId === organizationId);
    }
    return all;
  }

  public static getIncidentById(id: string): IncidentRecord | null {
    this.seedSampleIncidentsIfEmpty();
    return this.incidents.get(id) || null;
  }

  public static async updateStatus(
    id: string,
    status: IncidentStatus,
    actorUserId?: string,
    notes?: string,
    organizationId?: string,
    isGlobalAdmin?: boolean
  ): Promise<IncidentRecord> {
    const incident = this.incidents.get(id);
    if (!incident) {
      const err: any = new Error(`Incident ${id} not found`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (organizationId && !isGlobalAdmin && incident.organizationId !== organizationId) {
      const err: any = new Error('Access to incident from another organization is denied');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const validStatuses: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE'];
    if (!validStatuses.includes(status)) {
      const err: any = new Error(`Invalid status: ${status}`);
      err.statusCode = 400;
      err.code = 'INVALID_STATUS';
      throw err;
    }

    // Disallow reopening resolved incident back to OPEN without explicit workflow
    if ((incident.status === 'RESOLVED' || incident.status === 'FALSE_POSITIVE') && status === 'OPEN') {
      const err: any = new Error(`Cannot transition directly from ${incident.status} to OPEN`);
      err.statusCode = 400;
      err.code = 'INVALID_TRANSITION';
      throw err;
    }

    const previousStatus = incident.status;
    incident.status = status;
    if (status === 'RESOLVED' || status === 'FALSE_POSITIVE') {
      incident.resolvedAt = incident.resolvedAt || new Date();
    }

    const sanitizedNotes = notes ? PrivacyFirewall.sanitize(notes).sanitizedText : `Status updated from ${previousStatus} to ${status}`;

    incident.events.push({
      type: `STATUS_CHANGED_${status}`,
      actorUserId,
      description: sanitizedNotes,
      timestamp: new Date(),
    });

    await AuditService.record({
      actorUserId,
      organizationId: incident.organizationId,
      action: `INCIDENT_STATUS_${status}`,
      resourceType: 'INCIDENT',
      resourceId: id,
      result: 'SUCCESS',
      metadata: { previousStatus, status, notes: sanitizedNotes },
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
