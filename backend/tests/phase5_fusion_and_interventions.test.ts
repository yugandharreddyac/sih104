import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { InterventionService } from '../src/interventions/intervention.service';

describe('Phase 5: Unified Risk Fusion, Deterministic Policy, Step-Up & Interventions', () => {
  const analystToken = TokenService.generateToken({
    userId: 'u-analyst-phase5',
    email: 'analyst5@voxshield.local',
    role: RoleName.SECURITY_ANALYST,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  const viewerToken = TokenService.generateToken({
    userId: 'u-vw-phase5',
    email: 'viewer5@voxshield.local',
    role: RoleName.VIEWER,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  describe('REST Endpoints (/api/risk/* and /api/interventions/*)', () => {
    it('should evaluate unified risk for active call session', async () => {
      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-phase5-test',
          chunkIndex: 0,
          textTranscript: 'I am calling from your security department. Disclose your OTP 928401 immediately.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.call_id).toBe('call-phase5-test');
      expect(res.body.data.dimensions).toBeDefined();
      expect(res.body.data.evidence_graph).toBeDefined();
    });

    it('should retrieve timeline history for call', async () => {
      const res = await request(app)
        .get('/api/risk/call-phase5-test/timeline')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should recommend intervention under policy enforcement', async () => {
      const res = await request(app)
        .post('/api/interventions/recommend')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-phase5-test',
          level: 'LEVEL_2_STEP_UP_VERIFICATION',
          actionType: 'REQUIRE_STEP_UP_VERIFICATION',
          policyId: 'POL-CRED-001',
          evidenceSummary: ['Direct solicitation of OTP [REDACTED]'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('AWAITING_HUMAN');
      expect(res.body.data.actionType).toBe('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('should record human SOC decision (APPROVAL) on intervention', async () => {
      const created = await InterventionService.createIntervention({
        callId: 'call-phase5-approval',
        organizationId: '00000000-0000-0000-0000-000000000001',
        level: 'LEVEL_2_STEP_UP_VERIFICATION',
        actionType: 'REQUIRE_STEP_UP_VERIFICATION',
      });

      const res = await request(app)
        .post('/api/interventions/decision')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          interventionId: created.id,
          decision: 'APPROVED',
          reason: 'Confirmed multi-turn social engineering pattern.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('EXECUTED');
      expect(res.body.data.humanDecision).toBe('APPROVED');
    });

    it('should forbid VIEWER from creating interventions with 403', async () => {
      const res = await request(app)
        .post('/api/interventions/recommend')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          callId: 'call-phase5-test',
          level: 'LEVEL_2_STEP_UP_VERIFICATION',
          actionType: 'REQUIRE_STEP_UP_VERIFICATION',
        });

      expect(res.status).toBe(403);
    });
  });
});
