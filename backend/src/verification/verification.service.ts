import { v4 as uuidv4 } from 'uuid';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { AuditService } from '../security/audit.service';
import { env, isStrictMode } from '../config/env';
import { redisDb } from '../database/redis';

export type VerificationMechanism =
  | 'AUTHENTICATOR_PUSH'
  | 'IDP_VERIFIED_APP'
  | 'CORPORATE_CHANNEL'
  | 'INDEPENDENT_CALLBACK'
  | 'DUAL_AUTHORIZATION';

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface VerificationRequest {
  id: string;
  callId: string;
  organizationId: string;
  mechanism: VerificationMechanism;
  status: VerificationStatus;
  requestedAt: Date;
  completedAt?: Date;
  targetIdentityMasked: string;
  verificationPayloadMasked: Record<string, any>;
  notes: string;
}

export class VerificationService {
  // In-memory fallback for gracefully degraded mode
  private static requests: Map<string, VerificationRequest> = new Map();
  private static readonly REDIS_PREFIX = 'verification:';
  private static readonly TTL_SECONDS = 3600; // 1 hour expiration

  public static async createVerificationRequest(params: {
    callId: string;
    organizationId: string;
    mechanism: VerificationMechanism;
    targetIdentity: string;
    payload?: Record<string, any>;
    actorUserId?: string;
  }): Promise<VerificationRequest> {
    const id = uuidv4();
    const sanitizedPayload = PrivacyFirewall.sanitizeObject(params.payload || {});

    const maskedIdentity =
      params.targetIdentity.length > 4
        ? `${params.targetIdentity.slice(0, 3)}***${params.targetIdentity.slice(-2)}`
        : '***';

    const req: VerificationRequest = {
      id,
      callId: params.callId,
      organizationId: params.organizationId,
      mechanism: params.mechanism,
      status: 'PENDING',
      requestedAt: new Date(),
      targetIdentityMasked: maskedIdentity,
      verificationPayloadMasked: sanitizedPayload,
      notes: `Independent step-up verification initiated via ${params.mechanism}. Decoupled from active voice stream.`,
    };

    if (redisDb.isAvailable()) {
      await redisDb.set(`${this.REDIS_PREFIX}${id}`, JSON.stringify(req), this.TTL_SECONDS);
    } else {
      if (isStrictMode()) {
        throw new Error('DATABASE_UNAVAILABLE: Cannot safely create distributed verification request.');
      }
      // Degraded mode fallback
      this.requests.set(id, req);
    }

    await AuditService.record({
      actorUserId: params.actorUserId,
      organizationId: params.organizationId,
      action: 'STEP_UP_VERIFICATION_TRIGGERED',
      resourceType: 'VERIFICATION',
      resourceId: id,
      result: 'SUCCESS',
      metadata: { callId: params.callId, mechanism: params.mechanism },
    });

    return req;
  }

  public static async listRequests(organizationId?: string): Promise<VerificationRequest[]> {
    this.seedSampleRequestsIfEmpty();
    let all: VerificationRequest[] = [];

    if (redisDb.isAvailable()) {
      const client = redisDb.getClient();
      if (client) {
        try {
          const keys = await client.keys(`${this.REDIS_PREFIX}*`);
          for (const key of keys) {
            const data = await client.get(key);
            if (data) all.push(JSON.parse(data));
          }
        } catch {
          // Ignore and fallback to gathering whatever is in memory
        }
      }
    }

    // Merge in-memory fallback items
    for (const [id, req] of this.requests.entries()) {
      if (!all.find((r) => r.id === id)) {
        all.push(req);
      }
    }

    if (organizationId) {
      return all.filter((r) => r.organizationId === organizationId);
    }
    return all;
  }

  public static async getRequestById(id: string): Promise<VerificationRequest | null> {
    this.seedSampleRequestsIfEmpty();
    
    if (redisDb.isAvailable()) {
      const data = await redisDb.get(`${this.REDIS_PREFIX}${id}`);
      if (data) {
        return JSON.parse(data);
      }
    }

    return this.requests.get(id) || null;
  }

  public static async resolveRequest(
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    actorUserId?: string,
    notes?: string
  ): Promise<VerificationRequest> {
    const req = await this.getRequestById(id);
    if (!req) {
      throw new Error(`Verification request ${id} not found`);
    }

    req.status = status;
    req.completedAt = new Date();
    if (notes) {
      req.notes = `${req.notes} | Resolution note: ${notes}`;
    }

    // Persist update
    if (redisDb.isAvailable()) {
      const client = redisDb.getClient();
      if (client) {
        // Find remaining TTL so we don't accidentally make it permanent or change expiration drastically
        let remainingTtl = this.TTL_SECONDS;
        try {
          const currentTtl = await client.ttl(`${this.REDIS_PREFIX}${id}`);
          if (currentTtl > 0) remainingTtl = currentTtl;
        } catch {}
        await redisDb.set(`${this.REDIS_PREFIX}${id}`, JSON.stringify(req), remainingTtl);
      }
    }
    
    // Also update in memory if it was a degraded mode request
    if (this.requests.has(id)) {
      this.requests.set(id, req);
    }

    await AuditService.record({
      actorUserId,
      organizationId: req.organizationId,
      action: `STEP_UP_VERIFICATION_${status}`,
      resourceType: 'VERIFICATION',
      resourceId: id,
      result: status === 'APPROVED' ? 'SUCCESS' : 'DENIED',
      metadata: { callId: req.callId, mechanism: req.mechanism },
    });

    return req;
  }

  private static seedSampleRequestsIfEmpty(): void {
    if (this.requests.size > 0) return;

    const orgId = '00000000-0000-0000-0000-000000000001';
    const sample: VerificationRequest = {
      id: 'v1111111-0000-0000-0000-000000000001',
      callId: 'c1111111-0000-0000-0000-000000000002',
      organizationId: orgId,
      mechanism: 'AUTHENTICATOR_PUSH',
      status: 'PENDING',
      requestedAt: new Date(Date.now() - 180000),
      targetIdentityMasked: 'usr***28',
      verificationPayloadMasked: { action: 'MFA_RESET_CONFIRMATION', channel: 'OKTA_VERIFY_PUSH' },
      notes: 'Independent push notification dispatched to enrolled Okta Authenticator.',
    };

    this.requests.set(sample.id, sample);
  }
}
