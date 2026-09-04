/**
 * VOXSHIELD Signed Outbound Intervention Webhook Unit & Integration Tests
 */

import http from 'http';
import { WebhookDispatcher, WebhookEventPayload } from '../src/interventions/webhook_dispatcher';

describe('Signed Outbound Intervention Webhook Dispatcher', () => {
  const testSecret = 'super_secret_test_key_for_hmac_2026';
  let mockServer: http.Server;
  let mockServerUrl: string;
  let receivedRequests: Array<{ headers: http.IncomingHttpHeaders; body: any }> = [];
  let shouldFailRequests = false;

  beforeAll((done) => {
    mockServer = http.createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        receivedRequests.push({ headers: req.headers, body: parsed });

        if (shouldFailRequests) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'SIMULATED_INTERNAL_ERROR' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, acknowledged: true }));
        }
      });
    });

    mockServer.listen(0, '127.0.0.1', () => {
      const addr: any = mockServer.address();
      mockServerUrl = `http://127.0.0.1:${addr.port}/webhook`;
      done();
    });
  });

  afterAll((done) => {
    mockServer.close(() => done());
  });

  beforeEach(() => {
    receivedRequests = [];
    shouldFailRequests = false;
    WebhookDispatcher.clearHistory();
  });

  describe('HMAC-SHA256 Signature Verification', () => {
    it('should generate reproducible HMAC-SHA256 signature and verify successfully', () => {
      const payloadString = JSON.stringify({ test: 'data', amount: 1000 });
      const timestamp = new Date().toISOString();

      const signature = WebhookDispatcher.calculateSignature(payloadString, timestamp, testSecret);
      expect(signature).toHaveLength(64); // 32 bytes in hex = 64 chars

      // Valid verification
      const isValid = WebhookDispatcher.verifySignature(payloadString, `sha256=${signature}`, timestamp, testSecret);
      expect(isValid).toBe(true);

      // Verification without 'sha256=' prefix
      const isValidRaw = WebhookDispatcher.verifySignature(payloadString, signature, timestamp, testSecret);
      expect(isValidRaw).toBe(true);
    });

    it('should reject tampered payload or altered timestamp', () => {
      const payloadString = JSON.stringify({ test: 'data', amount: 1000 });
      const tamperedString = JSON.stringify({ test: 'data', amount: 99999 });
      const timestamp = new Date().toISOString();

      const signature = WebhookDispatcher.calculateSignature(payloadString, timestamp, testSecret);

      const isTamperedValid = WebhookDispatcher.verifySignature(tamperedString, signature, timestamp, testSecret);
      expect(isTamperedValid).toBe(false);

      const isTimestampTamperedValid = WebhookDispatcher.verifySignature(payloadString, signature, '2026-01-01T00:00:00.000Z', testSecret);
      expect(isTimestampTamperedValid).toBe(false);
    });
  });

  describe('HTTP Dispatch & Delivery', () => {
    it('should dispatch signed webhook to external HTTP receiver with all security headers', async () => {
      const result = await WebhookDispatcher.dispatch(
        {
          event: 'HIGH_RISK_VOICE_ATTACK',
          callId: 'call-webhook-test-101',
          riskScore: 94.5,
          riskLevel: 'CRITICAL',
          action: 'REQUIRE_STEP_UP_VERIFICATION',
          reasons: ['Synthetic voice detected', 'OTP credential disclosure requested'],
          correlationId: 'corr-wh-01',
          metadata: { amount: 50000 },
        },
        mockServerUrl,
        testSecret
      );

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attempts).toBe(1);

      expect(receivedRequests.length).toBe(1);
      const req = receivedRequests[0];

      // Verify custom headers
      expect(req.headers['x-voxshield-signature']).toBeDefined();
      expect(req.headers['x-voxshield-timestamp']).toBeDefined();
      expect(req.headers['x-voxshield-event-id']).toBeDefined();
      expect(req.headers['x-voxshield-idempotency-key']).toBeDefined();
      expect(req.headers['x-correlation-id']).toBe('corr-wh-01');

      // Verify signature against received body
      const isValid = WebhookDispatcher.verifySignature(
        JSON.stringify(req.body),
        req.headers['x-voxshield-signature'] as string,
        req.headers['x-voxshield-timestamp'] as string,
        testSecret
      );
      expect(isValid).toBe(true);
    });

    it('should retry up to MAX_RETRIES when receiving 500 internal server error', async () => {
      shouldFailRequests = true;

      const result = await WebhookDispatcher.dispatch(
        {
          event: 'HIGH_RISK_VOICE_ATTACK',
          callId: 'call-webhook-fail-102',
          riskScore: 99.0,
          riskLevel: 'CRITICAL',
          action: 'TERMINATE_CALL',
          reasons: ['Executive voice cloning'],
          correlationId: 'corr-wh-02',
        },
        mockServerUrl,
        testSecret
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(receivedRequests.length).toBe(3);
    });
  });
});
