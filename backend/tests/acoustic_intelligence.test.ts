import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

describe('Phase 3: Acoustic Intelligence & Biometric Speaker Routes', () => {
  const adminToken = TokenService.generateToken({
    userId: 'u-admin-01',
    email: 'admin@voxshield.internal',
    role: RoleName.ADMIN,
    organizationId: '10000000-0000-0000-0000-000000000001',
  });

  const viewerToken = TokenService.generateToken({
    userId: 'u-viewer-01',
    email: 'viewer@voxshield.internal',
    role: RoleName.VIEWER,
    organizationId: '10000000-0000-0000-0000-000000000001',
  });

  const operatorToken = TokenService.generateToken({
    userId: 'u-operator-01',
    email: 'operator@voxshield.internal',
    role: RoleName.OPERATOR,
    organizationId: '10000000-0000-0000-0000-000000000001',
  });

  it('should return 401 when accessing acoustic analyze without authentication', async () => {
    const res = await request(app).post('/api/acoustic/analyze').send({ callId: 'test-call' });
    expect(res.status).toBe(401);
  });

  it('should execute acoustic analysis for authenticated operator', async () => {
    const res = await request(app)
      .post('/api/acoustic/analyze')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        callId: 'call-acoustic-test-01',
        chunkIndex: 0,
        audioBase64: 'AAAA',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.deepfake).toBeDefined();
    expect(res.body.data.speaker).toBeDefined();
    expect(res.body.data.replay).toBeDefined();
    expect(res.body.data.vad).toBeDefined();
    expect(res.body.data.overall_assessment).toBeDefined();
  });

  it('should list registered models via /api/models', async () => {
    const res = await request(app)
      .get('/api/models')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('should allow ADMIN to enroll a new biometric speaker profile', async () => {
    const res = await request(app)
      .post('/api/speakers/enroll')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        speakerId: 'spk-test-enroll-01',
        speakerName: 'Dr. Jane Foster',
        audioUtterancesBase64: ['AAAA', 'BBBB'],
        metadata: { department: 'Research' },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.profile.speaker_id).toBe('spk-test-enroll-01');
  });

  it('should forbid VIEWER from enrolling speaker profile with 403', async () => {
    const res = await request(app)
      .post('/api/speakers/enroll')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        speakerId: 'spk-forbidden',
        speakerName: 'Forbidden',
        audioUtterancesBase64: ['AAAA', 'BBBB'],
      });

    expect(res.status).toBe(403);
  });

  it('should list enrolled speaker profiles', async () => {
    const res = await request(app)
      .get('/api/speakers')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
