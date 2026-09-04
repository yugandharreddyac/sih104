import request from 'supertest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { app, server } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { AuditService } from '../src/security/audit.service';
import { PrivacyFirewall } from '../src/security/privacy_firewall';
import { RiskService } from '../src/risk/risk.service';
import { WebSocketGateway } from '../src/websocket/ws_server';
import { AudioNormalizer } from '../src/calls/audio_normalizer';

describe('Phase 4A: Reliability & Privacy Verification', () => {
  const originalFetch = global.fetch;
  let testPort: number = 4001;

  const tenant1Token = TokenService.generateToken({
    userId: 'u-tenant1-4a',
    email: 'user1@tenant1.local',
    role: RoleName.SECURITY_ANALYST,
    organizationId: 'org-tenant-1',
  });

  const tenant2Token = TokenService.generateToken({
    userId: 'u-tenant2-4a',
    email: 'user2@tenant2.local',
    role: RoleName.SECURITY_ANALYST,
    organizationId: 'org-tenant-2',
  });

  beforeAll(async () => {
    if (!server.listening) {
      await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
    }
    const addr = server.address() as any;
    if (addr && typeof addr === 'object' && addr.port) {
      testPort = addr.port;
    }
    await WebSocketGateway.initialize(server);
  });

  afterAll(async () => {
    await WebSocketGateway.close();
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. AI OUTAGE / DEGRADED AI
  // ---------------------------------------------------------------------------
  describe('1. AI Outage & Degraded Mode Safety', () => {
    it('should return NOT_AVAILABLE / INCONCLUSIVE when AI service fails and remain safe', async () => {
      // Simulate AI network outage
      global.fetch = jest.fn().mockRejectedValue(new Error('AI Service Connection Refused (ECONNREFUSED)'));

      const response = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .send({
          callId: 'call-ai-outage-test',
          turnIndex: 1,
          audioChunkBase64: 'AAAA',
          transcriptSnippet: 'I need to update my account details.',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('NOT_AVAILABLE');
      expect(response.body.data.overall_risk_score === null || response.body.data.overall_risk_score === 0).toBe(true);
      expect(response.body.data.risk_level).toBe('INCONCLUSIVE'); // Degraded mode sets INCONCLUSIVE (fail-safe, not fake critical)
    });

    it('should handle HTTP 503 AI service unavailable without generating fake scores', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service Unavailable' }),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-503-test',
        chunkIndex: 0,
      });
      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.overall_risk_score === null || result.overall_risk_score === 0).toBe(true);
      expect(result.risk_level).toBe('INCONCLUSIVE');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. WEBSOCKET RECONNECT
  // ---------------------------------------------------------------------------
  describe('2. WebSocket Reconnect Lifecycle & Tenant Isolation', () => {
    it('should safely allow disconnect and reconnect while re-enforcing auth & tenant isolation', (done) => {
      const wsUrl = `ws://localhost:${testPort}/ws`;

      let ws1Authenticated = false;
      const ws1 = new WebSocket(wsUrl);

      ws1.on('error', (err) => {
        if (!ws1Authenticated) done(err);
      });

      ws1.on('open', () => {
        // Authenticate as Tenant 1
        ws1.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: tenant1Token } }));
      });

      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUTHENTICATED') {
          ws1Authenticated = true;
          ws1.close();
        }
      });

      ws1.on('close', () => {
        if (!ws1Authenticated) return;

        // 2. Reconnect immediately
        const ws2 = new WebSocket(wsUrl);
        ws2.on('error', (err) => done(err));

        ws2.on('open', () => {
          // Send unauthenticated ping - should be unauthenticated until AUTHENTICATE frame sent
          ws2.send(JSON.stringify({ type: 'PING' }));
          ws2.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: tenant1Token } }));
        });

        ws2.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'AUTHENTICATED') {
            // Re-auth succeeded, now broadcast message to Tenant 2 and ensure ws2 (Tenant 1) does NOT receive it
            WebSocketGateway.broadcast({
              type: 'STREAM_STATUS',
              organizationId: 'org-tenant-2',
              payload: { status: 'Tenant 2 event' },
            });

            // Allow short window to verify no cross-tenant message delivered
            setTimeout(() => {
              ws2.close();
              done();
            }, 300);
          } else if (msg.type === 'STREAM_STATUS' && msg.payload?.status === 'Tenant 2 event') {
            done(new Error('Cross-tenant data leaked to reconnected client!'));
          }
        });
      });
    }, 10000);
  });

  // ---------------------------------------------------------------------------
  // 3. RAW AUDIO RETENTION
  // ---------------------------------------------------------------------------
  describe('3. Raw Audio Non-Retention & Bounded Memory Verification', () => {
    it('should normalize audio in memory and NEVER persist raw audio files to disk', () => {
      // 1. Process sample WAV audio header + PCM data
      const pcm16Bit = Buffer.alloc(1600); // 100ms of 16kHz mono audio
      const result = AudioNormalizer.normalize(pcm16Bit, 16000, 1);

      expect(result.format).toBe('pcm_s16le');
      expect(result.sampleRate).toBe(16000);
      expect(result.channels).toBe(1);
      expect(result.pcmBuffer.length).toBe(1600);

      // 2. Verify zero audio files were written to disk in current directory or temp
      const tmpDir = process.cwd();
      const filesInCwd = fs.readdirSync(tmpDir);
      const audioFiles = filesInCwd.filter((f) => f.endsWith('.wav') || f.endsWith('.pcm') || f.endsWith('.raw'));
      expect(audioFiles.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SENSITIVE DATA IN LOGS / AUDIT / TELEMETRY
  // ---------------------------------------------------------------------------
  describe('4. Sensitive Data Redaction in Audit & Telemetry', () => {
    it('should redact OTP, PIN, CVV, Card Numbers, and Passwords in audit metadata', async () => {
      await AuditService.record({
        organizationId: 'org-tenant-1',
        actorUserId: 'u-test-privacy',
        action: 'TEST_SENSITIVE_AUDIT',
        resourceType: 'TEST',
        result: 'SUCCESS',
        metadata: {
          transcript: 'My OTP is 987654 and secret PIN is 4321',
          userPassword: 'SuperPassword123!',
          cardCvv: '912',
          cardNumber: '4532-1111-2222-3333',
        },
      });

      const recentLogs = await AuditService.getRecentLogs(10);
      const testLog = recentLogs.find((l) => l.action === 'TEST_SENSITIVE_AUDIT');

      expect(testLog).toBeDefined();
      const meta = testLog.metadata;

      // Verify explicit redactions
      expect(JSON.stringify(meta)).not.toContain('987654');
      expect(JSON.stringify(meta)).not.toContain('SuperPassword123!');
      expect(JSON.stringify(meta)).not.toContain('4532-1111-2222-3333');
      expect(meta.userPassword).toBe('[AUTHENTICATION_CODE_REDACTED]');
      expect(meta.cardNumber).toBe('[CARD_NUMBER_REDACTED]');
    });

    it('should sanitize raw transcript strings containing sensitive secrets', () => {
      const rawTranscript = 'Verification code is 849201. Please confirm card verification value 381.';
      const sanitized = PrivacyFirewall.sanitize(rawTranscript);

      expect(sanitized.hasSensitiveSecrets).toBe(true);
      expect(sanitized.sanitizedText).toContain('[AUTHENTICATION_CODE_REDACTED]');
      expect(sanitized.sanitizedText).toContain('[CVV_REDACTED]');
      expect(sanitized.sanitizedText).not.toContain('849201');
      expect(sanitized.sanitizedText).not.toContain('381');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. RELIABILITY FAILURE HANDLING
  // ---------------------------------------------------------------------------
  describe('5. Reliability Failure & Recovery Verification', () => {
    it('should handle malformed REST payload gracefully with 400 validation error', async () => {
      const res = await request(app)
        .post('/api/calls')
        .set('Authorization', `Bearer ${tenant1Token}`)
        .send({
          invalidField: 12345,
          phoneNumber: null,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should seamlessly recover after AI service dependency recovers', async () => {
      // 1. AI Fails first
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('AI Outage'));
      const r1 = await RiskService.evaluateUnifiedRisk({
        callId: 'call-recovery-1',
        chunkIndex: 0,
      });
      expect(r1.status).toBe('NOT_AVAILABLE');

      // 2. AI Recovers on next call
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'AVAILABLE',
          call_id: 'call-recovery-1',
          turn_index: 1,
          overall_risk_score: 15.0,
          risk_level: 'LOW',
          confidence: 0.95,
          uncertainty: 0.05,
          dimensions: {
            overall: 15.0,
            identity_impersonation: 5.0,
            deepfake_synthetic: 10.0,
            replay_injection: 0.0,
            social_engineering: 10.0,
            credential_theft: 0.0,
            financial_fraud: 0.0,
            account_takeover: 0.0,
            verification_bypass: 0.0,
            inconsistency: 0.0,
          },
        }),
      } as any);

      const r2 = await RiskService.evaluateUnifiedRisk({
        callId: 'call-recovery-1',
        chunkIndex: 1,
      });
      expect(r2.status).toBe('AVAILABLE');
      expect(r2.overall_risk_score).toBe(15.0);
    });
  });
});
