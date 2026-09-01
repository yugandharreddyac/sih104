import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

describe('Authentication & Token Unit Tests', () => {
  it('should generate and verify JWT correctly', () => {
    const payload = {
      userId: 'test-user-id-001',
      email: 'analyst@voxshield.security',
      role: RoleName.SECURITY_ANALYST,
      organizationId: 'org-test-001',
    };

    const token = TokenService.generateToken(payload);
    expect(typeof token).toBe('string');

    const decoded = TokenService.verifyToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(RoleName.SECURITY_ANALYST);
  });

  it('should authenticate default admin credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@voxshield.security',
        password: 'VoxShield@2026!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('ADMIN');
  });

  it('should reject invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@voxshield.security',
        password: 'WrongPassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('AUTHENTICATION_FAILED');
  });

  it('should reject unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'attacker@evil.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
