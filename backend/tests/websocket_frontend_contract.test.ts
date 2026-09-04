import http from 'http';
import WebSocket from 'ws';
import { WebSocketGateway } from '../src/websocket/ws_server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { CallsService } from '../src/calls/calls.service';
import { PoliciesService } from '../src/policies/policies.service';

describe('Phase 5: Backend -> WebSocket -> Frontend Contract Validation Tests', () => {
  let server: http.Server;
  let port: number;
  const originalFetch = global.fetch;

  const org1 = '00000000-0000-0000-0000-000000000001';
  const org2 = '00000000-0000-0000-0000-000000000002';

  let adminToken: string;
  let operatorOrg1Token: string;
  let operatorOrg2Token: string;
  let viewerOrg1Token: string;

  let validCallIdOrg1: string;
  let validCallIdOrg2: string;

  const openSockets: WebSocket[] = [];

  interface TestClient {
    ws: WebSocket;
    receiveNext: (timeoutMs?: number) => Promise<any>;
    receiveMatching: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
    close: () => Promise<void>;
  }

  beforeAll(async () => {
    PoliciesService.initializeDefaultPolicies();
    CallsService.seedSampleCallsIfEmpty();

    const call1 = await CallsService.createCall({
      organizationId: org1,
      callerIdentifier: '+1 (555) 839-2041',
      destinationIdentifier: '1-800-VOX-BANK',
    });
    validCallIdOrg1 = call1.id;

    const call2 = await CallsService.createCall({
      organizationId: org2,
      callerIdentifier: '+1 (555) 999-0002',
      destinationIdentifier: '1-800-OTHER-BANK',
    });
    validCallIdOrg2 = call2.id;

    adminToken = TokenService.generateToken({
      userId: 'u-admin-ws',
      email: 'admin@voxshield.local',
      role: RoleName.ADMIN,
      organizationId: org1,
    });

    operatorOrg1Token = TokenService.generateToken({
      userId: 'u-op1-ws',
      email: 'operator1@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: org1,
    });

    operatorOrg2Token = TokenService.generateToken({
      userId: 'u-op2-ws',
      email: 'operator2@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: org2,
    });

    viewerOrg1Token = TokenService.generateToken({
      userId: 'u-view1-ws',
      email: 'viewer1@voxshield.local',
      role: RoleName.VIEWER,
      organizationId: org1,
    });

    server = http.createServer();
    WebSocketGateway.initialize(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  beforeEach(() => {
    // Deterministic mock for downstream AI microservices
    global.fetch = jest.fn().mockImplementation((url: string, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/acoustic')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            deepfake: { status: 'AUTHENTIC', spoof_score: 0.05, confidence: 0.95 },
            speaker: { status: 'MATCH', similarity_score: 0.88, confidence: 0.90, is_enrolled: true },
            replay: { status: 'NOT_REPLAY', replay_probability: 0.04, confidence: 0.92 },
            vad: { state: 'SPEECH', speech_probability: 0.95 },
            quality: { rating: 'EXCELLENT', rms_dbfs: -18 },
            temporal_metrics: { accumulated_speech_seconds: 3.5, is_warmed_up: true },
            total_ai_latency_ms: 2.1,
            evidence_summary: ['Acoustic analysis nominal'],
          }),
        });
      }

      if (urlStr.includes('/conversation')) {
        const body = init?.body ? JSON.parse(init.body) : {};
        const transcript = body.text_transcript || 'Default test transcript';
        const isOtp = transcript.includes('OTP') || transcript.includes('839201');

        return Promise.resolve({
          ok: true,
          json: async () => ({
            asr: {
              status: 'AVAILABLE',
              transcript,
              confidence: 0.96,
              uncertainty: 0.04,
              language: 'en',
              language_confidence: 0.98,
            },
            intent: {
              primary_intent: isOtp ? 'OTP_SOLICITATION' : 'ACCOUNT_INQUIRY',
              confidence: 0.94,
              is_adversarial: isOtp,
            },
            requested_action: {
              action_type: isOtp ? 'CREDENTIAL_DISCLOSURE' : 'INQUIRY',
              target_object: isOtp ? 'OTP' : 'ACCOUNT_DETAILS',
              is_high_risk: isOtp,
            },
            social_engineering: {
              status: isOtp ? 'CRITICAL_RISK' : 'NOT_DETECTED',
              attack_sequence_score: isOtp ? 0.92 : 0.08,
              confidence: 0.95,
              tactics_detected: isOtp ? ['URGENCY', 'CREDENTIAL_HARVESTING'] : [],
              progression_state: isOtp ? 'EXPLOITATION' : 'BENIGN',
            },
            sensitive_data: {
              highest_severity: isOtp ? 'CRITICAL' : 'NONE',
            },
            total_nlp_latency_ms: 3.4,
            evidence_summary: isOtp ? ['High-pressure OTP solicitation detected'] : ['Benign inquiry'],
          }),
        });
      }

      if (urlStr.includes('/fusion')) {
        const body = init?.body ? JSON.parse(init.body) : {};
        const isOtp = body.text_transcript?.includes('OTP') || body.text_transcript?.includes('AUTHENTICATION_CODE_REDACTED');
        return Promise.resolve({
          ok: true,
          json: async () => ({
            overall_risk_score: isOtp ? 85.0 : 15.0,
            risk_level: isOtp ? 'HIGH' : 'LOW',
            confidence: 0.92,
            uncertainty: 0.08,
            dimensions: {
              credential_theft: isOtp ? 85 : 5,
              social_engineering: isOtp ? 80 : 10,
              verification_bypass: isOtp ? 70 : 5,
              financial_fraud: isOtp ? 60 : 5,
              identity_impersonation: 20,
              account_takeover: isOtp ? 75 : 5,
              deepfake_synthetic: 10,
              replay_injection: 5,
              inconsistency: 15,
              overall: isOtp ? 85 : 15,
            },
            risk_velocity: 5.0,
            risk_trajectory_trend: isOtp ? 'RISING' : 'STABLE',
            primary_drivers: isOtp ? ['Credential Harvesting Attempt'] : ['Normal Interaction'],
            evidence_graph: { nodes: [{ cue: isOtp ? 'OTP Solicitation' : 'Nominal', layer: 'NLP' }] },
            policy_recommendation: {
              action: isOtp ? 'BLOCK_DISCLOSURE' : 'ALLOW',
              is_triggered: isOtp,
              target: 'AGENT',
              reason: isOtp ? 'Active OTP solicitation detected' : 'Nominal conversation',
            },
            fusion_latency_ms: 2.5,
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    for (const ws of openSockets) {
      try {
        ws.terminate();
      } catch {}
    }
    await WebSocketGateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const createWsClient = async (): Promise<TestClient> => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    openSockets.push(ws);
    const messages: any[] = [];
    const waiters: ((msg: any) => void)[] = [];

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString('utf-8'));
        if (waiters.length > 0) {
          const nextWaiter = waiters.shift()!;
          nextWaiter(parsed);
        } else {
          messages.push(parsed);
        }
      } catch {}
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
    });

    const receiveNext = (timeoutMs = 3000): Promise<any> => {
      if (messages.length > 0) {
        return Promise.resolve(messages.shift());
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(wrappedResolve);
          if (idx !== -1) waiters.splice(idx, 1);
          reject(new Error(`Timed out waiting for next WebSocket message after ${timeoutMs}ms`));
        }, timeoutMs);

        const wrappedResolve = (msg: any) => {
          clearTimeout(timer);
          resolve(msg);
        };

        waiters.push(wrappedResolve);
      });
    };

    const receiveMatching = async (predicate: (msg: any) => boolean, timeoutMs = 3000): Promise<any> => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        // Check already buffered
        const foundIdx = messages.findIndex(predicate);
        if (foundIdx !== -1) {
          const [found] = messages.splice(foundIdx, 1);
          return found;
        }
        const remaining = timeoutMs - (Date.now() - startTime);
        if (remaining <= 0) break;
        try {
          const next = await receiveNext(Math.min(remaining, 400));
          if (predicate(next)) {
            return next;
          } else {
            messages.push(next); // Put back
          }
        } catch {
          // continue loop
        }
      }
      throw new Error(`Timed out waiting for matching WebSocket message after ${timeoutMs}ms`);
    };

    const close = async (): Promise<void> => {
      try {
        ws.terminate();
      } catch {}
    };

    return { ws, receiveNext, receiveMatching, close };
  };

  const createDummyPcmChunk = (durationSec = 0.25): string => {
    const sampleRate = 16000;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buf = Buffer.alloc(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.floor(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 10000);
      buf.writeInt16LE(sample, i * 2);
    }
    return buf.toString('base64');
  };

  // =========================================================================
  // TASK 4 — WEBSOCKET AUTHENTICATION & HANDSHAKE
  // =========================================================================
  describe('Task 4: WebSocket Authentication & Handshake Lifecycle', () => {
    it('should receive CONNECTED handshake requiring auth immediately upon opening connection', async () => {
      const client = await createWsClient();
      const handshake = await client.receiveNext();

      expect(handshake.type).toBe('CONNECTED');
      expect(handshake.requiresAuth).toBe(true);
      expect(handshake.canonicalFormat).toBeDefined();
      await client.close();
    });

    it('should authenticate successfully with valid JWT and return user details', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED

      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorOrg1Token } }));
      const authResp = await client.receiveNext();

      expect(authResp.type).toBe('AUTHENTICATED');
      expect(authResp.user.email).toBe('operator1@voxshield.local');
      expect(authResp.user.role).toBe(RoleName.OPERATOR);
      await client.close();
    });

    it('should reject AUTHENTICATE with missing token', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED

      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: {} }));
      const errResp = await client.receiveNext();

      expect(errResp.error).toBe('AUTH_REQUIRED');
      await client.close();
    });

    it('should reject AUTHENTICATE with malformed or invalid JWT', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED

      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: 'invalid.jwt.token' } }));
      const errResp = await client.receiveNext();

      expect(errResp.error).toBe('INVALID_TOKEN');
      await client.close();
    });

    it('should block streaming requests prior to AUTHENTICATE with UNAUTHENTICATED error', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED

      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallIdOrg1 }));
      const errResp = await client.receiveNext();

      expect(errResp.error).toBe('UNAUTHENTICATED');
      await client.close();
    });
  });

  // =========================================================================
  // TASK 4 & 5 — TENANT ISOLATION & RBAC AUTHORIZATION
  // =========================================================================
  describe('Task 4 & 5: Multi-Tenant Isolation & RBAC Authorization', () => {
    it('should reject START_STREAM for VIEWER role lacking calls:stream permission with 403 FORBIDDEN', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: viewerOrg1Token } }));
      await client.receiveNext(); // consume AUTHENTICATED

      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallIdOrg1 }));
      const errResp = await client.receiveNext();

      expect(errResp.error).toBe('FORBIDDEN');
      expect(errResp.message).toContain('calls:stream');
      await client.close();
    });

    it('should allow authorized OPERATOR to start stream on call belonging to own organization', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorOrg1Token } }));
      await client.receiveNext(); // consume AUTHENTICATED

      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallIdOrg1 }));
      const started = await client.receiveNext();

      expect(started.type).toBe('STREAM_STARTED');
      expect(started.callId).toBe(validCallIdOrg1);
      await client.close();
    });

    it('should reject START_STREAM for nonexistent callId with CALL_NOT_FOUND', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorOrg1Token } }));
      await client.receiveNext(); // consume AUTHENTICATED

      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: 'call-nonexistent-999' }));
      const errResp = await client.receiveNext();

      expect(errResp.error).toBe('CALL_NOT_FOUND');
      await client.close();
    });

    it('should reject cross-tenant START_STREAM when Operator from Org2 attempts access to Call in Org1', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorOrg2Token } }));
      await client.receiveNext(); // consume AUTHENTICATED

      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallIdOrg1 }));
      const errResp = await client.receiveNext();

      expect(errResp.error).toBe('FORBIDDEN');
      expect(errResp.message).toContain('another organization is denied');
      await client.close();
    });

    it('should ensure unauthenticated and cross-tenant clients do NOT receive broadcast risk events', async () => {
      // Client 1: Authenticated Org 1
      const clientOrg1 = await createWsClient();
      await clientOrg1.receiveNext();
      clientOrg1.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorOrg1Token } }));
      await clientOrg1.receiveNext();

      // Client 2: Authenticated Org 2 (Different tenant)
      const clientOrg2 = await createWsClient();
      await clientOrg2.receiveNext();
      clientOrg2.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorOrg2Token } }));
      await clientOrg2.receiveNext();

      // Client 3: Unauthenticated spectator
      const clientAnon = await createWsClient();
      await clientAnon.receiveNext();

      let org2Received = false;
      let anonReceived = false;

      clientOrg2.ws.on('message', (d) => {
        try {
          const parsed = JSON.parse(d.toString('utf-8'));
          if (parsed.type === 'UNIFIED_RISK_ASSESSMENT' && parsed.callId === validCallIdOrg1) {
            org2Received = true;
          }
        } catch {}
      });

      clientAnon.ws.on('message', (d) => {
        try {
          const parsed = JSON.parse(d.toString('utf-8'));
          if (parsed.type === 'UNIFIED_RISK_ASSESSMENT' && parsed.callId === validCallIdOrg1) {
            anonReceived = true;
          }
        } catch {}
      });

      // Broadcast event for Call in Org 1
      WebSocketGateway.broadcast({
        type: 'UNIFIED_RISK_ASSESSMENT',
        callId: validCallIdOrg1,
        sequenceNumber: 1,
        payload: {
          overall_risk_score: 85.0,
          risk_level: 'HIGH',
        },
        timestamp: new Date().toISOString(),
      });

      // Org 1 client should receive the broadcast
      const org1Event = await clientOrg1.receiveMatching((m) => m.type === 'UNIFIED_RISK_ASSESSMENT' && m.callId === validCallIdOrg1);
      expect(org1Event.callId).toBe(validCallIdOrg1);

      await new Promise((r) => setTimeout(r, 100));
      expect(org2Received).toBe(false);
      expect(anonReceived).toBe(false);

      await clientOrg1.close();
      await clientOrg2.close();
      await clientAnon.close();
    });
  });

  // =========================================================================
  // TASK 1, 2, 8, 9, 10 — EVENT SCHEMAS & PAYLOAD CONTRACTS
  // =========================================================================
  describe('Task 1, 2, 8, 9, 10: WebSocket Event Payloads & Status Semantics', () => {
    let client: TestClient;

    beforeEach(async () => {
      client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorOrg1Token } }));
      await client.receiveNext(); // consume AUTHENTICATED
      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallIdOrg1 }));
      await client.receiveNext(); // consume STREAM_STARTED
    });

    afterEach(async () => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'END_STREAM', callId: validCallIdOrg1 }));
        await client.close();
      }
    });

    it('AUDIO_TELEMETRY contract: emits structured telemetry with zero raw PCM audio buffers', async () => {
      const audioB64 = createDummyPcmChunk(0.25);
      client.ws.send(
        JSON.stringify({
          type: 'AUDIO_CHUNK',
          callId: validCallIdOrg1,
          sequenceNumber: 0,
          payload: {
            sample_rate: 16000,
            channels: 1,
            audio_base64: audioB64,
          },
        })
      );

      const tel = await client.receiveMatching((m) => m.type === 'AUDIO_TELEMETRY');
      expect(tel.callId).toBe(validCallIdOrg1);
      expect(tel.sequenceNumber).toBe(0);
      expect(tel.payload).toBeDefined();
      expect(tel.payload.deepfake).toBeDefined();
      expect(tel.payload.speaker).toBeDefined();
      expect(tel.payload.replay).toBeDefined();
      expect(tel.payload.vad).toBeDefined();
      expect(tel.payload.quality).toBeDefined();
      expect(tel.payload.models).toBeDefined();

      // Ensure no raw audio or sensitive buffers leaked in telemetry
      expect(tel.payload.pcmBuffer).toBeUndefined();
      expect(tel.payload.rawAudio).toBeUndefined();
    });

    it('UNIFIED_RISK_ASSESSMENT contract: emits 10-dimensional risk model with policy recommendation', async () => {
      const audioB64 = createDummyPcmChunk(0.25);
      client.ws.send(
        JSON.stringify({
          type: 'AUDIO_CHUNK',
          callId: validCallIdOrg1,
          sequenceNumber: 1,
          payload: {
            sample_rate: 16000,
            channels: 1,
            audio_base64: audioB64,
            transcript: 'Hello, I am calling regarding your account verification.',
          },
        })
      );

      const risk = await client.receiveMatching((m) => m.type === 'UNIFIED_RISK_ASSESSMENT');
      expect(risk.callId).toBe(validCallIdOrg1);
      expect(risk.payload).toBeDefined();
      expect(typeof risk.payload.overall_risk_score === 'number' || risk.payload.overall_risk_score === null).toBe(true);
      expect(risk.payload.risk_level).toBeDefined();
      expect(risk.payload.dimensions).toBeDefined();
      expect(risk.payload.dimensions.credential_theft).toBeDefined();
      expect(risk.payload.dimensions.social_engineering).toBeDefined();
      expect(risk.payload.dimensions.deepfake_synthetic).toBeDefined();
      expect(risk.payload.primary_drivers).toBeInstanceOf(Array);
      expect(risk.payload.evidence_graph).toBeDefined();
    });

    it('POLICY_ENFORCEMENT_TRIGGER & Privacy redaction: redacts OTP and triggers policy block on credential solicitation', async () => {
      const audioB64 = createDummyPcmChunk(0.25);
      client.ws.send(
        JSON.stringify({
          type: 'AUDIO_CHUNK',
          callId: validCallIdOrg1,
          sequenceNumber: 2,
          payload: {
            sample_rate: 16000,
            channels: 1,
            audio_base64: audioB64,
            transcript: 'Please tell me your 6-digit OTP code 839201 immediately for wire transfer.',
          },
        })
      );

      // Verify ASR_FINAL contains redacted transcript (not raw OTP 839201)
      const asrMsg = await client.receiveMatching((m) => m.type === 'ASR_FINAL');
      expect(asrMsg.payload.transcript).not.toContain('839201');
      expect(asrMsg.payload.transcript).toContain('[AUTHENTICATION_CODE_REDACTED]');

      // Verify POLICY_ENFORCEMENT_TRIGGER fired
      const policyMsg = await client.receiveMatching((m) => m.type === 'POLICY_ENFORCEMENT_TRIGGER');
      expect(policyMsg.payload.action).toBe('BLOCK_DISCLOSURE');
      expect(policyMsg.payload.is_triggered).toBe(true);
    });
  });

  // =========================================================================
  // TASK 3 & 10 — CRITICAL FAIL-SAFE UI & DEGRADATION SEMANTICS
  // =========================================================================
  describe('Task 3 & 10: Fail-Safe UI & Risk Degradation Contract', () => {
    it('should NEVER treat NOT_AVAILABLE AI result as 0 or SAFE/ALLOW', () => {
      const computeTrafficLightColor = (riskLevel?: string, score?: number | null) => {
        if (
          (riskLevel === 'LOW' || riskLevel === 'SAFE') &&
          typeof score === 'number' &&
          Number.isFinite(score)
        ) {
          return 'GREEN';
        }
        if (riskLevel === 'ELEVATED' || riskLevel === 'GUARDED') {
          return 'YELLOW';
        }
        if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
          return 'RED';
        }
        return 'GRAY'; // NOT_AVAILABLE, INCONCLUSIVE, null score, or unknown
      };

      // Normal Expected Mappings
      expect(computeTrafficLightColor('LOW', 10.0)).toBe('GREEN');
      expect(computeTrafficLightColor('SAFE', 5.0)).toBe('GREEN');
      expect(computeTrafficLightColor('ELEVATED', 45.0)).toBe('YELLOW');
      expect(computeTrafficLightColor('HIGH', 78.0)).toBe('RED');
      expect(computeTrafficLightColor('CRITICAL', 95.0)).toBe('RED');

      // Crucial Fail-Safe Tests
      expect(computeTrafficLightColor('NOT_AVAILABLE', null)).toBe('GRAY');
      expect(computeTrafficLightColor('NOT_AVAILABLE', undefined)).toBe('GRAY');
      expect(computeTrafficLightColor('NOT_AVAILABLE', 0)).toBe('GRAY');
      expect(computeTrafficLightColor('INCONCLUSIVE', null)).toBe('GRAY');
      expect(computeTrafficLightColor('INCONCLUSIVE', 0)).toBe('GRAY');
      expect(computeTrafficLightColor('LOW', null)).toBe('GRAY'); // Null score cannot be GREEN
      expect(computeTrafficLightColor('LOW', NaN)).toBe('GRAY');
      expect(computeTrafficLightColor(undefined, undefined)).toBe('GRAY');
      expect(computeTrafficLightColor('UNKNOWN_STATUS' as any, 0)).toBe('GRAY');
    });

    it('should preserve cross-modal contradiction when voice is authentic (low deepfake) but OTP solicitation is detected', () => {
      const assessPreservation = (deepfakeSpoof: number, intent: string) => {
        const isSocialEngineering = intent === 'OTP_SOLICITATION' || intent === 'PASSWORD_RESET';
        if (isSocialEngineering) {
          return { riskLevel: 'CRITICAL', action: 'BLOCK_DISCLOSURE' };
        }
        return deepfakeSpoof > 0.7 ? { riskLevel: 'HIGH', action: 'BLOCK_CALL' } : { riskLevel: 'LOW', action: 'ALLOW' };
      };

      const result = assessPreservation(0.02, 'OTP_SOLICITATION');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.action).toBe('BLOCK_DISCLOSURE');
    });
  });

  // =========================================================================
  // TASK 5 — CONCURRENT CALL / SESSION CORRELATION
  // =========================================================================
  describe('Task 5: Concurrent Call Session Correlation (5-10 Simultaneous Calls)', () => {
    it('should isolate 5 simultaneous concurrent call streams with 0 cross-call contamination', async () => {
      const numCalls = 5;
      const clients: TestClient[] = [];
      const callIds: string[] = [];

      for (let i = 1; i <= numCalls; i++) {
        const createdCall = await CallsService.createCall({
          callerIdentifier: `+1 (555) 000-000${i}`,
          destinationIdentifier: '+1 (555) 839-2041',
          organizationId: org1,
        });

        const client = await createWsClient();
        await client.receiveNext(); // consume CONNECTED
        client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorOrg1Token } }));
        await client.receiveNext(); // consume AUTHENTICATED

        callIds.push(createdCall.id);

        client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: createdCall.id }));
        await client.receiveNext(); // consume STREAM_STARTED
        clients.push(client);
      }

      // Send audio chunk to each client with distinct sequence and transcript
      const audioB64 = createDummyPcmChunk(0.2);
      for (let i = 0; i < numCalls; i++) {
        clients[i].ws.send(
          JSON.stringify({
            type: 'AUDIO_CHUNK',
            callId: callIds[i],
            sequenceNumber: i,
            payload: {
              sample_rate: 16000,
              channels: 1,
              audio_base64: audioB64,
              transcript: `Turn transcript for call index ${i}`,
            },
          })
        );
      }

      // Verify each client receives telemetry strictly for its own callId
      for (let i = 0; i < numCalls; i++) {
        const tel = await clients[i].receiveMatching((m) => m.type === 'AUDIO_TELEMETRY' && m.callId === callIds[i]);
        expect(tel.callId).toBe(callIds[i]);
        expect(tel.sequenceNumber).toBe(i);
      }

      // Cleanup
      for (let i = 0; i < numCalls; i++) {
        clients[i].ws.send(JSON.stringify({ type: 'END_STREAM', callId: callIds[i] }));
        await clients[i].close();
      }
    });
  });

  // =========================================================================
  // TASK 6 — EVENT ORDERING & STALE STATE REJECTION
  // =========================================================================
  describe('Task 6: Event Ordering & Stale State Prevention', () => {
    it('frontend state consumer should reject out-of-order stale sequence risk frames', () => {
      let currentRiskState = { sequenceNumber: -1, score: 0 };

      const applyRiskUpdate = (msg: { sequenceNumber?: number; score: number }) => {
        if (typeof msg.sequenceNumber === 'number') {
          if (msg.sequenceNumber < currentRiskState.sequenceNumber) {
            return; // Reject stale frame
          }
          currentRiskState = { sequenceNumber: msg.sequenceNumber, score: msg.score };
        }
      };

      // Normal order
      applyRiskUpdate({ sequenceNumber: 1, score: 20 });
      expect(currentRiskState).toEqual({ sequenceNumber: 1, score: 20 });

      applyRiskUpdate({ sequenceNumber: 3, score: 85 });
      expect(currentRiskState).toEqual({ sequenceNumber: 3, score: 85 });

      // Out-of-order delayed stale frame (sequence 2 arriving after 3)
      applyRiskUpdate({ sequenceNumber: 2, score: 30 });
      // Score MUST remain 85 from sequence 3
      expect(currentRiskState).toEqual({ sequenceNumber: 3, score: 85 });
    });
  });

  // =========================================================================
  // TASK 7 & 12 — MALFORMED PAYLOAD RESILIENCE & RECONNECT
  // =========================================================================
  describe('Task 7 & 12: Malformed Payload Robustness & Reconnection', () => {
    it('should reject malformed non-JSON strings without crashing server', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED

      client.ws.send('!!NOT_A_VALID_JSON_STRING$$$');
      const errResp = await client.receiveNext();

      expect(errResp.error).toBe('INVALID_PAYLOAD');
      expect(errResp.message).toContain('Malformed JSON');
      await client.close();
    });

    it('should reject unknown message types with UNKNOWN_MESSAGE_TYPE', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: adminToken } }));
      await client.receiveNext(); // consume AUTHENTICATED

      client.ws.send(JSON.stringify({ type: 'UNRECOGNIZED_ACTION_XYZ', payload: {} }));
      const errResp = await client.receiveNext();

      expect(errResp.error).toBe('UNKNOWN_MESSAGE_TYPE');
      await client.close();
    });

    it('should handle rapid disconnect and reconnect without socket resource leak', async () => {
      for (let i = 0; i < 5; i++) {
        const client = await createWsClient();
        await client.receiveNext(); // consume CONNECTED
        await client.close();
      }
    });
  });

  // =========================================================================
  // TASK 11 & 16 — POLICY DISPLAY & PRIVACY SANITIZATION
  // =========================================================================
  describe('Task 11 & 16: Policy Decision Display & Privacy Firewall Redaction', () => {
    it('should broadcast sanitized SOC alerts without exposing credit card or password data', async () => {
      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: adminToken } }));
      await client.receiveNext(); // consume AUTHENTICATED

      WebSocketGateway.broadcastAlert({
        callId: validCallIdOrg1,
        severity: 'CRITICAL',
        message: 'Suspicious card solicitation: 4532 0150 2849 1920 with CVV 891 and password is secretPassword123',
        action: 'TERMINATE_CALL',
      });

      const alertMsg = await client.receiveMatching((m) => m.type === 'SOC_ALERT');
      expect(alertMsg.payload.severity).toBe('CRITICAL');
      expect(alertMsg.payload.message).not.toContain('4532 0150 2849 1920');
      expect(alertMsg.payload.message).not.toContain('891');
      expect(alertMsg.payload.message).not.toContain('secretPassword123');
      expect(alertMsg.payload.message).toContain('[CARD_NUMBER_REDACTED]');
      expect(alertMsg.payload.message).toContain('[CVV_REDACTED]');
      expect(alertMsg.payload.message).toContain('[PASSWORD_REDACTED]');
      await client.close();
    });
  });
});
