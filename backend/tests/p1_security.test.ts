import request from 'supertest';
import { app, server } from '../src/server';
import { db } from '../src/database/db';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import WebSocket from 'ws';

describe('Phase 2 (P1) Security Hardening', () => {
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    // Generate valid tokens for testing tenant isolation
    adminToken = TokenService.generateToken({
      userId: 'admin-123',
      email: 'admin@voxshield.com',
      role: RoleName.ADMIN,
      organizationId: 'org-admin',
    });

    userToken = TokenService.generateToken({
      userId: 'user-123',
      email: 'user@tenant.com',
      role: RoleName.SECURITY_ANALYST,
      organizationId: 'org-tenant-a',
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Using simple query to avoid test hangs since db.end() doesn't exist on this pool wrapper
  });

  describe('HTTP Security Headers & CORS', () => {
    it('should reject unauthorized CORS origins', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://evil-cors-origin.com');
      
      // helmet/cors should not reflect the evil origin
      expect(res.headers['access-control-allow-origin']).not.toBe('http://evil-cors-origin.com');
    });

    it('should allow authorized CORS origins', async () => {
      // In tests, CORS_ORIGIN is likely http://localhost:3000
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');
      
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should set Content-Security-Policy header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    });

    it('should disable x-powered-by header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce auth rate limiting on /api/auth/login', async () => {
      // We will send 25 requests (limit is 20)
      let lastStatus = 200;
      for (let i = 0; i < 25; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: 'test@example.com', password: 'password' });
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429); // Too Many Requests
    });
  });

  describe('Tenant Isolation (Calls)', () => {
    it('should restrict regular user to their organization', async () => {
      const res = await request(app)
        .get('/api/calls')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      // Even if there are calls, they should only be from 'org-tenant-a'
      res.body.data.forEach((call: any) => {
        expect(call.organizationId).toBe('org-tenant-a');
      });
    });

    it('should restrict admin to their own organization (No bypass)', async () => {
      const res = await request(app)
        .get('/api/calls')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      // Admin should also be restricted to 'org-admin'
      res.body.data.forEach((call: any) => {
        expect(call.organizationId).toBe('org-admin');
      });
    });
  });

});
