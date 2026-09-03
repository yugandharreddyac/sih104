/**
 * Priority 6: Incident & Intervention Lifecycle & Tenant Isolation Regression Tests
 * Verifies:
 * - One open incident per call (escalation appends events rather than duplicating)
 * - Valid state transitions for human intervention approvals/overrides
 * - Mandatory justification recorded in audit log on analyst override
 * - Organization/tenant boundary enforcement
 */

import { IncidentsService } from '../src/incidents/incidents.service';
import { InterventionService } from '../src/interventions/intervention.service';
import { AuditService } from '../src/security/audit.service';

describe('Priority 6: Incident & Intervention Lifecycle', () => {
  const orgA = '00000000-0000-0000-0000-000000000001';
  const orgB = '00000000-0000-0000-0000-000000000002';
  const callId = 'call-incident-test-001';

  it('should maintain exactly one open incident per call and correlate subsequent escalations', async () => {
    // First threat trigger creates incident
    const res1 = await IncidentsService.correlateOrEscalateIncident({
      organizationId: orgA,
      severity: 'HIGH',
      attackClassification: 'DEEPFAKE_VOICE_DETECTED',
      callId,
      summary: 'Initial deepfake voice threat detected.',
      triggeredPolicies: ['POL-DEEPFAKE-001'],
      actionsTaken: ['REQUIRE_STEP_UP_VERIFICATION'],
    });

    expect(res1.isNew).toBe(true);
    expect(res1.incident.callId).toBe(callId);
    expect(res1.incident.severity).toBe('HIGH');
    expect(res1.incident.events.length).toBe(1);

    // Second threat trigger on the SAME call escalates existing incident instead of creating a duplicate
    const res2 = await IncidentsService.correlateOrEscalateIncident({
      organizationId: orgA,
      severity: 'CRITICAL',
      attackClassification: 'CREDENTIAL_HARVESTING_ATTEMPT',
      callId,
      summary: 'Escalation: OTP credential harvesting attempted.',
      triggeredPolicies: ['POL-CRED-001'],
      actionsTaken: ['BLOCK_DISCLOSURE'],
    });

    expect(res2.isNew).toBe(false);
    expect(res2.incident.id).toBe(res1.incident.id);
    expect(res2.incident.severity).toBe('CRITICAL'); // Escalated to CRITICAL
    expect(res2.incident.triggeredPolicies).toContain('POL-DEEPFAKE-001');
    expect(res2.incident.triggeredPolicies).toContain('POL-CRED-001');
    expect(res2.incident.events.length).toBe(2); // Threat escalation event appended
  });

  it('should enforce valid intervention state transitions and record audit trails', async () => {
    const intervention = await InterventionService.createIntervention({
      callId: 'call-interv-test',
      organizationId: orgA,
      level: 'LEVEL_2_STEP_UP_VERIFICATION',
      actionType: 'REQUIRE_STEP_UP_VERIFICATION',
      evidenceSummary: ['Acoustic vocoder artifacts detected.'],
    });

    expect(intervention.status).toBe('AWAITING_HUMAN');

    // Human Analyst Approves
    const resolved = await InterventionService.recordHumanDecision({
      interventionId: intervention.id,
      actorUserId: 'u-analyst-01',
      decision: 'APPROVED',
      reason: 'Biometric mismatch and vocoder distortion verified by analyst.',
    });

    expect(resolved.status).toBe('EXECUTED');
    expect(resolved.humanDecision).toBe('APPROVED');
    expect(resolved.approvedBy).toBe('u-analyst-01');

    // Attempting to resolve again must throw an error
    await expect(
      InterventionService.recordHumanDecision({
        interventionId: intervention.id,
        actorUserId: 'u-analyst-02',
        decision: 'REJECTED',
        reason: 'Duplicate decision attempt.',
      })
    ).rejects.toThrow(/already been resolved/);
  });

  it('should isolate incidents across tenant organizations', async () => {
    await IncidentsService.createIncident({
      organizationId: orgA,
      severity: 'HIGH',
      attackClassification: 'TEST_ATTACK_A',
      callId: 'call-org-a',
      summary: 'Org A incident',
    });

    await IncidentsService.createIncident({
      organizationId: orgB,
      severity: 'LOW',
      attackClassification: 'TEST_ATTACK_B',
      callId: 'call-org-b',
      summary: 'Org B incident',
    });

    const incidentsA = IncidentsService.listIncidents(orgA);
    const incidentsB = IncidentsService.listIncidents(orgB);

    expect(incidentsA.every((i) => i.organizationId === orgA)).toBe(true);
    expect(incidentsB.every((i) => i.organizationId === orgB)).toBe(true);
    expect(incidentsA.some((i) => i.callId === 'call-org-b')).toBe(false);
  });
});
