/**
 * VOXSHIELD Core Security Abstractions & Specification
 */

export interface SecurityContext {
  organizationId: string;
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId: string;
}

export interface SecurityPolicyViolation {
  policyId: string;
  ruleId: string;
  violationType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedAt: Date;
}
