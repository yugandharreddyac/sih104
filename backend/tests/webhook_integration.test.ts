import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/server';
import { env } from '../src/config/env';

describe('Webhook Integration & Security Tests', () => {
  const testSecret = env.WEBHOOK_SECRET;

  const generateSignature = (timestamp: number, payload: any) => {
    // Exact raw body serialization to match express.json
    const rawBody = JSON.stringify(payload);
    const payloadToSign = `${timestamp}.${rawBody}`;
    return crypto
      .createHmac('sha256', testSecret)
      .update(payloadToSign)
      .digest('hex');
  };

  it('should accept external webhook without JWT when signature is valid', async () => {
    const payload = { callId: 'integ-123', status: 'started' };
    const timestamp = Date.now();
    const signature = generateSignature(timestamp, payload);

    const res = await request(app)
      .post('/api/telephony/webhook/start')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', signature)
      .send(payload);

    // Should bypass 401 Unauthorized (which requires JWT) and hit the controller
    expect(res.status).not.toBe(401);
  });

  it('should reject webhook with invalid signature but missing JWT (proving signature guards the route)', async () => {
    const payload = { callId: 'integ-123', status: 'started' };
    const timestamp = Date.now();
    const badSignature = generateSignature(timestamp, { callId: 'wrong' });

    const res = await request(app)
      .post('/api/telephony/webhook/start')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', badSignature)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid webhook signature/);
  });

  it('should still require JWT on unrelated protected endpoints (e.g. /api/incidents)', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .send();

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTHENTICATION_REQUIRED');
  });
});
