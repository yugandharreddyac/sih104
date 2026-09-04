import { AuditService } from '../src/security/audit.service';
import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

describe('Audit Trail & Logging Tests', () => {
  const adminToken = TokenService.generateToken({
    userId: 'u-admin',
    email: 'admin@voxshield.security',
    role: RoleName.ADMIN,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  it('should record audit event without leaking sensitive parameters', async () => {
    const logId = await AuditService.record({
      organizationId: 'org-001',
      action: 'TEST_AUDIT_ACTION',
      resourceType: 'TEST_RESOURCE',
      result: 'SUCCESS',
      metadata: {
        normalParam: 'testValue',
        otp: '849201',
        password: 'SuperSecretPassword',
      },
    });

    expect(typeof logId).toBe('string');

    const logs = await AuditService.getRecentLogs(10);
    const found = logs.find((l: any) => l.action === 'TEST_AUDIT_ACTION');
    expect(found).toBeDefined();
    expect(found.metadata.otp).toBe('[AUTHENTICATION_CODE_REDACTED]');
    expect(found.metadata.password).toBe('[AUTHENTICATION_CODE_REDACTED]');
  });

  it('should allow authorized admin to retrieve audit logs', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
