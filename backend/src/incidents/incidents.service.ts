import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../security/audit.service';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { db } from '../database/db';
import { logger } from '../utils/logger';

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
  // Retained only as a degraded fallback cache
  public static readonly MAX_FALLBACK_INCIDENTS = 2000;
  private static incidents: Map<string, IncidentRecord> = new Map();
  private static sequence = 1001;

  private static recordFallbackIncident(id: string, incident: IncidentRecord): void {
    if (this.incidents.size >= this.MAX_FALLBACK_INCIDENTS) {
      const oldestKey = this.incidents.keys().next().value;
      if (oldestKey) this.incidents.delete(oldestKey);
    }
    this.incidents.set(id, incident);
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

    const metadataJson = {
      triggeredPolicies: incident.triggeredPolicies,
      actionsTaken: incident.actionsTaken,
      evidenceReferences: incident.evidenceReferences,
      ...incident.metadata
    };

    try {
      if (!db.isAvailable()) throw new Error('Database is offline');

      await db.transaction(async (client) => {
        await client.query(
          `INSERT INTO incidents 
           (id, incident_number, call_id, organization_id, severity, attack_classification, status, summary, metadata, detected_at, assigned_to_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            incident.id,
            incident.incidentNumber,
            incident.callId || null,
            incident.organizationId,
            incident.severity,
            incident.attackClassification,
            incident.status,
            incident.summary,
            JSON.stringify(metadataJson),
            incident.detectedAt,
            incident.assignedToUserId || null
          ]
        );

        await client.query(
          `INSERT INTO incident_events (incident_id, event_type, description, created_at)
           VALUES ($1, $2, $3, $4)`,
          [
            incident.id,
            'INCIDENT_CREATED',
            incident.events[0].description,
            incident.events[0].timestamp
          ]
        );
      });
    } catch (err: any) {
      logger.warn(`Failed to persist incident ${id} to PostgreSQL. Falling back to degraded in-memory mode.`, { error: err.message });
      incident.metadata._degraded_persistence = true;
      this.recordFallbackIncident(id, incident);
    }

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
    
    let existingIncident: IncidentRecord | null = null;

    try {
      if (db.isAvailable()) {
        const result = await db.query(
          `SELECT id, incident_number, severity, status, metadata 
           FROM incidents 
           WHERE call_id = $1 AND organization_id = $2 AND status IN ('OPEN', 'INVESTIGATING')
           ORDER BY detected_at DESC LIMIT 1`,
          [params.callId, params.organizationId]
        );
        
        if (result.rows.length > 0) {
          const row = result.rows[0];
          // We need to fully fetch it to return a proper IncidentRecord
          existingIncident = await this.getIncidentById(row.id);
        }
      }
    } catch (err: any) {
      logger.warn('Failed to query existing incident for correlation', { error: err.message });
    }

    // Degraded mode fallback check
    if (!existingIncident) {
      existingIncident = Array.from(this.incidents.values()).find(
        (i) =>
          i.callId === params.callId &&
          i.organizationId === params.organizationId &&
          (i.status === 'OPEN' || i.status === 'INVESTIGATING')
      ) || null;
    }

    if (existingIncident) {
      const severityRank: Record<IncidentSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      if (severityRank[params.severity] > severityRank[existingIncident.severity]) {
        existingIncident.severity = params.severity;
      }
      if (params.triggeredPolicies) {
        existingIncident.triggeredPolicies = Array.from(new Set([...existingIncident.triggeredPolicies, ...params.triggeredPolicies]));
      }
      if (params.actionsTaken) {
        existingIncident.actionsTaken = Array.from(new Set([...existingIncident.actionsTaken, ...params.actionsTaken]));
      }
      
      const newEventDesc = PrivacyFirewall.sanitize(params.summary).sanitizedText;
      const newEvent = {
        type: 'THREAT_ESCALATION',
        description: newEventDesc,
        timestamp: new Date()
      };
      existingIncident.events.push(newEvent);

      const metadataJson = {
        triggeredPolicies: existingIncident.triggeredPolicies,
        actionsTaken: existingIncident.actionsTaken,
        evidenceReferences: existingIncident.evidenceReferences,
        ...existingIncident.metadata
      };

      try {
        if (!existingIncident.metadata._degraded_persistence && db.isAvailable()) {
          await db.transaction(async (client) => {
            await client.query(
              `UPDATE incidents SET severity = $1, metadata = $2 WHERE id = $3`,
              [existingIncident!.severity, JSON.stringify(metadataJson), existingIncident!.id]
            );
            await client.query(
              `INSERT INTO incident_events (incident_id, event_type, description, created_at) VALUES ($1, $2, $3, $4)`,
              [existingIncident!.id, newEvent.type, newEvent.description, newEvent.timestamp]
            );
          });
        }
      } catch (err: any) {
        logger.warn(`Failed to update escalated incident ${existingIncident.id} in DB`, { error: err.message });
        existingIncident.metadata._degraded_persistence = true;
        this.recordFallbackIncident(existingIncident.id, existingIncident);
      }
      
      if (this.incidents.has(existingIncident.id)) {
        this.recordFallbackIncident(existingIncident.id, existingIncident);
      }

      return { incident: existingIncident, isNew: false };
    }

    const newInc = await this.createIncident(params);
    return { incident: newInc, isNew: true };
  }

  public static clearIncidents(): void {
    this.incidents.clear();
  }

  private static mapDbRowToRecord(row: any, events: any[]): IncidentRecord {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    return {
      id: row.id,
      incidentNumber: row.incident_number,
      callId: row.call_id,
      organizationId: row.organization_id,
      severity: row.severity as IncidentSeverity,
      attackClassification: row.attack_classification,
      status: row.status as IncidentStatus,
      detectedAt: row.detected_at,
      resolvedAt: row.resolved_at,
      summary: row.summary,
      assignedToUserId: row.assigned_to_user_id,
      triggeredPolicies: meta.triggeredPolicies || [],
      actionsTaken: meta.actionsTaken || [],
      evidenceReferences: meta.evidenceReferences || [],
      events: events.map((e: any) => ({
        type: e.event_type,
        actorUserId: e.actor_user_id,
        description: e.description,
        timestamp: e.created_at
      })),
      metadata: meta
    };
  }

  public static async listIncidents(organizationId?: string): Promise<IncidentRecord[]> {
    this.seedSampleIncidentsIfEmpty();
    let dbRecords: IncidentRecord[] = [];

    try {
      if (db.isAvailable()) {
        const query = organizationId 
          ? `SELECT * FROM incidents WHERE organization_id = $1 ORDER BY detected_at DESC`
          : `SELECT * FROM incidents ORDER BY detected_at DESC`;
        const params = organizationId ? [organizationId] : [];
        const result = await db.query(query, params);
        
        for (const row of result.rows) {
          const eventsResult = await db.query(`SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at ASC`, [row.id]);
          dbRecords.push(this.mapDbRowToRecord(row, eventsResult.rows));
        }
      }
    } catch (err: any) {
      logger.warn('Failed to list incidents from DB, degrading to local cache', { error: err.message });
    }

    // Merge in-memory fallback items
    const all = [...dbRecords];
    for (const [id, req] of this.incidents.entries()) {
      if (!all.find((r) => r.id === id) && (!organizationId || req.organizationId === organizationId)) {
        all.push(req);
      }
    }

    return all;
  }

  public static async getIncidentById(id: string): Promise<IncidentRecord | null> {
    this.seedSampleIncidentsIfEmpty();
    
    try {
      if (db.isAvailable()) {
        const result = await db.query(`SELECT * FROM incidents WHERE id = $1`, [id]);
        if (result.rows.length > 0) {
          const eventsResult = await db.query(`SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at ASC`, [id]);
          return this.mapDbRowToRecord(result.rows[0], eventsResult.rows);
        }
      }
    } catch (err: any) {
      logger.warn(`Failed to get incident ${id} from DB`, { error: err.message });
    }

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
    const incident = await this.getIncidentById(id);
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

    const newEvent = {
      type: `STATUS_CHANGED_${status}`,
      actorUserId,
      description: sanitizedNotes,
      timestamp: new Date(),
    };
    incident.events.push(newEvent);

    try {
      if (!incident.metadata._degraded_persistence && db.isAvailable()) {
        await db.transaction(async (client) => {
          await client.query(
            `UPDATE incidents SET status = $1, resolved_at = $2 WHERE id = $3`,
            [incident.status, incident.resolvedAt || null, incident.id]
          );
          await client.query(
            `INSERT INTO incident_events (incident_id, event_type, actor_user_id, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
            [incident.id, newEvent.type, actorUserId || null, newEvent.description, newEvent.timestamp]
          );
        });
      }
    } catch (err: any) {
      logger.warn(`Failed to update incident ${id} in DB`, { error: err.message });
      incident.metadata._degraded_persistence = true;
      this.incidents.set(id, incident);
    }

    if (this.incidents.has(id) || incident.metadata._degraded_persistence) {
      this.incidents.set(id, incident);
    }

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
      metadata: { channel: 'INTERNAL-PBX', _degraded_persistence: true },
    };

    this.incidents.set(sample.id, sample);
  }
}
