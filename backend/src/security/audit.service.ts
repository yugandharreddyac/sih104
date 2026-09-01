import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db';
import { PrivacyFirewall } from './privacy_firewall';

export interface AuditLogEntry {
  actorUserId?: string;
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  result: 'SUCCESS' | 'FAILURE' | 'DENIED' | 'ERROR';
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  private static inMemoryLogs: Array<AuditLogEntry & { id: string; timestamp: Date }> = [];

  public static async record(entry: AuditLogEntry): Promise<string> {
    const logId = uuidv4();
    const correlationId = entry.correlationId || uuidv4();
    const timestamp = new Date();

    // Ensure no sensitive authentication secrets exist in metadata
    const sanitizedMetadata = entry.metadata ? PrivacyFirewall.sanitizeObject(entry.metadata) : {};

    const record = {
      id: logId,
      actor_user_id: entry.actorUserId || null,
      organization_id: entry.organizationId,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId || null,
      result: entry.result,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
      correlation_id: correlationId,
      timestamp,
      metadata: sanitizedMetadata,
    };

    // Store in-memory for testing/fast lookup
    this.inMemoryLogs.unshift({
      ...entry,
      id: logId,
      correlationId,
      timestamp,
      metadata: sanitizedMetadata,
    });

    if (this.inMemoryLogs.length > 500) {
      this.inMemoryLogs.pop();
    }

    try {
      await db.query(
        `INSERT INTO audit_logs 
         (id, actor_user_id, organization_id, action, resource_type, resource_id, result, ip_address, user_agent, correlation_id, timestamp, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          record.id,
          record.actor_user_id,
          record.organization_id,
          record.action,
          record.resource_type,
          record.resource_id,
          record.result,
          record.ip_address,
          record.user_agent,
          record.correlation_id,
          record.timestamp,
          JSON.stringify(record.metadata),
        ]
      );
    } catch (err) {
      // Graceful fallback to memory log when standalone db is not connected
      console.info(`[AUDIT] ${entry.action} by ${entry.actorUserId || 'ANON'} [${entry.result}]`);
    }

    return logId;
  }

  public static getRecentLogs(limit: number = 50): Array<any> {
    return this.inMemoryLogs.slice(0, limit);
  }
}
