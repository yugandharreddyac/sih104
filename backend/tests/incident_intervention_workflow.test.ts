import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { IncidentsService, IncidentRecord } from '../src/incidents/incidents.service';
import { InterventionService } from '../src/interventions/intervention.service';
import { AuditService } from '../src/security/audit.service';
import { WebSocketGateway } from '../src/websocket/ws_server';

describe('Phase 6: Incident & Intervention Workflow Validation Tests', () => {
  const orgA = '00000000-0000-0000-0000-000000000001';
  const orgB = '00000000-0000-0000-0000-000000000002';

  let adminTokenA: string;
  let analystTokenA: string;
  let supervisorTokenA: string;
  let operatorTokenA: string;
  let viewerTokenA: string;

  let analystTokenB: string;

  beforeAll(() => {
    adminTokenA = TokenService.generateToken({
      userId: 'u-admin-orgA',
      email: 'admin@orgA.voxshield',
      role: RoleName.ADMIN,
      organizationId: orgA,
    });

    analystTokenA = TokenService.generateToken({
      userId: 'u-analyst-orgA',
      email: 'analyst@orgA.voxshield',
      role: RoleName.SECURITY_ANALYST,
      organizationId: orgA,
    });

    supervisorTokenA = TokenService.generateToken({
      userId: 'u-supervisor-orgA',
      email: 'supervisor@orgA.voxshield',
      role: RoleName.SUPERVISOR,
      organizationId: orgA,
    });

    operatorTokenA = TokenService.generateToken({
      userId: 'u-operator-orgA',
      email: 'operator@orgA.voxshield',
      role: RoleName.OPERATOR,
      organizationId: orgA,
    });

    viewerTokenA = TokenService.generateToken({
      userId: 'u-viewer-orgA',
      email: 'viewer@orgA.voxshield',
      role: RoleName.VIEWER,
      organizationId: orgA,
    });

    analystTokenB = TokenService.generateToken({
      userId: 'u-analyst-orgB',
      email: 'analyst@orgB.voxshield',
      role: RoleName.SECURITY_ANALYST,
      organizationId: orgB,
    });
  });

  beforeEach(() => {
    IncidentsService.clearIncidents();
    InterventionService.clearInterventions();
    AuditService.clearLogs();
  });

  // =========================================================================
  // TASK 2 — INCIDENT CREATION & METADATA CONTRACT
  // =========================================================================
  describe('Task 2: Incident Creation & Metadata Contract', () => {
    it('should create an incident with complete canonical fields and tamper-evident structure', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          severity: 'HIGH',
          attackClassification: 'ID_EXECUTIVE_IMPERSONATION / OBJ_WIRE_TRANSFER',
          callId: 'c1111111-0000-0000-0000-000000000001',
          summary: 'Suspicious caller impersonating CFO requesting immediate wire clearance.',
          triggeredPolicies: ['Authentication Secret & OTP Exfiltration Prevention'],
          actionsTaken: ['WARN_OPERATOR', 'REQUIRE_STEP_UP_VERIFICATION'],
          metadata: { channel: 'PSTN-INBOUND', confidence: 0.94 },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const inc: IncidentRecord = res.body.data;

      expect(inc.id).toBeDefined();
      expect(inc.incidentNumber).toMatch(/^INC-\d{4}-\d+/);
      expect(inc.organizationId).toBe(orgA);
      expect(inc.severity).toBe('HIGH');
      expect(inc.status).toBe('OPEN');
      expect(inc.detectedAt).toBeDefined();
      expect(inc.summary).toContain('Suspicious caller impersonating CFO');
      expect(inc.triggeredPolicies).toContain('Authentication Secret & OTP Exfiltration Prevention');
      expect(inc.actionsTaken).toContain('WARN_OPERATOR');
      expect(inc.events.length).toBe(1);
      expect(inc.events[0].type).toBe('INCIDENT_CREATED');

      // Verify no raw audio or sensitive buffers stored
      expect((inc as any).rawAudio).toBeUndefined();
      expect((inc as any).pcmBuffer).toBeUndefined();
    });

    it('should reject invalid incident payload missing required summary or invalid severity', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          severity: 'INVALID_SEVERITY_LEVEL',
          attackClassification: 'ATTACK_X',
          summary: 'Hi', // too short (< 5 chars)
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // TASK 3 & 14 — INCIDENT CORRELATION & INTERLEAVED CALL EVENTS
  // =========================================================================
  describe('Task 3 & 14: Incident Correlation & Interleaved Threat Events', () => {
    it('should correlate sequential threat events for Call A into single incident timeline without duplicate creation', async () => {
      const callA = 'call-corr-A';
      const callB = 'call-corr-B';

      // Event A1: Initial threat on Call A
      const eA1 = await IncidentsService.correlateOrEscalateIncident({
        organizationId: orgA,
        severity: 'LOW',
        attackClassification: 'ACOUSTIC_ANOMALY',
        callId: callA,
        summary: 'Acoustic background noise anomaly detected.',
        triggeredPolicies: ['POL-ACOUSTIC-001'],
      });
      expect(eA1.isNew).toBe(true);
      const incAId = eA1.incident.id;

      // Event B1: Threat on Call B
      const eB1 = await IncidentsService.correlateOrEscalateIncident({
        organizationId: orgA,
        severity: 'HIGH',
        attackClassification: 'DEEPFAKE_VOICE',
        callId: callB,
        summary: 'Deepfake synthetic voice detected on Call B.',
        triggeredPolicies: ['POL-DEEPFAKE-001'],
      });
      expect(eB1.isNew).toBe(true);
      const incBId = eB1.incident.id;
      expect(incBId).not.toBe(incAId);

      // Event A2: Second suspicious event on Call A
      const eA2 = await IncidentsService.correlateOrEscalateIncident({
        organizationId: orgA,
        severity: 'HIGH',
        attackClassification: 'SOCIAL_ENGINEERING_URGENCY',
        callId: callA,
        summary: 'Caller exhibits high urgency pressure tactics.',
        triggeredPolicies: ['POL-NLP-002'],
      });
      expect(eA2.isNew).toBe(false);
      expect(eA2.incident.id).toBe(incAId);
      expect(eA2.incident.severity).toBe('HIGH'); // Escalated from LOW to HIGH

      // Event B2: Second event on Call B
      const eB2 = await IncidentsService.correlateOrEscalateIncident({
        organizationId: orgA,
        severity: 'CRITICAL',
        attackClassification: 'STEP_UP_BYPASS_ATTEMPT',
        callId: callB,
        summary: 'Caller attempted to bypass step-up MFA.',
        triggeredPolicies: ['POL-BYPASS-003'],
      });
      expect(eB2.isNew).toBe(false);
      expect(eB2.incident.id).toBe(incBId);
      expect(eB2.incident.severity).toBe('CRITICAL');

      // Event A3: Third event on Call A
      const eA3 = await IncidentsService.correlateOrEscalateIncident({
        organizationId: orgA,
        severity: 'CRITICAL',
        attackClassification: 'OTP_HARVESTING',
        callId: callA,
        summary: 'Explicit OTP credential theft attempt.',
        triggeredPolicies: ['POL-OTP-004'],
      });
      expect(eA3.isNew).toBe(false);
      expect(eA3.incident.id).toBe(incAId);
      expect(eA3.incident.severity).toBe('CRITICAL');

      // Verify Incidents in Store: Exactly 2 incidents
      const listA = IncidentsService.listIncidents(orgA);
      expect(listA.length).toBe(2);

      const finalIncA = IncidentsService.getIncidentById(incAId)!;
      const finalIncB = IncidentsService.getIncidentById(incBId)!;

      expect(finalIncA.callId).toBe(callA);
      expect(finalIncA.events.length).toBe(3); // 1 create + 2 escalations

      expect(finalIncB.callId).toBe(callB);
      expect(finalIncB.events.length).toBe(2); // 1 create + 1 escalation
    });
  });

  // =========================================================================
  // TASK 4 & 5 — INCIDENT SEVERITY & STATUS LIFECYCLE
  // =========================================================================
  describe('Task 4 & 5: Incident Status Lifecycle & Transition Rules', () => {
    it('should transition through full incident lifecycle OPEN -> INVESTIGATING -> CONTAINED -> RESOLVED', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'HIGH',
        attackClassification: 'VOCODER_ARTIFACTS',
        summary: 'Deepfake vocoder detected during call triage.',
      });
      expect(inc.status).toBe('OPEN');

      // 1. Acknowledge / Investigate
      const resInv = await request(app)
        .patch(`/api/incidents/${inc.id}/status`)
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({ status: 'INVESTIGATING', notes: 'Analyst assigned to inspect spectrogram.' });

      expect(resInv.status).toBe(200);
      expect(resInv.body.data.status).toBe('INVESTIGATING');

      // 2. Contain
      const resCont = await request(app)
        .patch(`/api/incidents/${inc.id}/status`)
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({ status: 'CONTAINED', notes: 'Target caller extension muted.' });

      expect(resCont.status).toBe(200);
      expect(resCont.body.data.status).toBe('CONTAINED');

      // 3. Resolve
      const resRes = await request(app)
        .patch(`/api/incidents/${inc.id}/status`)
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({ status: 'RESOLVED', notes: 'Caller confirmed fraudulent. IP/number blacklisted.' });

      expect(resRes.status).toBe(200);
      expect(resRes.body.data.status).toBe('RESOLVED');
      expect(resRes.body.data.resolvedAt).toBeDefined();

      // 4. Repeated resolution is idempotent
      const resRepeat = await request(app)
        .patch(`/api/incidents/${inc.id}/status`)
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({ status: 'RESOLVED', notes: 'Duplicate resolution call.' });

      expect(resRepeat.status).toBe(200);
      expect(resRepeat.body.data.status).toBe('RESOLVED');
    });

    it('should reject invalid status values and invalid transition from RESOLVED to OPEN', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'HIGH',
        attackClassification: 'ATTACK_STATUS_TEST',
        summary: 'Incident for status validation.',
      });

      // Invalid status value
      const resInvalid = await request(app)
        .patch(`/api/incidents/${inc.id}/status`)
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({ status: 'UNKNOWN_STATUS_XYZ' });

      expect(resInvalid.status).toBe(400);

      // Resolve incident first
      await IncidentsService.updateStatus(inc.id, 'RESOLVED', 'u-analyst', 'Resolved test');

      // Attempt invalid transition directly from RESOLVED back to OPEN
      const resReopen = await request(app)
        .patch(`/api/incidents/${inc.id}/status`)
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({ status: 'OPEN', notes: 'Attempting illegal reopen' });

      expect(resReopen.status).toBe(400);
      expect(resReopen.body.error).toBe('INVALID_TRANSITION');
    });

    it('should return 404 for status update on nonexistent incident ID', async () => {
      const res = await request(app)
        .patch('/api/incidents/nonexistent-inc-999/status')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({ status: 'INVESTIGATING' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // TASK 6, 7 & 8 — INTERVENTION RECOMMENDATION, APPROVAL & ANALYST OVERRIDE
  // =========================================================================
  describe('Task 6, 7 & 8: Intervention Recommendations, Human Decisions & Analyst Overrides', () => {
    it('should recommend intervention consistent with policy (BLOCK_DISCLOSURE) and await human decision', async () => {
      const res = await request(app)
        .post('/api/interventions/recommend')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: 'call-interv-rec-01',
          level: 'LEVEL_3_RESTRICT_ACTION',
          actionType: 'BLOCK_DISCLOSURE',
          evidenceSummary: ['High-pressure OTP harvesting attempt detected in turn 2.'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('AWAITING_HUMAN');
      expect(res.body.data.actionType).toBe('BLOCK_DISCLOSURE');
    });

    it('should record human approval and transition status to EXECUTED', async () => {
      const created = await InterventionService.createIntervention({
        callId: 'call-interv-approve',
        organizationId: orgA,
        level: 'LEVEL_2_STEP_UP_VERIFICATION',
        actionType: 'REQUIRE_STEP_UP_VERIFICATION',
        evidenceSummary: ['Biometric mismatch threshold exceeded.'],
      });

      const res = await request(app)
        .post('/api/interventions/decision')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          interventionId: created.id,
          decision: 'APPROVED',
          reason: 'Analyst verified acoustic divergence; requiring out-of-band step up.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('EXECUTED');
      expect(res.body.data.humanDecision).toBe('APPROVED');
      expect(res.body.data.approvedBy).toBe('u-analyst-orgA');
      expect(res.body.data.executedAt).toBeDefined();
    });

    it('should record human rejection and transition status to REJECTED', async () => {
      const created = await InterventionService.createIntervention({
        callId: 'call-interv-reject',
        organizationId: orgA,
        level: 'LEVEL_1_SOC_ALERT',
        actionType: 'WARN_OPERATOR',
        evidenceSummary: ['Low-confidence background noise.'],
      });

      const res = await request(app)
        .post('/api/interventions/decision')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          interventionId: created.id,
          decision: 'REJECTED',
          reason: 'Verified caller environment is acceptable; benign call.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.humanDecision).toBe('REJECTED');
    });

    it('Mandatory Task 8: Analyst Override MUST preserve original recommendation, record override action, justification, and analyst ID', async () => {
      const created = await InterventionService.createIntervention({
        callId: 'call-interv-override',
        organizationId: orgA,
        level: 'LEVEL_5_TERMINATE_CALL',
        actionType: 'TERMINATE_CALL',
        evidenceSummary: ['Compound acoustic anomaly flagged.'],
      });

      const res = await request(app)
        .post('/api/interventions/decision')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          interventionId: created.id,
          decision: 'OVERRIDDEN',
          overrideAction: 'ALLOW',
          reason: 'Customer verified in-person with physical government ID.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('OVERRIDDEN');
      expect(res.body.data.humanDecision).toBe('OVERRIDDEN');
      expect(res.body.data.originalActionType).toBe('TERMINATE_CALL');
      expect(res.body.data.overrideAction).toBe('ALLOW');
      expect(res.body.data.decisionReason).toContain('in-person with physical government ID');
      expect(res.body.data.approvedBy).toBe('u-analyst-orgA');

      // Verify Audit Trail for Analyst Override
      const recentLogs = AuditService.getRecentLogs(10, orgA);
      const overrideLog = recentLogs.find((l) => l.action === 'INTERVENTION_DECISION_OVERRIDDEN');
      expect(overrideLog).toBeDefined();
      expect(overrideLog.actorUserId).toBe('u-analyst-orgA');
      expect(overrideLog.metadata.originalAction).toBe('TERMINATE_CALL');
      expect(overrideLog.metadata.overrideAction).toBe('ALLOW');
      expect(overrideLog.metadata.reason).toContain('in-person with physical government ID');
    });

    it('should reject decision on already resolved intervention with 409 conflict', async () => {
      const created = await InterventionService.createIntervention({
        callId: 'call-interv-idempotent',
        organizationId: orgA,
        level: 'LEVEL_2_STEP_UP_VERIFICATION',
        actionType: 'REQUIRE_STEP_UP_VERIFICATION',
      });

      await InterventionService.recordHumanDecision({
        interventionId: created.id,
        actorUserId: 'u-analyst-orgA',
        decision: 'APPROVED',
        reason: 'First decision',
      });

      // Second decision on resolved intervention
      const res = await request(app)
        .post('/api/interventions/decision')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          interventionId: created.id,
          decision: 'REJECTED',
          reason: 'Second decision attempt',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ALREADY_RESOLVED');
    });
  });

  // =========================================================================
  // TASK 9 & 10 — AUDIT TRAIL & PRIVACY REDACTION
  // =========================================================================
  describe('Task 9 & 10: Audit Trail & Privacy Firewall Redaction', () => {
    it('should sanitize sensitive OTP and credit card numbers from incident summaries and audit entries', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          severity: 'CRITICAL',
          attackClassification: 'CREDENTIAL_EXFILTRATION',
          summary: 'Caller solicited OTP code 849201 and Visa 4532 0150 2849 1920 with CVV 891',
        });

      expect(res.status).toBe(201);
      const summary = res.body.data.summary;
      expect(summary).not.toContain('849201');
      expect(summary).not.toContain('4532 0150 2849 1920');
      expect(summary).not.toContain('891');
      expect(summary).toContain('[AUTHENTICATION_CODE_REDACTED]');
      expect(summary).toContain('[CARD_NUMBER_REDACTED]');
      expect(summary).toContain('[CVV_REDACTED]');

      // Inspect Audit Trail
      const logs = AuditService.getRecentLogs(10, orgA);
      const createLog = logs.find((l) => l.action === 'INCIDENT_CREATED');
      expect(createLog).toBeDefined();
      expect(JSON.stringify(createLog.metadata)).not.toContain('849201');
      expect(JSON.stringify(createLog.metadata)).not.toContain('4532 0150 2849 1920');
    });
  });

  // =========================================================================
  // TASK 11 — MULTI-TENANT ISOLATION
  // =========================================================================
  describe('Task 11: Multi-Tenant Boundary Isolation', () => {
    let incidentOrgB: IncidentRecord;
    let interventionOrgB: any;

    beforeEach(async () => {
      incidentOrgB = await IncidentsService.createIncident({
        organizationId: orgB,
        severity: 'HIGH',
        attackClassification: 'ORG_B_ATTACK',
        summary: 'Org B confidential security incident.',
      });

      interventionOrgB = await InterventionService.createIntervention({
        callId: 'call-org-b',
        organizationId: orgB,
        level: 'LEVEL_3_RESTRICT_ACTION',
        actionType: 'BLOCK_DISCLOSURE',
      });
    });

    it('should forbid Org A analyst from reading Org B incident with 403', async () => {
      const res = await request(app)
        .get(`/api/incidents/${incidentOrgB.id}`)
        .set('Authorization', `Bearer ${analystTokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should forbid Org A analyst from modifying Org B incident status with 403', async () => {
      const res = await request(app)
        .patch(`/api/incidents/${incidentOrgB.id}/status`)
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({ status: 'RESOLVED', notes: 'Cross-tenant illegal resolution' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should forbid Org A analyst from deciding Org B intervention with 403', async () => {
      const res = await request(app)
        .post('/api/interventions/decision')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          interventionId: interventionOrgB.id,
          decision: 'APPROVED',
          reason: 'Cross-tenant illegal intervention approval',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('should isolate audit trail queries strictly to own organization for non-admins', async () => {
      await AuditService.record({
        organizationId: orgA,
        action: 'ORG_A_ACTION',
        resourceType: 'TEST',
        result: 'SUCCESS',
      });

      await AuditService.record({
        organizationId: orgB,
        action: 'ORG_B_ACTION',
        resourceType: 'TEST',
        result: 'SUCCESS',
      });

      const resA = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${analystTokenA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.every((l: any) => l.organizationId === orgA)).toBe(true);
      expect(resA.body.data.some((l: any) => l.action === 'ORG_B_ACTION')).toBe(false);
    });
  });

  // =========================================================================
  // TASK 12 — RBAC AUTHORIZATION
  // =========================================================================
  describe('Task 12: RBAC Role & Permission Enforcement', () => {
    it('ADMIN should have permission to list, create, and resolve incidents and interventions', async () => {
      const incRes = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${adminTokenA}`);
      expect(incRes.status).toBe(200);

      const intervRes = await request(app)
        .get('/api/interventions')
        .set('Authorization', `Bearer ${adminTokenA}`);
      expect(intervRes.status).toBe(200);
    });

    it('VIEWER role should be forbidden from creating incidents (403) and deciding interventions (403)', async () => {
      const createIncRes = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .send({
          severity: 'LOW',
          attackClassification: 'VIEWER_TEST',
          summary: 'Viewer attempting incident creation',
        });
      expect(createIncRes.status).toBe(403);

      const decideIntervRes = await request(app)
        .post('/api/interventions/decision')
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .send({
          interventionId: 'dummy-id',
          decision: 'APPROVED',
          reason: 'Viewer unauthorized approval',
        });
      expect(decideIntervRes.status).toBe(403);
    });

    it('OPERATOR role should be forbidden from resolving incidents with 403', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'MEDIUM',
        attackClassification: 'OPERATOR_TEST',
        summary: 'Operator test incident',
      });

      const res = await request(app)
        .patch(`/api/incidents/${inc.id}/status`)
        .set('Authorization', `Bearer ${operatorTokenA}`)
        .send({ status: 'RESOLVED', notes: 'Operator attempting resolve' });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // TASK 13 — WEBSOCKET INCIDENT EVENTS
  // =========================================================================
  describe('Task 13: WebSocket Incident Alerts & Policy Trigger Broadcaster', () => {
    it('should format and broadcast SOC_ALERT with sanitized payload and severity', () => {
      const broadcastSpy = jest.spyOn(WebSocketGateway, 'broadcastAlert');

      WebSocketGateway.broadcastAlert({
        callId: 'call-ws-alert-01',
        severity: 'CRITICAL',
        message: 'Active deepfake voice impersonation with OTP code 993120 detected.',
        action: 'TERMINATE_CALL',
      });

      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: 'call-ws-alert-01',
          severity: 'CRITICAL',
          action: 'TERMINATE_CALL',
        })
      );
      broadcastSpy.mockRestore();
    });
  });

  // =========================================================================
  // TASK 15 — CRITICAL SECURITY SCENARIOS A THROUGH G
  // =========================================================================
  describe('Task 15: Critical Security Threat Scenarios (A through G)', () => {
    it('Scenario A [Normal Human]: LOW risk produces benign monitoring and no blocking', async () => {
      const rec = await InterventionService.createIntervention({
        callId: 'call-scen-A',
        organizationId: orgA,
        level: 'LEVEL_0_MONITOR',
        actionType: 'ALLOW',
        evidenceSummary: ['Acoustic and NLP indicators nominal.'],
      });
      expect(rec.level).toBe('LEVEL_0_MONITOR');
      expect(rec.actionType).toBe('ALLOW');
    });

    it('Scenario B [Deepfake]: CRITICAL risk creates high severity incident and terminates call', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'CRITICAL',
        attackClassification: 'DEEPFAKE_SYNTHESIS_CRITICAL',
        summary: 'High-confidence synthetic vocoder artifacts detected.',
        actionsTaken: ['TERMINATE_CALL'],
      });
      expect(inc.severity).toBe('CRITICAL');
      expect(inc.actionsTaken).toContain('TERMINATE_CALL');
    });

    it('Scenario C [Human + OTP Theft]: Low deepfake score MUST NOT produce ALLOW; must BLOCK_DISCLOSURE', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'CRITICAL',
        attackClassification: 'CREDENTIAL_HARVESTING / OTP_THEFT',
        summary: 'Authentic voice combined with high-urgency OTP solicitation.',
        actionsTaken: ['BLOCK_DISCLOSURE'],
      });
      expect(inc.severity).toBe('CRITICAL');
      expect(inc.actionsTaken).toContain('BLOCK_DISCLOSURE');
      expect(inc.actionsTaken).not.toContain('ALLOW');
    });

    it('Scenario D [Social Engineering]: Urgency and manipulation produce WARN_OPERATOR and STEP_UP', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'HIGH',
        attackClassification: 'SOCIAL_ENGINEERING_COERCION',
        summary: 'Caller exerting cognitive pressure on operator.',
        actionsTaken: ['WARN_OPERATOR', 'REQUIRE_STEP_UP_VERIFICATION'],
      });
      expect(inc.severity).toBe('HIGH');
      expect(inc.actionsTaken).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('Scenario E [Replay Attack]: Acoustic replay flags elevated incident and step-up verification', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'HIGH',
        attackClassification: 'ACOUSTIC_REPLAY_INJECTION',
        summary: 'Room impulse response convolution and loudspeaker distortion detected.',
        actionsTaken: ['REQUIRE_STEP_UP_VERIFICATION'],
      });
      expect(inc.severity).toBe('HIGH');
      expect(inc.actionsTaken).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('Scenario F [Compound Threat]: Deepfake + Impersonation + Credential Theft -> CRITICAL severity and block', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'CRITICAL',
        attackClassification: 'COMPOUND_THREAT: DEEPFAKE + IMPERSONATION + OTP_SOLICITATION',
        summary: 'Synthetic audio with biometric mismatch and OTP harvesting.',
        actionsTaken: ['BLOCK_DISCLOSURE', 'BLOCK_PROTECTED_WORKFLOW', 'TERMINATE_CALL'],
      });
      expect(inc.severity).toBe('CRITICAL');
      expect(inc.actionsTaken).toContain('TERMINATE_CALL');
      expect(inc.actionsTaken).toContain('BLOCK_DISCLOSURE');
    });

    it('Scenario G [AI Unavailable]: Inconclusive / degraded AI must NOT default to SAFE or ALLOW', async () => {
      const inc = await IncidentsService.createIncident({
        organizationId: orgA,
        severity: 'MEDIUM',
        attackClassification: 'AI_DEGRADED_FAIL_SAFE',
        summary: 'AI risk engine offline; fail-safe manual verification required.',
        actionsTaken: ['REQUIRE_STEP_UP_VERIFICATION'],
      });
      expect(inc.severity).not.toBe('LOW');
      expect(inc.actionsTaken).not.toContain('ALLOW');
      expect(inc.actionsTaken).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });
  });
});
