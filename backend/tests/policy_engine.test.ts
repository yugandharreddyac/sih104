import { PolicyEngine } from '../src/policies/policy_engine';
import { PoliciesService } from '../src/policies/policies.service';

describe('Deterministic Policy Engine Unit Tests', () => {
  beforeAll(() => {
    PoliciesService.initializeDefaultPolicies();
  });

  it('should enforce BLOCK_DISCLOSURE when requested_information is OTP', async () => {
    const context = {
      requested_information: 'OTP',
      caller_type: 'EXTERNAL_INBOUND',
    };

    const result = await PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
    expect(result.allowed).toBe(false);
    expect(result.actionsTriggered).toContain('BLOCK_DISCLOSURE');
    expect(result.matchedRules.length).toBeGreaterThan(0);
  });

  it('should enforce REQUIRE_STEP_UP_VERIFICATION for unverified high-value wire transfers', async () => {
    const context = {
      transaction_type: 'HIGH_VALUE',
      identity_verified: false,
    };

    const result = await PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
    expect(result.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
  });

  it('should block protected workflows when deepfake risk is HIGH and action risk is CRITICAL', async () => {
    const context = {
      deepfake_risk: 'HIGH',
      action_risk: 'CRITICAL',
    };

    const result = await PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
    expect(result.allowed).toBe(false);
    expect(result.actionsTriggered).toContain('BLOCK_PROTECTED_WORKFLOW');
  });

  it('should allow benign transactions with no matching blocking rules', async () => {
    const context = {
      transaction_type: 'BALANCE_INQUIRY',
      requested_information: 'ACCOUNT_STATEMENT_EMAIL',
      identity_verified: true,
    };

    const result = await PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
    expect(result.allowed).toBe(true);
    expect(result.actionsTriggered.length).toBe(0);
  });
});
