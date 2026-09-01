import { v4 as uuidv4 } from 'uuid';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { AuditService } from '../security/audit.service';
import { db } from '../database/db';

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
  targetIdentityMasked: string; // e.g. "cfo-approval@corp.internal" or "***-***-1928"
  verificationPayloadMasked: Record<string, any>;
  notes: string;
}

export class VerificationService {
  private static requests: Map<string, VerificationRequest> = new Map();

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

    // Mask target identity for privacy
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

    this.requests.set(id, req);

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

  public static listRequests(organizationId?: string): VerificationRequest[] {
    this.seedSampleRequestsIfEmpty();
    const all = Array.from(this.requests.values());
    if (organizationId) {
      return all.filter((r) => r.organizationId === organizationId);
    }
    return all;
  }

  public static getRequestById(id: string): VerificationRequest | null {
    this.seedSampleRequestsIfEmpty();
    return this.requests.get(id) || null;
  }

  public static async resolveRequest(
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    actorUserId?: string,
    notes?: string
  ): Promise<VerificationRequest> {
    const req = this.requests.get(id);
    if (!req) {
      throw new Error(`Verification request ${id} not found`);
    }

    req.status = status;
    req.completedAt = new Date();
    if (notes) {
      req.notes = `${req.notes} | Resolution note: ${notes}`;
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
