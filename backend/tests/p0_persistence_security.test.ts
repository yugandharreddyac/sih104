import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

/**
 * Phase 1 (P0) Tests: Persistence, Tenant Isolation, Health/Readiness
 * 
 * These tests run in NODE_ENV=test (fallback mode) to validate:
 * - Tenant isolation on GET-by-ID endpoints
 * - Health and readiness endpoint behavior
 * - API contract preservation after async refactor
 */

// Helper: generate a JWT for a given org and role
function tokenForOrg(orgId: string, role: RoleName = RoleName.OPERATOR): string {
  return TokenService.generateToken({
    userId: `user-${orgId.substring(0, 8)}`,
    email: `user-${orgId.substring(0, 8)}@voxshield.test`,
    role,
    organizationId: orgId,
  });
}

const ORG_A = '00000000-0000-0000-0000-000000000001';
const ORG_B = '00000000-0000-0000-0000-000000000002';

describe('P0 — Tenant Isolation: Calls', () => {
  let tokenA: string;
  let tokenB: string;
  let tokenAdmin: string;

  beforeAll(() => {
    tokenA = tokenForOrg(ORG_A, RoleName.SECURITY_ANALYST);
    tokenB = tokenForOrg(ORG_B, RoleName.SECURITY_ANALYST);
    tokenAdmin = tokenForOrg(ORG_A, RoleName.ADMIN);
  });

  it('should allow Org A user to access Org A seeded call', async () => {
    const res = await request(app)
      .get('/api/calls/c1111111-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('c1111111-0000-0000-0000-000000000001');
  });

  it('should deny Org B user from accessing Org A call (403 TENANT_ACCESS_DENIED)', async () => {
    const res = await request(app)
      .get('/api/calls/c1111111-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('TENANT_ACCESS_DENIED');
  });

  it('should deny ADMIN of Org A from accessing Org B call if it existed (403)', async () => {
    // Create a call as Org B first
    const createRes = await request(app)
      .post('/api/calls')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        callerIdentifier: '+1 (555) 999-0001',
        destinationIdentifier: '+1 (555) 999-0002',
      });
    expect(createRes.status).toBe(201);
    const orgBCallId = createRes.body.data.id;

    // Admin of Org A tries to access Org B's call
    const res = await request(app)
      .get(`/api/calls/${orgBCallId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('TENANT_ACCESS_DENIED');
  });

  it('should return 404 for non-existent call', async () => {
    const res = await request(app)
      .get('/api/calls/00000000-0000-0000-0000-999999999999')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CALL_NOT_FOUND');
  });
});

describe('P0 — Tenant Isolation: Incidents', () => {
  let tokenA: string;
  let tokenB: string;
  let tokenAdmin: string;

  beforeAll(() => {
    tokenA = tokenForOrg(ORG_A, RoleName.SECURITY_ANALYST);
    tokenB = tokenForOrg(ORG_B, RoleName.SECURITY_ANALYST);
    tokenAdmin = tokenForOrg(ORG_A, RoleName.ADMIN);
  });

  it('should allow Org A user to access Org A seeded incident', async () => {
    const res = await request(app)
      .get('/api/incidents/i1111111-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should deny Org B user from accessing Org A incident (403 TENANT_ACCESS_DENIED)', async () => {
    const res = await request(app)
      .get('/api/incidents/i1111111-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('TENANT_ACCESS_DENIED');
  });

  it('should deny ADMIN from cross-tenant incident access (403)', async () => {
    // Create an incident as Org B
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        severity: 'LOW',
        attackClassification: 'TEST_ATTACK',
        summary: 'Test incident for tenant isolation',
      });
    expect(createRes.status).toBe(201);
    const orgBIncidentId = createRes.body.data.id;

    // Admin of Org A tries to access
    const res = await request(app)
      .get(`/api/incidents/${orgBIncidentId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('TENANT_ACCESS_DENIED');
  });
});

describe('P0 — Health Endpoint', () => {
  it('should return 200 with status and components', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(res.body.components).toBeDefined();
    expect(res.body.components.database).toBeDefined();
    expect(res.body.persistenceMode).toBeDefined();
  });
});

describe('P0 — Readiness Endpoint', () => {
  it('should return 200 with ready: true in fallback/test mode', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });
});

describe('P0 — API Contract Preservation', () => {
  let token: string;

  beforeAll(() => {
    token = tokenForOrg(ORG_A, RoleName.SECURITY_ANALYST);
  });

  it('should list calls with success/data/count shape', async () => {
    const res = await request(app)
      .get('/api/calls')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should list incidents with success/data/count shape', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('count');
  });

  it('should list policies with success/data/count shape', async () => {
    const res = await request(app)
      .get('/api/policies')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('count');
  });

  it('should list interventions with success/data shape', async () => {
    const res = await request(app)
      .get('/api/interventions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
  });

  it('should list audit logs with success/data/count shape', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('count');
  });
});
