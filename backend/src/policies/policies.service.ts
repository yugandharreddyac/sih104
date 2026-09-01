import { v4 as uuidv4 } from 'uuid';
import { Policy, PolicyEvaluationContext, PolicyEvaluationResult } from './policy.types';
import { PolicyEngine } from './policy_engine';
import { AuditService } from '../security/audit.service';
import { db } from '../database/db';

export class PoliciesService {
  private static policies: Map<string, Policy> = new Map();

  public static initializeDefaultPolicies(): void {
    if (this.policies.size > 0) return;

    const defaultOrgId = '00000000-0000-0000-0000-000000000001';

    const defaultPolicies: Policy[] = [
      {
        id: 'pol-001-otp-protection',
        organizationId: defaultOrgId,
        name: 'Authentication Secret & OTP Exfiltration Prevention',
        description: 'Blocks verbal or automated disclosure of OTP, PIN, and password tokens.',
        isActive: true,
        rules: [
          {
            id: 'rule-otp-block',
            name: 'Block OTP Disclosure',
            description: 'IF requested_information = OTP THEN WARN + BLOCK_DISCLOSURE',
            conditions: [
              { field: 'requested_information', operator: 'EQUALS', value: 'OTP' },
            ],
            action: 'BLOCK_DISCLOSURE',
            priority: 10,
          },
          {
            id: 'rule-cvv-block',
            name: 'Block Card CVV Solicitation',
            description: 'IF requested_information = CVV THEN WARN + BLOCK_DISCLOSURE',
            conditions: [
              { field: 'requested_information', operator: 'EQUALS', value: 'CVV' },
            ],
            action: 'BLOCK_DISCLOSURE',
            priority: 10,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'pol-002-high-value-wire',
        organizationId: defaultOrgId,
        name: 'High-Value Financial Transaction Defense',
        description: 'Enforces out-of-band step-up authentication for high-value financial actions.',
        isActive: true,
        rules: [
          {
            id: 'rule-high-value-wire-step-up',
            name: 'Require Out-of-Band Step-Up Verification',
            description: 'IF transaction = HIGH_VALUE AND caller_identity != independently_verified THEN REQUIRE_STEP_UP_VERIFICATION',
            conditions: [
              { field: 'transaction_type', operator: 'EQUALS', value: 'HIGH_VALUE' },
              { field: 'identity_verified', operator: 'EQUALS', value: false },
            ],
            action: 'REQUIRE_STEP_UP_VERIFICATION',
            priority: 20,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'pol-003-deepfake-containment',
        organizationId: defaultOrgId,
        name: 'Acoustic Deepfake & Impersonation Interception',
        description: 'Blocks critical workflows when high acoustic spoof risk coincides with critical action.',
        isActive: true,
        rules: [
          {
            id: 'rule-deepfake-critical-block',
            name: 'Block Critical Workflow on Deepfake Anomaly',
            description: 'IF deepfake_risk = HIGH AND action_risk = CRITICAL THEN BLOCK_PROTECTED_WORKFLOW',
            conditions: [
              { field: 'deepfake_risk', operator: 'EQUALS', value: 'HIGH' },
              { field: 'action_risk', operator: 'EQUALS', value: 'CRITICAL' },
            ],
            action: 'BLOCK_PROTECTED_WORKFLOW',
            priority: 5,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const p of defaultPolicies) {
      this.policies.set(p.id, p);
    }
  }

  public static listPolicies(organizationId?: string): Policy[] {
    this.initializeDefaultPolicies();
    const all = Array.from(this.policies.values());
    if (organizationId) {
      return all.filter((p) => p.organizationId === organizationId);
    }
    return all;
  }

  public static getPolicyById(id: string): Policy | null {
    this.initializeDefaultPolicies();
    return this.policies.get(id) || null;
  }

  public static async createPolicy(
    orgId: string,
    policyData: Omit<Policy, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
  ): Promise<Policy> {
    this.initializeDefaultPolicies();
    const id = uuidv4();
    const policy: Policy = {
      id,
      organizationId: orgId,
      name: policyData.name,
      description: policyData.description,
      isActive: policyData.isActive ?? true,
      rules: policyData.rules || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.policies.set(id, policy);

    await AuditService.record({
      organizationId: orgId,
      action: 'POLICY_CREATED',
      resourceType: 'POLICY',
      resourceId: id,
      result: 'SUCCESS',
      metadata: { name: policy.name, rulesCount: policy.rules.length },
    });

    return policy;
  }

  public static evaluateContext(
    organizationId: string,
    context: PolicyEvaluationContext
  ): PolicyEvaluationResult {
    this.initializeDefaultPolicies();
    const activePolicies = this.listPolicies(organizationId).filter((p) => p.isActive);
    return PolicyEngine.evaluate(activePolicies, context);
  }
}
