import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { ConversationService } from '../src/conversation/conversation.service';

describe('Phase 4: Conversational Intelligence & Streaming ASR Routes', () => {
  const originalFetch = global.fetch;

  const operatorToken = TokenService.generateToken({
    userId: 'u-op-01',
    email: 'operator@voxshield.local',
    role: RoleName.OPERATOR,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  const viewerToken = TokenService.generateToken({
    userId: 'u-vw-01',
    email: 'viewer@voxshield.local',
    role: RoleName.VIEWER,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should reject unauthenticated calls to analyze-turn with 401', async () => {
    const res = await request(app)
      .post('/api/conversation/analyze-turn')
      .send({ callId: 'call-test-01', textTranscript: 'Hello' });

    expect(res.status).toBe(401);
  });

  it('should pass through valid AI response on success path', async () => {
    const validAiResponse = {
      call_id: 'call-test-valid',
      turn_index: 1,
      asr: {
        status: 'AVAILABLE',
        model_version: 'whisper_streaming_conformer_v4',
        transcript: 'Please transfer fifty thousand dollars immediately.',
        redacted_transcript: 'Please transfer fifty thousand dollars immediately.',
        language: 'en',
        confidence: 0.94,
        uncertainty: 0.06,
        is_final: true,
      },
      intent: {
        primary_intent: 'WIRE_TRANSFER_REQUEST',
        confidence: 0.92,
        is_adversarial: true,
      },
      sensitive_data: {
        status: 'AVAILABLE',
        findings: [],
        contains_direct_request: true,
        contains_secret: false,
      },
      social_engineering: {
        status: 'AVAILABLE',
        model_version: 'social_eng_multi_turn_v4',
        tactics_detected: ['URGENCY_PRESSURE'],
        progression_state: 'FINANCIAL_EXTRACTION',
        attack_sequence_score: 0.85,
        confidence: 0.88,
      },
      requested_action: {
        action_type: 'WIRE_TRANSFER',
        is_high_risk: true,
      },
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(validAiResponse),
    } as any);

    const result = await ConversationService.analyzeTurn({
      callId: 'call-test-valid',
      chunkIndex: 1,
      audioBase64: 'AAAA',
    });

    expect(result.asr.status).toBe('AVAILABLE');
    expect(result.asr.transcript).toBe('Please transfer fifty thousand dollars immediately.');
    expect(result.intent.primary_intent).toBe('WIRE_TRANSFER_REQUEST');
    expect(result.social_engineering.attack_sequence_score).toBe(0.85);
  });

  it('should return safe degraded result when AI service is unavailable (no fabricated transcript)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app)
      .post('/api/conversation/analyze-turn')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        callId: 'call-test-01',
        chunkIndex: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;

    // Critical Security Assertions: Never fabricate transcripts, intents, or attack scores
    expect(data.asr.status).toBe('NOT_AVAILABLE');
    expect(data.asr.transcript).toBeNull();
    expect(data.asr.confidence).toBe(0.0);
    expect(data.asr.uncertainty).toBe(1.0);

    // Assert that the dangerous fabricated phrase is NEVER generated
    expect(JSON.stringify(data)).not.toContain('I am calling regarding your account security.');

    expect(data.intent.status).toBe('NOT_AVAILABLE');
    expect(data.intent.primary_intent).toBe('NOT_AVAILABLE');
    expect(data.intent.is_adversarial).toBe(false);

    expect(data.social_engineering.status).toBe('NOT_AVAILABLE');
    expect(data.social_engineering.attack_sequence_score).toBeNull();
    expect(data.social_engineering.confidence).toBe(0.0);
    expect(data.social_engineering.tactics_detected).toHaveLength(0);

    expect(data.requested_action.action_type).toBe('NOT_AVAILABLE');
  });

  it('should return safe degraded result on HTTP 500 error from AI service', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as any);

    const result = await ConversationService.analyzeTurn({
      callId: 'call-http-500',
      chunkIndex: 2,
    });

    expect(result.analysis_status).toBe('AI_HTTP_ERROR');
    expect(result.http_status).toBe(500);
    expect(result.asr.status).toBe('NOT_AVAILABLE');
    expect(result.asr.transcript).toBeNull();
    expect(result.intent.primary_intent).toBe('NOT_AVAILABLE');
  });

  it('should return safe degraded result on HTTP 503 service unavailable', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as any);

    const result = await ConversationService.analyzeTurn({
      callId: 'call-http-503',
      chunkIndex: 3,
    });

    expect(result.analysis_status).toBe('AI_HTTP_ERROR');
    expect(result.http_status).toBe(503);
    expect(result.social_engineering.status).toBe('NOT_AVAILABLE');
    expect(result.social_engineering.attack_sequence_score).toBeNull();
  });

  it('should return safe degraded result on HTTP 429 rate limit', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
    } as any);

    const result = await ConversationService.analyzeTurn({
      callId: 'call-http-429',
      chunkIndex: 4,
    });

    expect(result.analysis_status).toBe('AI_HTTP_ERROR');
    expect(result.http_status).toBe(429);
    expect(result.asr.status).toBe('NOT_AVAILABLE');
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

    const result = await ConversationService.analyzeTurn({
      callId: 'call-timeout-conv',
      chunkIndex: 5,
    });

    expect(result.analysis_status).toBe('AI_TIMEOUT');
    expect(result.asr.status).toBe('NOT_AVAILABLE');
    expect(result.asr.transcript).toBeNull();
  });

  it('should return safe degraded result on malformed JSON response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token in JSON')),
    } as any);

    const result = await ConversationService.analyzeTurn({
      callId: 'call-malformed-json-conv',
      chunkIndex: 6,
    });

    expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
    expect(result.asr.status).toBe('NOT_AVAILABLE');
  });

  it('should return safe degraded result on empty JSON object response {}', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    } as any);

    const result = await ConversationService.analyzeTurn({
      callId: 'call-empty-json-conv',
      chunkIndex: 7,
    });

    expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
    expect(result.asr).toBeDefined();
    expect(result.asr.status).toBe('NOT_AVAILABLE');
    expect(result.intent).toBeDefined();
    expect(result.intent.status).toBe('NOT_AVAILABLE');
    expect(result.social_engineering).toBeDefined();
    expect(result.social_engineering.status).toBe('NOT_AVAILABLE');
  });

  it('should return safe degraded result on incomplete nested structure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        asr: {}, // missing status
        intent: null,
      }),
    } as any);

    const result = await ConversationService.analyzeTurn({
      callId: 'call-incomplete-json-conv',
      chunkIndex: 8,
    });

    expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
    expect(result.asr.status).toBe('NOT_AVAILABLE');
    expect(result.intent.status).toBe('NOT_AVAILABLE');
    expect(result.social_engineering.status).toBe('NOT_AVAILABLE');
  });

  it('should preserve caller-supplied textTranscript safely without falsely claiming ASR produced it', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const callerSuppliedText = 'Hello I need to check my balance';
    const result = await ConversationService.analyzeTurn({
      callId: 'call-supplied-transcript',
      chunkIndex: 9,
      textTranscript: callerSuppliedText,
    });

    expect(result.asr.status).toBe('NOT_AVAILABLE');
    expect(result.asr.transcript).toBeNull(); // AI ASR did not produce a transcript
    expect(result.asr.supplied_transcript).toBe(callerSuppliedText);
    expect(result.intent.primary_intent).toBe('NOT_AVAILABLE');
  });

  it('should retrieve conversation memory summary for authenticated viewer', async () => {
    const res = await request(app)
      .get('/api/conversation/call-test-01/summary')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.call_id).toBe('call-test-01');
  });

  it('should allow operator to clear conversation memory', async () => {
    const res = await request(app)
      .delete('/api/conversation/call-test-01')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
