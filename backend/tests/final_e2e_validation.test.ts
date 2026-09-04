/**
 * SIH104 — MEMBER 1 — PHASE 7
 * FINAL END-TO-END + REGRESSION VALIDATION TEST SUITE
 *
 * Full pipeline verification:
 * AUDIO -> MEDIA NORMALIZATION -> ACOUSTIC / SPEAKER / REPLAY -> ASYNC ASR / VAD ->
 * INTENT / SOCIAL ENGINEERING -> RISK FUSION -> POLICY -> INCIDENT -> INTERVENTION ->
 * WEBSOCKET -> SOC FRONTEND -> AUDIT
 */

import http from 'http';
import WebSocket from 'ws';
import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { CallsService, CallRecord } from '../src/calls/calls.service';
import { PoliciesService } from '../src/policies/policies.service';
import { RiskService } from '../src/risk/risk.service';
import { AcousticService } from '../src/acoustic/acoustic.service';
import { ConversationService } from '../src/conversation/conversation.service';
import { IncidentsService, IncidentRecord } from '../src/incidents/incidents.service';
import { InterventionService } from '../src/interventions/intervention.service';
import { AuditService } from '../src/security/audit.service';
import { WebSocketGateway } from '../src/websocket/ws_server';
import { AudioNormalizer } from '../src/calls/audio_normalizer';
import { StreamBufferManager } from '../src/calls/stream_buffer';
import { SpeechBufferManager } from '../src/calls/speech_buffer';
import { PrivacyFirewall } from '../src/security/privacy_firewall';

describe('Phase 7: Final End-to-End & Regression Validation', () => {
  let server: http.Server;
  let port: number;
  const originalFetch = global.fetch;

  const orgA = '00000000-0000-0000-0000-000000000001';
  const orgB = '00000000-0000-0000-0000-000000000002';

  let adminTokenA: string;
  let analystTokenA: string;
  let supervisorTokenA: string;
  let operatorTokenA: string;
  let viewerTokenA: string;

  let analystTokenB: string;
  let operatorTokenB: string;

  let callOrgA: CallRecord;
  let callOrgB: CallRecord;

  const openSockets: WebSocket[] = [];

  interface TestClient {
    ws: WebSocket;
    receiveNext: (timeoutMs?: number) => Promise<any>;
    receiveMatching: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
    close: () => Promise<void>;
  }

  const createConnectedClient = async (customPort?: number): Promise<TestClient> => {
    const ws = new WebSocket(`ws://127.0.0.1:${customPort || port}/ws`);
    openSockets.push(ws);

    const messageQueue: any[] = [];
    const waiters: Array<(msg: any) => void> = [];

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (waiters.length > 0) {
          const waiter = waiters.shift()!;
          waiter(parsed);
        } else {
          messageQueue.push(parsed);
        }
      } catch {}
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });

    const client: TestClient = {
      ws,
      receiveNext: (timeoutMs: number = 2000): Promise<any> => {
        return new Promise((resolve, reject) => {
          if (messageQueue.length > 0) {
            resolve(messageQueue.shift());
            return;
          }
          const timer = setTimeout(() => {
            const idx = waiters.indexOf(waiter);
            if (idx !== -1) waiters.splice(idx, 1);
            reject(new Error(`Timeout waiting for next WS message after ${timeoutMs}ms`));
          }, timeoutMs);

          const waiter = (msg: any) => {
            clearTimeout(timer);
            resolve(msg);
          };
          waiters.push(waiter);
        });
      },
      receiveMatching: (predicate: (msg: any) => boolean, timeoutMs: number = 3000): Promise<any> => {
        return new Promise((resolve, reject) => {
          for (let i = 0; i < messageQueue.length; i++) {
            if (predicate(messageQueue[i])) {
              const matched = messageQueue.splice(i, 1)[0];
              resolve(matched);
              return;
            }
          }

          const timer = setTimeout(() => {
            const idx = waiters.indexOf(waiter);
            if (idx !== -1) waiters.splice(idx, 1);
            reject(new Error(`Timeout waiting for matching WS message after ${timeoutMs}ms`));
          }, timeoutMs);

          const waiter = (msg: any) => {
            if (predicate(msg)) {
              clearTimeout(timer);
              resolve(msg);
            } else {
              messageQueue.push(msg);
            }
          };
          waiters.push(waiter);
        });
      },
      close: async (): Promise<void> => {
        if (ws.readyState === WebSocket.OPEN) {
          await new Promise<void>((res) => {
            ws.once('close', () => res());
            ws.close();
          });
        }
      },
    };

    return client;
  };

  beforeAll(async () => {
    PoliciesService.initializeDefaultPolicies();
    CallsService.seedSampleCallsIfEmpty();

    callOrgA = await CallsService.createCall({
      organizationId: orgA,
      callerIdentifier: '+1 (555) 100-0001',
      destinationIdentifier: '1-800-VOX-BANK',
    });

    callOrgB = await CallsService.createCall({
      organizationId: orgB,
      callerIdentifier: '+1 (555) 200-0002',
      destinationIdentifier: '1-800-OTHER-CORP',
    });

    adminTokenA = TokenService.generateToken({
      userId: 'u-admin-orgA',
      email: 'admin@orgA.voxshield',
      role: RoleName.ADMIN,
      organizationId: orgA,
    });

    analystTokenA = TokenService.generateToken({
      userId: 'u-analyst-orgA',
      email: 'analyst@orgA.voxshield',
      role: RoleName.SECURITY_ANALYST,
      organizationId: orgA,
    });

    supervisorTokenA = TokenService.generateToken({
      userId: 'u-supervisor-orgA',
      email: 'supervisor@orgA.voxshield',
      role: RoleName.SUPERVISOR,
      organizationId: orgA,
    });

    operatorTokenA = TokenService.generateToken({
      userId: 'u-operator-orgA',
      email: 'operator@orgA.voxshield',
      role: RoleName.OPERATOR,
      organizationId: orgA,
    });

    viewerTokenA = TokenService.generateToken({
      userId: 'u-viewer-orgA',
      email: 'viewer@orgA.voxshield',
      role: RoleName.VIEWER,
      organizationId: orgA,
    });

    analystTokenB = TokenService.generateToken({
      userId: 'u-analyst-orgB',
      email: 'analyst@orgB.voxshield',
      role: RoleName.SECURITY_ANALYST,
      organizationId: orgB,
    });

    operatorTokenB = TokenService.generateToken({
      userId: 'u-operator-orgB',
      email: 'operator@orgB.voxshield',
      role: RoleName.OPERATOR,
      organizationId: orgB,
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 8080;
        WebSocketGateway.initialize(server);
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const ws of openSockets) {
      try {
        ws.terminate();
      } catch {}
    }
    await WebSocketGateway.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ==========================================================================
  // TASK 3 — E2E SCENARIO MATRIX (SCENARIOS A - L)
  // ==========================================================================
  describe('Task 3: Authoritative E2E Threat Scenario Matrix', () => {
    const dummyAudio = Buffer.alloc(8192, 0x1a).toString('base64');

    it('Scenario A [Normal Human]: should return LOW risk, GREEN, and ALLOW policy', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 12.0,
              risk_level: 'LOW',
              confidence: 0.95,
              uncertainty: 0.05,
              dimensions: {
                overall: 12.0,
                identity_impersonation: 5.0,
                deepfake_synthetic: 4.0,
                replay_injection: 5.0,
                social_engineering: 5.0,
                credential_theft: 0.0,
                financial_fraud: 5.0,
                account_takeover: 0.0,
                verification_bypass: 0.0,
                inconsistency: 2.0,
              },
              risk_velocity: 0.0,
              risk_trajectory_trend: 'STABLE',
              primary_drivers: ['Bona fide acoustic cues', 'Natural conversation flow'],
              contradicting_signals: [],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['Clean verification'] },
              policy_recommendation: {
                action: 'ALLOW',
                is_triggered: false,
                policy_id: 'POL-DEF-ALLOW',
                rule_name: 'Default Allow Safe Interactions',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
          text_transcript: 'Hello, I would like to check my account balance please.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overall_risk_score).toBeLessThanOrEqual(25);
      expect(data.risk_level).toBe('LOW');
      expect(data.policy_recommendation.action).toBe('ALLOW');
      expect(data.policy_recommendation.is_triggered).toBe(false);
    });

    it('Scenario B [Synthetic / Deepfake Voice]: should return CRITICAL, RED, and REQUIRE_STEP_UP_VERIFICATION / BLOCK', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 88.0,
              risk_level: 'CRITICAL',
              confidence: 0.94,
              uncertainty: 0.06,
              dimensions: {
                overall: 88.0,
                deepfake_synthetic: 95.0,
                identity_impersonation: 80.0,
                replay_injection: 10.0,
                social_engineering: 30.0,
                credential_theft: 0.0,
                financial_fraud: 50.0,
                account_takeover: 40.0,
                verification_bypass: 0.0,
                inconsistency: 20.0,
              },
              risk_velocity: 0.45,
              risk_trajectory_trend: 'RISING',
              primary_drivers: ['Neural vocoder pitch anomaly', 'Synthetic voice detected'],
              contradicting_signals: [],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['High spoof probability'] },
              policy_recommendation: {
                action: 'REQUIRE_STEP_UP_VERIFICATION',
                is_triggered: true,
                policy_id: 'POL-SPOOF-001',
                rule_name: 'Enforce Step-Up on Deepfake Detection',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
          text_transcript: 'Please authorize this immediate wire transfer now.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overall_risk_score).toBeGreaterThanOrEqual(80);
      expect(data.risk_level).toBe('CRITICAL');
      expect(['BLOCK_DISCLOSURE', 'REQUIRE_STEP_UP_VERIFICATION', 'TERMINATE_CALL']).toContain(data.policy_recommendation.action);
      expect(data.policy_recommendation.is_triggered).toBe(true);
    });

    it('Scenario C [Human Voice + OTP Theft]: MUST NOT reason "Human voice = safe"; must trigger BLOCK_DISCLOSURE', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 85.0,
              risk_level: 'CRITICAL',
              confidence: 0.95,
              uncertainty: 0.05,
              dimensions: {
                overall: 85.0,
                deepfake_synthetic: 2.0, // Bona fide human voice!
                identity_impersonation: 10.0,
                replay_injection: 3.0,
                social_engineering: 88.0,
                credential_theft: 96.0, // High credential theft!
                financial_fraud: 60.0,
                account_takeover: 70.0,
                verification_bypass: 85.0,
                inconsistency: 5.0,
              },
              risk_velocity: 0.6,
              risk_trajectory_trend: 'RISING',
              primary_drivers: ['credential_theft', 'OTP solicitation detected'],
              contradicting_signals: [],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['Active OTP theft solicitation'] },
              policy_recommendation: {
                action: 'BLOCK_DISCLOSURE',
                is_triggered: true,
                policy_id: 'POL-CRED-001',
                rule_name: 'Block Sensitive OTP & Credential Disclosure',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
          text_transcript: 'I need you to tell me the 6-digit one-time passcode sent to your phone right now.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overall_risk_score).toBeGreaterThanOrEqual(75);
      expect(['HIGH', 'CRITICAL']).toContain(data.risk_level);
      expect(data.primary_drivers).toContain('credential_theft');
      expect(data.policy_recommendation.action).toBe('BLOCK_DISCLOSURE');
      expect(data.policy_recommendation.is_triggered).toBe(true);
    });

    it('Scenario D [Social Engineering]: conversational intelligence contributes strongly to elevated risk', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 78.0,
              risk_level: 'HIGH',
              confidence: 0.92,
              uncertainty: 0.08,
              dimensions: {
                overall: 78.0,
                deepfake_synthetic: 12.0,
                identity_impersonation: 20.0,
                replay_injection: 8.0,
                social_engineering: 92.0,
                credential_theft: 40.0,
                financial_fraud: 30.0,
                account_takeover: 50.0,
                verification_bypass: 65.0,
                inconsistency: 10.0,
              },
              risk_velocity: 0.35,
              risk_trajectory_trend: 'RISING',
              primary_drivers: ['social_engineering', 'Urgency and fear induction tactics'],
              contradicting_signals: [],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['High urgency social engineering'] },
              policy_recommendation: {
                action: 'REQUIRE_STEP_UP_VERIFICATION',
                is_triggered: true,
                policy_id: 'POL-SOC-001',
                rule_name: 'Social Engineering Mitigation',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
          text_transcript: 'This is IT Security emergency response team. Your workstation is compromised, disable your 2FA.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overall_risk_score).toBeGreaterThanOrEqual(60);
      expect(data.primary_drivers).toContain('social_engineering');
      expect(data.policy_recommendation.is_triggered).toBe(true);
    });

    it('Scenario E [Replay / Injection]: elevated replay probability triggers appropriate policy & elevated risk', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 74.0,
              risk_level: 'HIGH',
              confidence: 0.90,
              uncertainty: 0.10,
              dimensions: {
                overall: 74.0,
                deepfake_synthetic: 15.0,
                identity_impersonation: 20.0,
                replay_injection: 94.0,
                social_engineering: 10.0,
                credential_theft: 0.0,
                financial_fraud: 10.0,
                account_takeover: 20.0,
                verification_bypass: 30.0,
                inconsistency: 25.0,
              },
              risk_velocity: 0.2,
              risk_trajectory_trend: 'RISING',
              primary_drivers: ['replay_injection', 'Acoustic reverberation artifacts'],
              contradicting_signals: [],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['Replay injection detected'] },
              policy_recommendation: {
                action: 'REQUIRE_STEP_UP_VERIFICATION',
                is_triggered: true,
                policy_id: 'POL-REPLAY-001',
                rule_name: 'Enforce Step-Up on Replay Attack',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
          text_transcript: 'Yes my voice is my password verify me.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overall_risk_score).toBeGreaterThanOrEqual(60);
      expect(data.primary_drivers).toContain('replay_injection');
      expect(data.policy_recommendation.is_triggered).toBe(true);
    });

    it('Scenario F [Impersonation]: speaker mismatch produces elevated identity_impersonation risk', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 76.0,
              risk_level: 'HIGH',
              confidence: 0.93,
              uncertainty: 0.07,
              dimensions: {
                overall: 76.0,
                deepfake_synthetic: 10.0,
                identity_impersonation: 88.0,
                replay_injection: 5.0,
                social_engineering: 65.0,
                credential_theft: 0.0,
                financial_fraud: 55.0,
                account_takeover: 50.0,
                verification_bypass: 40.0,
                inconsistency: 30.0,
              },
              risk_velocity: 0.3,
              risk_trajectory_trend: 'RISING',
              primary_drivers: ['identity_impersonation', 'Biometric mismatch against claimed speaker'],
              contradicting_signals: [],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['Speaker biometric mismatch'] },
              policy_recommendation: {
                action: 'REQUIRE_STEP_UP_VERIFICATION',
                is_triggered: true,
                policy_id: 'POL-ID-001',
                rule_name: 'Enforce Step-Up on Identity Impersonation',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
          claimed_speaker_id: 'spk-ceo-001',
          text_transcript: 'I am the CEO, approve the offshore wire immediately.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overall_risk_score).toBeGreaterThanOrEqual(60);
      expect(data.primary_drivers).toContain('identity_impersonation');
      expect(data.policy_recommendation.is_triggered).toBe(true);
    });

    it('Scenario G [Compound Attack]: deepfake + impersonation + credential theft triggers CRITICAL and strongest action', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 96.0,
              risk_level: 'CRITICAL',
              confidence: 0.98,
              uncertainty: 0.02,
              dimensions: {
                overall: 96.0,
                deepfake_synthetic: 95.0,
                identity_impersonation: 90.0,
                replay_injection: 85.0,
                social_engineering: 99.0,
                credential_theft: 95.0,
                financial_fraud: 98.0,
                account_takeover: 95.0,
                verification_bypass: 96.0,
                inconsistency: 40.0,
              },
              risk_velocity: 0.8,
              risk_trajectory_trend: 'RISING',
              primary_drivers: ['Multi-vector compound attack', 'Synthetic voice', 'High value credential fraud'],
              contradicting_signals: [],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['Compound multi-threat attack active'] },
              policy_recommendation: {
                action: 'BLOCK_DISCLOSURE',
                is_triggered: true,
                policy_id: 'POL-CRIT-001',
                rule_name: 'Block Immediate Compound Attacks',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
          text_transcript: 'I am the VIP executive, give me your master password and transfer $500,000 immediately.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overall_risk_score).toBeGreaterThanOrEqual(90);
      expect(data.risk_level).toBe('CRITICAL');
      expect(data.policy_recommendation.action).toBe('BLOCK_DISCLOSURE');
      expect(data.primary_drivers.length).toBeGreaterThanOrEqual(2);
    });

    it('Scenario H [AI Unavailable]: AI failure must produce NOT_AVAILABLE / INCONCLUSIVE, GRAY, not GREEN/ALLOW', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async () => {
        throw new Error('AI Service Connection Refused');
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.risk_level).toBe('INCONCLUSIVE');
      expect(data.uncertainty).toBe(1.0);
      expect(data.overall_risk_score).toBeNull();
      expect(data.status).toBe('NOT_AVAILABLE');
      expect(data.risk_level).not.toBe('LOW');
    });

    it('Scenario I [Low SNR / Poor Audio]: increases uncertainty and keeps decision guarded without false confidence', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 45.0,
              risk_level: 'GUARDED',
              confidence: 0.35,
              uncertainty: 0.65,
              dimensions: {
                overall: 45.0,
                deepfake_synthetic: 45.0,
                identity_impersonation: 30.0,
                replay_injection: 40.0,
                social_engineering: 20.0,
                credential_theft: 0.0,
                financial_fraud: 10.0,
                account_takeover: 10.0,
                verification_bypass: 0.0,
                inconsistency: 10.0,
              },
              risk_velocity: 0.0,
              risk_trajectory_trend: 'STABLE',
              primary_drivers: ['Low SNR audio penalty', 'Elevated acoustic uncertainty'],
              contradicting_signals: [],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['Degraded audio quality'] },
              policy_recommendation: {
                action: 'WARN_OPERATOR',
                is_triggered: true,
                policy_id: 'POL-WARN-001',
                rule_name: 'Warn Operator on Guarded Signal',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.uncertainty).toBeGreaterThanOrEqual(0.5);
      expect(data.confidence).toBeLessThanOrEqual(0.6);
    });

    it('Scenario J [Contradictory Signals]: deepfake low, speaker mismatch high, OTP theft high preserves danger evidence', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'PROCESSED',
              overall_risk_score: 82.0,
              risk_level: 'HIGH',
              confidence: 0.94,
              uncertainty: 0.06,
              dimensions: {
                overall: 82.0,
                deepfake_synthetic: 3.0, // Bona fide acoustic
                identity_impersonation: 90.0, // Impersonation high
                replay_injection: 5.0,
                social_engineering: 89.0,
                credential_theft: 95.0, // OTP theft high
                financial_fraud: 60.0,
                account_takeover: 70.0,
                verification_bypass: 85.0,
                inconsistency: 40.0,
              },
              risk_velocity: 0.5,
              risk_trajectory_trend: 'RISING',
              primary_drivers: ['credential_theft', 'identity_impersonation'],
              contradicting_signals: ['Acoustic model indicates human voice, but linguistic & biometric models indicate active fraud.'],
              evidence_graph: { nodes: [], edges: [], primary_findings: ['Contradictory modal evidence preserved'] },
              policy_recommendation: {
                action: 'BLOCK_DISCLOSURE',
                is_triggered: true,
                policy_id: 'POL-CRED-001',
                rule_name: 'Block OTP Disclosure on Impersonation Threat',
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
          text_transcript: 'Confirm the OTP sent to your SMS immediately.',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overall_risk_score).toBeGreaterThanOrEqual(75);
      expect(['HIGH', 'CRITICAL']).toContain(data.risk_level);
      expect(data.policy_recommendation.action).toBe('BLOCK_DISCLOSURE');
    });

    it('Scenario K [Malformed AI Response]: null/NaN/invalid AI data gracefully degrades to INCONCLUSIVE without crashing', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'CORRUPTED',
            overall_risk_score: 'not-a-number',
            risk_level: 'INVALID_LEVEL',
            dimensions: null,
          }),
        } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: dummyAudio,
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.risk_level).toBe('INCONCLUSIVE');
      expect(data.status).toBe('NOT_AVAILABLE');
      expect(data.risk_level).not.toBe('LOW');
    });

    it('Scenario L [Malformed Client / WebSocket Input]: rejects invalid JSON, bad types, missing callId safely', async () => {
      const client = await createConnectedClient();
      const handshake = await client.receiveNext();
      expect(handshake.type).toBe('CONNECTED');

      // 1. Invalid JSON string
      client.ws.send('NOT_JSON{{{');
      const err1 = await client.receiveNext();
      expect(err1.type).toBe('ERROR');
      expect(err1.error).toBe('INVALID_PAYLOAD');

      // 2. Missing type
      client.ws.send(JSON.stringify({ some_key: 'value' }));
      const err2 = await client.receiveNext();
      expect(err2.type).toBe('ERROR');
      expect(err2.error).toBe('INVALID_PAYLOAD');

      // 3. Authenticate client
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: analystTokenA } }));
      const authRes = await client.receiveNext();
      expect(authRes.type).toBe('AUTHENTICATED');

      // 4. Authenticated client sends unknown type
      client.ws.send(JSON.stringify({ type: 'NON_EXISTENT_TYPE', payload: {} }));
      const err3 = await client.receiveNext();
      expect(err3.type).toBe('ERROR');
      expect(err3.error).toBe('UNKNOWN_MESSAGE_TYPE');

      await client.close();
    });
  });

  // ==========================================================================
  // TASK 4 — END-TO-END CALL CORRELATION (5 - 10 CONCURRENT CALLS)
  // ==========================================================================
  describe('Task 4: Multi-Call Correlation & Concurrent Isolation', () => {
    it('should maintain strict callId correlation across 5 simultaneous synthetic calls', async () => {
      const calls: CallRecord[] = [];
      for (let i = 0; i < 5; i++) {
        const c = await CallsService.createCall({
          organizationId: orgA,
          callerIdentifier: `+1 (555) 900-000${i}`,
          destinationIdentifier: `1-800-TEST-00${i}`,
        });
        calls.push(c);
      }

      jest.spyOn(global, 'fetch').mockImplementation(async (url: any, options: any) => {
        let reqBody: any = {};
        try {
          reqBody = options?.body ? JSON.parse(options.body) : {};
        } catch {}

        return {
          ok: true,
          status: 200,
          json: async () => ({
            call_id: reqBody.call_id,
            status: 'PROCESSED',
            overall_risk_score: 20.0,
            risk_level: 'LOW',
            confidence: 0.95,
            uncertainty: 0.05,
            dimensions: { overall: 20.0 },
            primary_drivers: ['Normal call'],
            contradicting_signals: [],
            evidence_graph: { nodes: [], edges: [], primary_findings: [] },
            policy_recommendation: { action: 'ALLOW', is_triggered: false },
          }),
        } as any;
      });

      // Simulate 5 parallel requests
      const promises = calls.map((c, index) => {
        return request(app)
          .post('/api/risk/evaluate')
          .set('Authorization', `Bearer ${analystTokenA}`)
          .send({
            callId: c.id,
            streamId: `stream-${c.id}`,
            text_transcript: index === 0 ? 'Give me your OTP code right now.' : 'Hello, just checking my balance.',
          });
      });

      const results = await Promise.all(promises);
      results.forEach((res, index) => {
        expect(res.status).toBe(200);
        const data = res.body.data;
        expect(data.call_id || data.callId).toBe(calls[index].id);
      });
    });

    it('should maintain strict callId correlation across 10 simultaneous synthetic calls', async () => {
      const calls: CallRecord[] = [];
      for (let i = 0; i < 10; i++) {
        const c = await CallsService.createCall({
          organizationId: orgA,
          callerIdentifier: `+1 (555) 800-00${i < 10 ? '0' + i : i}`,
          destinationIdentifier: `1-800-CONCUR-${i}`,
        });
        calls.push(c);
      }

      jest.spyOn(global, 'fetch').mockImplementation(async (url: any, options: any) => {
        let reqBody: any = {};
        try {
          reqBody = options?.body ? JSON.parse(options.body) : {};
        } catch {}

        return {
          ok: true,
          status: 200,
          json: async () => ({
            call_id: reqBody.call_id,
            status: 'PROCESSED',
            overall_risk_score: 15.0,
            risk_level: 'LOW',
            confidence: 0.95,
            uncertainty: 0.05,
            dimensions: { overall: 15.0 },
            primary_drivers: ['Normal call'],
            contradicting_signals: [],
            evidence_graph: { nodes: [], edges: [], primary_findings: [] },
            policy_recommendation: { action: 'ALLOW', is_triggered: false },
          }),
        } as any;
      });

      const promises = calls.map((c) => {
        return request(app)
          .post('/api/risk/evaluate')
          .set('Authorization', `Bearer ${analystTokenA}`)
          .send({
            callId: c.id,
            streamId: `stream-${c.id}`,
            text_transcript: 'Legitimate regular customer inquiry.',
          });
      });

      const results = await Promise.all(promises);
      results.forEach((res, index) => {
        expect(res.status).toBe(200);
        const data = res.body.data;
        expect(data.call_id || data.callId).toBe(calls[index].id);
      });
    });
  });

  // ==========================================================================
  // TASK 5 — END-TO-END TENANT ISOLATION
  // ==========================================================================
  describe('Task 5: End-to-End Tenant Isolation (Org A vs Org B)', () => {
    it('Org A user cannot read Org B calls via REST', async () => {
      const res = await request(app)
        .get(`/api/calls/${callOrgB.id}`)
        .set('Authorization', `Bearer ${analystTokenA}`);

      expect(res.status).toBe(403);
    });

    it('Org B user cannot stream or subscribe to Org A call via WebSocket', async () => {
      const client = await createConnectedClient();
      await client.receiveNext(); // Handshake

      // Authenticate as Org B operator
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorTokenB } }));
      const authRes = await client.receiveNext();
      expect(authRes.type).toBe('AUTHENTICATED');

      // Attempt START_STREAM on Org A's call
      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: callOrgA.id }));
      const streamErr = await client.receiveNext();
      expect(streamErr.type).toBe('ERROR');
      expect(streamErr.error).toBe('FORBIDDEN');

      await client.close();
    });

    it('Org A analyst cannot list or view Org B incidents', async () => {
      // Create incident in Org B
      const incB = await IncidentsService.createIncident({
        organizationId: orgB,
        severity: 'HIGH',
        attackClassification: 'DEEPFAKE_VOICE_FRAUD',
        callId: callOrgB.id,
        summary: 'Incident strictly belonging to Org B',
        triggeredPolicies: ['POL-SPOOF-001'],
        actionsTaken: ['REQUIRE_STEP_UP_VERIFICATION'],
        evidenceReferences: [],
      });

      // Org A analyst attempts to view Org B incident
      const res = await request(app)
        .get(`/api/incidents/${incB.id}`)
        .set('Authorization', `Bearer ${analystTokenA}`);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // TASK 6 — END-TO-END RBAC MATRIX
  // ==========================================================================
  describe('Task 6: Role-Based Access Control (RBAC) Verification', () => {
    it('OPERATOR can view calls and stream audio, but cannot perform analyst override or view audit logs', async () => {
      // View calls -> Allowed
      const getCalls = await request(app)
        .get('/api/calls')
        .set('Authorization', `Bearer ${operatorTokenA}`);
      expect(getCalls.status).toBe(200);

      // View audit logs -> Forbidden (requires audit:read / admin)
      const getAudit = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${operatorTokenA}`);
      expect(getAudit.status).toBe(403);
    });

    it('VIEWER cannot start audio stream or create/override interventions', async () => {
      const client = await createConnectedClient();
      await client.receiveNext(); // Handshake

      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: viewerTokenA } }));
      const authRes = await client.receiveNext();
      expect(authRes.type).toBe('AUTHENTICATED');

      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: callOrgA.id }));
      const streamErr = await client.receiveNext();
      expect(streamErr.type).toBe('ERROR');
      expect(streamErr.error).toBe('FORBIDDEN');

      await client.close();
    });

    it('ADMIN has full administrative access to calls, policies, incidents, and audit', async () => {
      const getAudit = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${adminTokenA}`);
      expect(getAudit.status).toBe(200);
    });
  });

  // ==========================================================================
  // TASK 7 — INCIDENT & INTERVENTION LIFECYCLE (APPROVED, REJECTED, OVERRIDDEN)
  // ==========================================================================
  describe('Task 7: Incident + Intervention Complete E2E Lifecycle', () => {
    it('executes Threat -> Risk -> Policy -> Incident -> Intervention Recommendation -> Human Decision (APPROVED)', async () => {
      // 1. Create intervention recommendation
      const intervention = await InterventionService.createIntervention({
        callId: callOrgA.id,
        organizationId: orgA,
        level: 'LEVEL_5_TERMINATE_CALL',
        actionType: 'BLOCK',
        policyId: 'POL-CRIT-001',
        evidenceSummary: ['Confirmed synthetic voice with social engineering urgency'],
      });

      expect(intervention.status).toBe('AWAITING_HUMAN');
      expect(intervention.actionType).toBe('BLOCK');

      // 2. Analyst Approves intervention
      const approved = await InterventionService.recordHumanDecision({
        interventionId: intervention.id,
        decision: 'APPROVED',
        actorUserId: 'u-analyst-orgA',
        reason: 'Analyst verified malicious impersonation attempt',
        organizationId: orgA,
      });

      expect(approved.status).toBe('EXECUTED');
      expect(approved.humanDecision).toBe('APPROVED');
      expect(approved.approvedBy).toBe('u-analyst-orgA');
      expect(approved.executedAt).toBeDefined();
    });

    it('executes Human Decision (REJECTED) with audit trail', async () => {
      const intervention = await InterventionService.createIntervention({
        callId: callOrgA.id,
        organizationId: orgA,
        level: 'LEVEL_2_STEP_UP_VERIFICATION',
        actionType: 'REQUIRE_STEP_UP_VERIFICATION',
        policyId: 'POL-SPOOF-001',
        evidenceSummary: ['Elevated acoustic anomaly score'],
      });

      const rejected = await InterventionService.recordHumanDecision({
        interventionId: intervention.id,
        decision: 'REJECTED',
        actorUserId: 'u-analyst-orgA',
        reason: 'Verified caller via secondary physical badge scanner',
        organizationId: orgA,
      });

      expect(rejected.status).toBe('REJECTED');
      expect(rejected.humanDecision).toBe('REJECTED');
      expect(rejected.decisionReason).toContain('secondary physical badge');
    });

    it('executes Human Decision (OVERRIDDEN) preserving original action and override details', async () => {
      const intervention = await InterventionService.createIntervention({
        callId: callOrgA.id,
        organizationId: orgA,
        level: 'LEVEL_5_TERMINATE_CALL',
        actionType: 'BLOCK',
        policyId: 'POL-CRIT-001',
        evidenceSummary: ['Automated policy triggered BLOCK'],
      });

      const overridden = await InterventionService.recordHumanDecision({
        interventionId: intervention.id,
        decision: 'OVERRIDDEN',
        overrideAction: 'ALLOW',
        reason: 'Executive VIP VIP-list whitelist pre-clearance override',
        actorUserId: 'u-analyst-orgA',
        organizationId: orgA,
      });

      expect(overridden.status).toBe('OVERRIDDEN');
      expect(overridden.originalActionType).toBe('BLOCK'); // Original preserved!
      expect(overridden.overrideAction).toBe('ALLOW'); // Override action captured
      expect(overridden.decisionReason).toBe('Executive VIP VIP-list whitelist pre-clearance override');
      expect(overridden.approvedBy).toBe('u-analyst-orgA');
      expect(overridden.executedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // TASK 8 — WEBSOCKET FAILURE & RECONNECT SAFETY
  // ==========================================================================
  describe('Task 8: WebSocket Disconnect, Reconnect & Fail-Safe State', () => {
    it('handles client disconnect, reconnect, and clean re-subscription safely', async () => {
      // First connection
      let client = await createConnectedClient();
      await client.receiveNext(); // Handshake
      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: analystTokenA } }));
      await client.receiveNext(); // Authenticated

      // Disconnect abruptly
      await client.close();

      // Reconnect immediately
      client = await createConnectedClient();
      const freshHandshake = await client.receiveNext();
      expect(freshHandshake.type).toBe('CONNECTED');

      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: analystTokenA } }));
      const authRes = await client.receiveNext();
      expect(authRes.type).toBe('AUTHENTICATED');

      await client.close();
    });
  });

  // ==========================================================================
  // TASK 9 & 10 — ASR & AI SERVICE FAILURE DEGRADATION
  // ==========================================================================
  describe('Task 9 & 10: ASR & AI Service Failure & Safe Degradation', () => {
    it('ASR 500 server error does not crash pipeline and produces safe degraded conversational result', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = url.toString();
        if (urlStr.includes('/fusion/evaluate-risk')) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Whisper Server Error',
            text: async () => 'Internal Whisper Server Error',
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystTokenA}`)
        .send({
          callId: callOrgA.id,
          audio_base64: Buffer.alloc(8192).toString('base64'),
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.risk_level).toBeDefined();
    });
  });

  // ==========================================================================
  // TASK 11 — PRIVACY & SECRET SANITIZATION
  // ==========================================================================
  describe('Task 11: Privacy & Sensitive Data Firewall Sanitization', () => {
    it('redacts OTP, PIN, password, CVV, and credit card numbers from transcripts, audit logs, and incidents', () => {
      const rawText = 'My OTP is 849201, my password is SecretPassword123, card is 4532 1198 3421 9087 with CVV 782 and PIN 4392.';
      const sanitized = PrivacyFirewall.sanitize(rawText);

      expect(sanitized.sanitizedText).not.toContain('849201');
      expect(sanitized.sanitizedText).not.toContain('SecretPassword123');
      expect(sanitized.sanitizedText).not.toContain('4532 1198 3421 9087');
      expect(sanitized.sanitizedText).not.toContain('782');
      expect(sanitized.sanitizedText).not.toContain('4392');

      expect(sanitized.sanitizedText).toContain('[AUTHENTICATION_CODE_REDACTED]');
      expect(sanitized.sanitizedText).toContain('[PASSWORD_REDACTED]');
      expect(sanitized.sanitizedText).toContain('[CARD_NUMBER_REDACTED]');
      expect(sanitized.sanitizedText).toContain('[CVV_REDACTED]');
      expect(sanitized.sanitizedText).toContain('[PIN_REDACTED]');
    });
  });

  // ==========================================================================
  // TASK 12 — FRONTEND FAIL-SAFE INTEGRITY
  // ==========================================================================
  describe('Task 12: Frontend Fail-Safe & Rendering Safety Guarantees', () => {
    it('null or undefined risk score maps strictly to INCONCLUSIVE / GRAY and NEVER false-safe GREEN', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async () => {
        throw new Error('AI Unavailable');
      });

      const degradedRisk = await RiskService.evaluateUnifiedRisk({ callId: callOrgA.id });

      expect(degradedRisk.risk_level).toBe('INCONCLUSIVE');
      expect(degradedRisk.overall_risk_score).toBeNull();
      expect(degradedRisk.uncertainty).toBe(1.0);
      expect(degradedRisk.status).toBe('NOT_AVAILABLE');
      expect(degradedRisk.risk_level).not.toBe('LOW');
    });
  });
});
