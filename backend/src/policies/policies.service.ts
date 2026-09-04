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
          {
            id: 'rule-pin-block',
            name: 'Block PIN Solicitation',
            description: 'IF requested_information = PIN THEN WARN + BLOCK_DISCLOSURE',
            conditions: [
              { field: 'requested_information', operator: 'EQUALS', value: 'PIN' },
            ],
            action: 'BLOCK_DISCLOSURE',
            priority: 10,
          },
          {
            id: 'rule-password-block',
            name: 'Block Password Solicitation',
            description: 'IF requested_information = PASSWORD THEN WARN + BLOCK_DISCLOSURE',
            conditions: [
              { field: 'requested_information', operator: 'EQUALS', value: 'PASSWORD' },
            ],
            action: 'BLOCK_DISCLOSURE',
            priority: 10,
          },
          {
            id: 'rule-credential-theft-block',
            name: 'Block High Credential Theft Threat',
            description: 'IF credential_theft_risk = HIGH THEN BLOCK_DISCLOSURE',
            conditions: [
              { field: 'credential_theft_risk', operator: 'EQUALS', value: 'HIGH' },
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
          {
            id: 'rule-financial-fraud-block',
            name: 'Block Critical Financial Fraud Workflows',
            description: 'IF financial_fraud_risk = CRITICAL THEN BLOCK_PROTECTED_WORKFLOW',
            conditions: [
              { field: 'financial_fraud_risk', operator: 'EQUALS', value: 'CRITICAL' },
            ],
            action: 'BLOCK_PROTECTED_WORKFLOW',
            priority: 15,
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
      {
        id: 'pol-004-identity-defense',
        organizationId: defaultOrgId,
        name: 'Biometric Speaker Impersonation Defense',
        description: 'Requires step-up authentication when speaker biometrics mismatch claimed identity.',
        isActive: true,
        rules: [
          {
            id: 'rule-biometric-mismatch-step-up',
            name: 'Require Step-Up Verification on Speaker Mismatch',
            description: 'IF speaker_mismatch = true THEN REQUIRE_STEP_UP_VERIFICATION',
            conditions: [
              { field: 'speaker_mismatch', operator: 'EQUALS', value: true },
            ],
            action: 'REQUIRE_STEP_UP_VERIFICATION',
            priority: 20,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'pol-005-replay-containment',
        organizationId: defaultOrgId,
        name: 'Acoustic Replay Attack Interception',
        description: 'Requires step-up authentication when acoustic replay cues are detected.',
        isActive: true,
        rules: [
          {
            id: 'rule-replay-step-up',
            name: 'Require Step-Up on Acoustic Replay',
            description: 'IF replay_risk = HIGH THEN REQUIRE_STEP_UP_VERIFICATION',
            conditions: [
              { field: 'replay_risk', operator: 'EQUALS', value: 'HIGH' },
            ],
            action: 'REQUIRE_STEP_UP_VERIFICATION',
            priority: 20,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'pol-006-social-engineering-defense',
        organizationId: defaultOrgId,
        name: 'Social Engineering & Coercion Defense',
        description: 'Escalates verification when aggressive social engineering tactics are observed.',
        isActive: true,
        rules: [
          {
            id: 'rule-social-engineering-step-up',
            name: 'Require Step-Up on High Social Engineering Pressure',
            description: 'IF social_engineering_risk = HIGH THEN REQUIRE_STEP_UP_VERIFICATION',
            conditions: [
              { field: 'social_engineering_risk', operator: 'EQUALS', value: 'HIGH' },
            ],
            action: 'REQUIRE_STEP_UP_VERIFICATION',
            priority: 20,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'pol-007-account-takeover-defense',
        organizationId: defaultOrgId,
        name: 'Account Takeover & Verification Bypass Interception',
        description: 'Blocks or steps-up when verification bypass or takeover patterns emerge.',
        isActive: true,
        rules: [
          {
            id: 'rule-account-takeover-step-up',
            name: 'Require Step-Up on Account Takeover Risk',
            description: 'IF account_takeover_risk = HIGH THEN REQUIRE_STEP_UP_VERIFICATION',
            conditions: [
              { field: 'account_takeover_risk', operator: 'EQUALS', value: 'HIGH' },
            ],
            action: 'REQUIRE_STEP_UP_VERIFICATION',
            priority: 20,
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
