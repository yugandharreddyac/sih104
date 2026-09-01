import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

describe('Phase 4: Conversational Intelligence & Streaming ASR Routes', () => {
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

  it('should reject unauthenticated calls to analyze-turn with 401', async () => {
    const res = await request(app)
      .post('/api/conversation/analyze-turn')
      .send({ callId: 'call-test-01', textTranscript: 'Hello' });

    expect(res.status).toBe(401);
  });

  it('should analyze conversation turn for authenticated operator', async () => {
    const res = await request(app)
      .post('/api/conversation/analyze-turn')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        callId: 'call-test-01',
        chunkIndex: 1,
        textTranscript: 'I am calling from your bank. Please read the 6-digit OTP code 948102 right now.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.intent.primary_intent).toBe('OTP_REQUEST');
    expect(data.intent.is_adversarial).toBe(true);
    expect(data.sensitive_data.contains_secret).toBe(true);
    expect(data.sensitive_data.redacted_preview).toContain('[REDACTED]');
    expect(data.sensitive_data.redacted_preview).not.toContain('948102');
    expect(data.social_engineering.tactics_detected).toContain('AUTHORITY_EXPLOITATION');
    expect(data.social_engineering.tactics_detected).toContain('URGENCY_PRESSURE');
    expect(data.requested_action.action_type).toBe('DISCLOSE_CREDENTIAL');
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
