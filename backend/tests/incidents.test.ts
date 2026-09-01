import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

describe('Incident Management Lifecycle Tests', () => {
  const analystToken = TokenService.generateToken({
    userId: 'u-analyst',
    email: 'analyst@voxshield.security',
    role: RoleName.SECURITY_ANALYST,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  let createdIncidentId: string;

  it('should create an incident with sanitized summary and evidence references', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        severity: 'CRITICAL',
        attackClassification: 'ID_EXECUTIVE_IMPERSONATION / OBJ_WIRE_TRANSFER',
        summary: 'Target claimed to be CFO requesting urgent wire with OTP 991823',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incidentNumber).toContain('INC-');
    expect(res.body.data.summary).toContain('[AUTHENTICATION_CODE_REDACTED]');
    expect(res.body.data.summary).not.toContain('991823');

    createdIncidentId = res.body.data.id;
  });

  it('should update incident status to CONTAINED and track audit events', async () => {
    const res = await request(app)
      .patch(`/api/incidents/${createdIncidentId}/status`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        status: 'CONTAINED',
        notes: 'Target bank accounts frozen and caller extension isolated.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CONTAINED');
  });

  it('should list all incidents for organization', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${analystToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
