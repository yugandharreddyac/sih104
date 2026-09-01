import request from 'supertest';
import { app } from '../src/server';

describe('Health and Diagnostics Endpoint Tests', () => {
  it('should return health status with component breakdown', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('HEALTHY');
    expect(res.body.phase).toBe('PHASE_1_FOUNDATION');
    expect(res.body.components.backend.status).toBe('HEALTHY');
    expect(res.body.components.privacyFirewall.status).toBe('ACTIVE');
    expect(res.body.components.policyEngine.status).toBe('ACTIVE');
  });

  it('should return discovery API metadata at root /', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('VOXSHIELD Platform API');
    expect(res.body.phase).toBe('PHASE_1_FOUNDATION');
    expect(res.body.endpoints).toBeDefined();
  });
});
