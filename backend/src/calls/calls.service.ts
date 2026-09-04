import { v4 as uuidv4 } from 'uuid';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { AuditService } from '../security/audit.service';
import { db } from '../database/db';

export type CallStatus = 'INITIALIZING' | 'ACTIVE' | 'VERIFYING' | 'TERMINATED' | 'FLAGGED' | 'BLOCKED';

export interface CallRecord {
  id: string;
  externalCallId?: string;
  organizationId: string;
  callerIdentifier: string;
  destinationIdentifier: string;
  status: CallStatus;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds: number;
  metadata: Record<string, any>;
  events: Array<{ type: string; payload: any; timestamp: Date }>;
}

export class CallsService {
  private static calls: Map<string, CallRecord> = new Map();

  public static async createCall(params: {
    organizationId: string;
    callerIdentifier: string;
    destinationIdentifier: string;
    externalCallId?: string;
    metadata?: Record<string, any>;
  }): Promise<CallRecord> {
    const callId = uuidv4();
    const sanitizedMetadata = PrivacyFirewall.sanitizeObject(params.metadata || {});

    const call: CallRecord = {
      id: callId,
      externalCallId: params.externalCallId,
      organizationId: params.organizationId,
      callerIdentifier: params.callerIdentifier,
      destinationIdentifier: params.destinationIdentifier,
      status: 'ACTIVE',
      startedAt: new Date(),
      durationSeconds: 0,
      metadata: sanitizedMetadata,
      events: [{ type: 'CALL_STARTED', payload: { startedAt: new Date() }, timestamp: new Date() }],
    };

    this.calls.set(callId, call);

    await AuditService.record({
      organizationId: params.organizationId,
      action: 'CALL_INITIALIZED',
      resourceType: 'CALL',
      resourceId: callId,
      result: 'SUCCESS',
      metadata: { caller: params.callerIdentifier, destination: params.destinationIdentifier },
    });

    try {
      await db.query(
        `INSERT INTO calls (id, external_call_id, organization_id, caller_identifier, destination_identifier, status, started_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          call.id,
          call.externalCallId || null,
          call.organizationId,
          call.callerIdentifier,
          call.destinationIdentifier,
          call.status,
          call.startedAt,
          JSON.stringify(call.metadata),
        ]
      );
    } catch (err) {
      // Standalone mode support
    }

    return call;
  }

  public static getCallById(callId: string): CallRecord | null {
    return this.calls.get(callId) || null;
  }

  public static listActiveCalls(organizationId?: string): CallRecord[] {
    const all = Array.from(this.calls.values());
    if (organizationId) {
      return all.filter((c) => c.organizationId === organizationId);
    }
    return all;
  }

  public static async updateCallStatus(
    callId: string,
    status: CallStatus,
    reason?: string
  ): Promise<CallRecord> {
    const call = this.calls.get(callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    call.status = status;
    if (status === 'TERMINATED' || status === 'BLOCKED') {
      call.endedAt = new Date();
      call.durationSeconds = Math.floor(
        (call.endedAt.getTime() - call.startedAt.getTime()) / 1000
      );
    }

    call.events.push({
      type: `STATUS_UPDATED_${status}`,
      payload: { reason, timestamp: new Date() },
      timestamp: new Date(),
    });

    await AuditService.record({
      organizationId: call.organizationId,
      action: `CALL_STATUS_${status}`,
      resourceType: 'CALL',
      resourceId: callId,
      result: 'SUCCESS',
      metadata: { reason },
    });

    try {
      await db.query(
        `UPDATE calls SET status = $1, ended_at = $2, duration_seconds = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [call.status, call.endedAt || null, call.durationSeconds, call.id]
      );
    } catch {
      // Standalone mode support
    }

    return call;
  }


  public static seedSampleCallsIfEmpty(): void {
    if (this.calls.size > 0) return;

    const orgId = '00000000-0000-0000-0000-000000000001';
    const sampleCalls: CallRecord[] = [
      {
        id: 'c1111111-0000-0000-0000-000000000001',
        externalCallId: 'SIP-TRUNK-0941',
        organizationId: orgId,
        callerIdentifier: '+1 (555) 019-2834',
        destinationIdentifier: '1-800-VOX-BANK',
        status: 'ACTIVE',
        startedAt: new Date(Date.now() - 120000),
        durationSeconds: 120,
        metadata: { department: 'Treasury Wire Ops', channel: 'PSTN-INBOUND' },
        events: [{ type: 'CALL_STARTED', payload: {}, timestamp: new Date(Date.now() - 120000) }],
      },
      {
        id: 'c1111111-0000-0000-0000-000000000002',
        externalCallId: 'SIP-TRUNK-0942',
        organizationId: orgId,
        callerIdentifier: '+1 (555) 014-9912',
        destinationIdentifier: 'EXT-8801-IT-HELPDESK',
        status: 'VERIFYING',
        startedAt: new Date(Date.now() - 340000),
        durationSeconds: 340,
        metadata: { department: 'IT Helpdesk', channel: 'INTERNAL-PBX' },
        events: [{ type: 'CALL_STARTED', payload: {}, timestamp: new Date(Date.now() - 340000) }],
      },
    ];

    for (const c of sampleCalls) {
      this.calls.set(c.id, c);
    }
  }
}
