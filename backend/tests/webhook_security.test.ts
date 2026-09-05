import request from 'supertest';
import express, { Express } from 'express';
import crypto from 'crypto';
import { requireWebhookSignature } from '../src/telephony/webhook/webhook_auth';
import { env } from '../src/config/env';

describe('Webhook Security Middleware', () => {
  let app: Express;
  let testSecret: string;

  beforeAll(() => {
    // Override WEBHOOK_SECRET for tests
    testSecret = env.WEBHOOK_SECRET || 'test-webhook-secret';
    (env as any).WEBHOOK_SECRET = testSecret;

    app = express();
    app.use(express.json());
    
    // Simulate rawBody population (like body-parser often does)
    app.use((req, res, next) => {
      (req as any).rawBody = Buffer.from(JSON.stringify(req.body));
      next();
    });

    app.use('/webhook', requireWebhookSignature, (req, res) => {
      res.status(200).json({ success: true });
    });
  });

  const generateSignature = (timestamp: number, payload: any) => {
    const rawBody = JSON.stringify(payload);
    const payloadToSign = `${timestamp}.${rawBody}`;
    return crypto
      .createHmac('sha256', testSecret)
      .update(payloadToSign)
      .digest('hex');
  };

  it('should accept a request with a valid signature, timestamp, and provider', async () => {
    const payload = { callId: '12345', status: 'started' };
    const timestamp = Date.now();
    const signature = generateSignature(timestamp, payload);

    const res = await request(app)
      .post('/webhook')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', signature)
      .send(payload);

    expect(res.status).toBe(200);
  });

  it('should reject a request with missing provider identity', async () => {
    const res = await request(app).post('/webhook').send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Missing or unsupported webhook provider identity/);
  });

  it('should reject a request with an unsupported provider identity', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('X-Webhook-Provider', 'UNKNOWN_PROVIDER')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Missing or unsupported webhook provider identity/);
  });

  it('should reject a request with missing signatures', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Missing required webhook signatures/);
  });

  it('should reject a request with an invalid signature', async () => {
    const payload = { callId: '12345' };
    const timestamp = Date.now();
    
    const res = await request(app)
      .post('/webhook')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', 'invalid-signature-123')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid webhook signature/);
  });

  it('should reject a replayed or expired request based on timestamp', async () => {
    const payload = { callId: '12345' };
    // 6 minutes old
    const timestamp = Date.now() - 6 * 60 * 1000;
    const signature = generateSignature(timestamp, payload);

    const res = await request(app)
      .post('/webhook')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', signature)
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/timestamp expired or replayed/);
  });

  it('should reject a valid signature replayed twice within the valid window', async () => {
    const payload = { callId: 'replay-test' };
    const timestamp = Date.now();
    const signature = generateSignature(timestamp, payload);

    // First request should succeed
    const res1 = await request(app)
      .post('/webhook')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', signature)
      .send(payload);

    expect(res1.status).toBe(200);

    // Second request with exact same signature should fail
    const res2 = await request(app)
      .post('/webhook')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', signature)
      .send(payload);

    expect(res2.status).toBe(401);
    expect(res2.body.message).toMatch(/already processed/);
  });


  it('should reject a request signed with the wrong secret', async () => {
    const payload = { callId: '12345' };
    const timestamp = Date.now();
    
    const rawBody = JSON.stringify(payload);
    const payloadToSign = `${timestamp}.${rawBody}`;
    const wrongSignature = crypto
      .createHmac('sha256', 'wrong-secret')
      .update(payloadToSign)
      .digest('hex');

    const res = await request(app)
      .post('/webhook')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', wrongSignature)
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('should reject a request safely if rawBody is missing', async () => {
    // We create a fresh app without the rawBody middleware for this test
    const noRawBodyApp = express();
    noRawBodyApp.use(express.json());
    noRawBodyApp.use('/webhook', requireWebhookSignature, (req, res) => {
      res.status(200).json({ success: true });
    });

    const payload = { callId: '12345' };
    const timestamp = Date.now();
    const signature = generateSignature(timestamp, payload);

    const res = await request(noRawBodyApp)
      .post('/webhook')
      .set('X-Webhook-Provider', 'GENERIC_TELEPHONY')
      .set('X-Webhook-Timestamp', timestamp.toString())
      .set('X-Webhook-Signature', signature)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing raw body/);
  });
});
