import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { AcousticService } from '../src/acoustic/acoustic.service';

describe('Phase 3: Acoustic Intelligence & Biometric Speaker Routes', () => {
  const originalFetch = global.fetch;

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

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should return 401 when accessing acoustic analyze without authentication', async () => {
    const res = await request(app).post('/api/acoustic/analyze').send({ callId: 'test-call' });
    expect(res.status).toBe(401);
  });

  it('should return safe degraded result when AI service is unavailable (no fabricated AUTHENTIC)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app)
      .post('/api/acoustic/analyze')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        callId: 'call-acoustic-test-01',
        chunkIndex: 0,
        audioBase64: 'AAAA',
        claimedSpeakerId: 'spk-001',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toBeDefined();

    // Critical Security Assertions: Never fabricate authentic claims on failure
    expect(data.overall_assessment).toBe('NOT_AVAILABLE');
    expect(data.deepfake.status).toBe('NOT_AVAILABLE');
    expect(data.deepfake.spoof_score).toBeNull();
    expect(data.deepfake.uncertainty).toBe(1.0);

    expect(data.speaker.status).toBe('NOT_AVAILABLE');
    expect(data.speaker.status).not.toBe('MATCH');
    expect(data.speaker.similarity_score).toBeNull();

    expect(data.replay.status).toBe('NOT_AVAILABLE');
    expect(data.replay.status).not.toBe('NOT_REPLAY');
    expect(data.replay.replay_probability).toBeNull();

    expect(data.evidence_summary[0]).toContain('Acoustic AI analysis unavailable');
  });

  it('should return safe degraded result on HTTP 500 error from AI service', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as any);

    const result = await AcousticService.analyze({
      callId: 'call-http-500',
      chunkIndex: 1,
      audioBase64: 'AAAA',
    });

    expect(result.overall_assessment).toBe('NOT_AVAILABLE');
    expect(result.analysis_status).toBe('AI_HTTP_ERROR');
    expect(result.http_status).toBe(500);
    expect(result.deepfake.status).toBe('NOT_AVAILABLE');
    expect(result.deepfake.spoof_score).toBeNull();
  });

  it('should return safe degraded result on HTTP 503 service unavailable', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as any);

    const result = await AcousticService.analyze({
      callId: 'call-http-503',
      chunkIndex: 2,
      audioBase64: 'AAAA',
    });

    expect(result.overall_assessment).toBe('NOT_AVAILABLE');
    expect(result.analysis_status).toBe('AI_HTTP_ERROR');
    expect(result.http_status).toBe(503);
    expect(result.speaker.status).toBe('NOT_AVAILABLE');
    expect(result.speaker.similarity_score).toBeNull();
  });

  it('should return safe degraded result on HTTP 429 rate limit', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
    } as any);

    const result = await AcousticService.analyze({
      callId: 'call-http-429',
      chunkIndex: 3,
      audioBase64: 'AAAA',
    });

    expect(result.overall_assessment).toBe('NOT_AVAILABLE');
    expect(result.analysis_status).toBe('AI_HTTP_ERROR');
    expect(result.http_status).toBe(429);
    expect(result.replay.status).toBe('NOT_AVAILABLE');
  });

  it('should return safe degraded result when AI request times out', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const result = await AcousticService.analyze({
      callId: 'call-timeout-test',
      chunkIndex: 4,
      audioBase64: 'AAAA',
    });

    expect(result.overall_assessment).toBe('NOT_AVAILABLE');
    expect(result.analysis_status).toBe('AI_TIMEOUT');
    expect(result.deepfake.status).toBe('NOT_AVAILABLE');
  });

  it('should return safe degraded result on malformed JSON response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
    } as any);

    const result = await AcousticService.analyze({
      callId: 'call-malformed-json',
      chunkIndex: 5,
      audioBase64: 'AAAA',
    });

    expect(result.overall_assessment).toBe('NOT_AVAILABLE');
    expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
    expect(result.deepfake.status).toBe('NOT_AVAILABLE');
  });

  it('should return safe degraded result on empty JSON object response {}', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as any);

    const result = await AcousticService.analyze({
      callId: 'call-empty-json',
      chunkIndex: 6,
      audioBase64: 'AAAA',
    });

    expect(result.overall_assessment).toBe('NOT_AVAILABLE');
    expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
    // Ensure nested objects always exist to protect ws_server consumers
    expect(result.deepfake).toBeDefined();
    expect(result.deepfake.status).toBe('NOT_AVAILABLE');
    expect(result.speaker).toBeDefined();
    expect(result.speaker.status).toBe('NOT_AVAILABLE');
    expect(result.replay).toBeDefined();
    expect(result.replay.status).toBe('NOT_AVAILABLE');
  });

  it('should return safe degraded result on incomplete nested structure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        deepfake: {}, // missing status
        speaker: null,
      }),
    } as any);

    const result = await AcousticService.analyze({
      callId: 'call-incomplete-json',
      chunkIndex: 7,
      audioBase64: 'AAAA',
    });

    expect(result.overall_assessment).toBe('NOT_AVAILABLE');
    expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
    expect(result.deepfake.status).toBe('NOT_AVAILABLE');
    expect(result.speaker.status).toBe('NOT_AVAILABLE');
    expect(result.replay.status).toBe('NOT_AVAILABLE');
  });

  it('should pass through valid AI response on success path', async () => {
    const validAiResponse = {
      call_id: 'call-valid-01',
      overall_assessment: 'FLAGGED',
      deepfake: {
        status: 'SYNTHETIC',
        spoof_score: 0.94,
        confidence: 0.92,
        uncertainty: 0.08,
      },
      speaker: {
        status: 'MISMATCH',
        similarity_score: 0.22,
        confidence: 0.89,
      },
      replay: {
        status: 'REPLAY_DETECTED',
        replay_probability: 0.88,
        confidence: 0.90,
      },
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(validAiResponse),
    } as any);

    const result = await AcousticService.analyze({
      callId: 'call-valid-01',
      chunkIndex: 8,
      audioBase64: 'AAAA',
    });

    expect(result.overall_assessment).toBe('FLAGGED');
    expect(result.deepfake.status).toBe('SYNTHETIC');
    expect(result.deepfake.spoof_score).toBe(0.94);
    expect(result.speaker.status).toBe('MISMATCH');
    expect(result.replay.status).toBe('REPLAY_DETECTED');
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
