import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

describe('Server-Side RBAC & Authorization Tests', () => {
  const adminToken = TokenService.generateToken({
    userId: 'u-admin',
    email: 'admin@voxshield.security',
    role: RoleName.ADMIN,
    organizationId: 'org-001',
  });

  const viewerToken = TokenService.generateToken({
    userId: 'u-viewer',
    email: 'viewer@voxshield.security',
    role: RoleName.VIEWER,
    organizationId: 'org-001',
  });

  const operatorToken = TokenService.generateToken({
    userId: 'u-operator',
    email: 'operator@voxshield.security',
    role: RoleName.OPERATOR,
    organizationId: 'org-001',
  });

  it('should block unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/calls');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should allow ADMIN to register new users', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `analyst-${Date.now()}@voxshield.security`,
        password: 'SecurePassword123!',
        fullName: 'New Analyst',
        role: 'SECURITY_ANALYST',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should forbid VIEWER from registering new users with 403', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        email: 'attacker@voxshield.security',
        password: 'SecurePassword123!',
        fullName: 'Attacker User',
        role: 'ADMIN',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('should forbid OPERATOR from creating new incidents with 403', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        severity: 'HIGH',
        attackClassification: 'ID_EXECUTIVE_IMPERSONATION',
        summary: 'Attempted fraud incident creation test',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PERMISSION_DENIED');
  });
});
