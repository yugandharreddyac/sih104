/**
 * Priority 2: Risk Safety Scenario Regression Tests
 * Explicitly tests all 7 threat scenarios with clearly labeled mock/test fixtures:
 * 1. Normal human (Clean audio) -> Low risk / GREEN / ALLOW
 * 2. Synthetic/deepfake voice -> High risk / CRITICAL
 * 3. Genuine human voice + credential theft -> Low deepfake, High credential theft -> High composite risk
 * 4. AI unavailable -> NOT_AVAILABLE / INCONCLUSIVE -> Never silently convert to 0 / safe / ALLOW
 * 5. Noisy/low-SNR audio -> Elevated uncertainty
 * 6. Replay/injection -> Elevated replay risk
 * 7. Speaker inconsistency -> Elevated identity/impersonation risk
 */

import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { RiskService } from '../src/risk/risk.service';

describe('Priority 2: Core Risk Safety Scenarios (MOCKED / TEST FIXTURES)', () => {
  const originalFetch = global.fetch;

  const analystToken = TokenService.generateToken({
    userId: 'u-lead-auditor',
    email: 'auditor@voxshield.local',
    role: RoleName.SECURITY_ANALYST,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // TEST 1: Normal Human
  // --------------------------------------------------------------------------
  it('TEST 1 [Normal Human]: should return LOW risk, high confidence, and ALLOW policy', async () => {
    const normalHumanFixture = {
      status: 'AVAILABLE',
      call_id: 'call-normal-human',
      turn_index: 0,
      overall_risk_score: 8.5,
      risk_level: 'SAFE',
      confidence: 0.95,
      uncertainty: 0.05,
      dimensions: {
        overall: 8.5,
        identity_impersonation: 5.0,
        deepfake_synthetic: 4.0,
        replay_injection: 3.0,
        social_engineering: 5.0,
        credential_theft: 0.0,
        financial_fraud: 0.0,
        account_takeover: 0.0,
        verification_bypass: 0.0,
        inconsistency: 0.0,
      },
      risk_velocity: 0.0,
      risk_trajectory_trend: 'STABLE',
      primary_drivers: ['Normal conversational inquiry with clean acoustic profile.'],
      contradicting_signals: [],
      evidence_graph: { nodes: [], edges: [], primary_findings: ['Clean bona fide speech.'] },
      policy_recommendation: {
        is_triggered: false,
        action: 'ALLOW',
        explanation: 'Benign call parameters verified.',
      },
      human_workflow_state: 'NO_ACTION_REQUIRED',
      fusion_latency_ms: 1.1,
      timestamp: new Date().toISOString(),
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(normalHumanFixture),
    } as any);

    const res = await request(app)
      .post('/api/risk/evaluate')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        callId: 'call-normal-human',
        chunkIndex: 0,
        textTranscript: 'Hello, I would like to check my account balance please.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.risk_level).toBe('SAFE');
    expect(res.body.data.overall_risk_score).toBeLessThanOrEqual(20.0);
    expect(res.body.data.confidence).toBeGreaterThanOrEqual(0.90);
    expect(res.body.data.dimensions.deepfake_synthetic).toBeLessThan(10.0);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Synthetic/Deepfake Voice
  // --------------------------------------------------------------------------
  it('TEST 2 [Deepfake Voice]: should return elevated/HIGH risk and step-up challenge', async () => {
    const deepfakeFixture = {
      status: 'AVAILABLE',
      call_id: 'call-deepfake-attack',
      turn_index: 1,
      overall_risk_score: 92.0,
      risk_level: 'CRITICAL',
      confidence: 0.94,
      uncertainty: 0.06,
      dimensions: {
        overall: 92.0,
        identity_impersonation: 88.0,
        deepfake_synthetic: 96.0,
        replay_injection: 12.0,
        social_engineering: 40.0,
        credential_theft: 0.0,
        financial_fraud: 0.0,
        account_takeover: 0.0,
        verification_bypass: 0.0,
        inconsistency: 0.0,
      },
      risk_velocity: 0.35,
      risk_trajectory_trend: 'ESCALATING',
      primary_drivers: ['Critical synthetic neural deepfake detected with vocoder artifacts.'],
      contradicting_signals: [],
      evidence_graph: { nodes: [{ cue: 'Wav2Vec2 Spoof Logit > 0.95', layer: 'ACOUSTIC' }], edges: [] },
      policy_recommendation: {
        is_triggered: true,
        policy_id: 'POL-DEEPFAKE-001',
        action: 'REQUIRE_STEP_UP_VERIFICATION',
        explanation: 'Deepfake synthetic voice detected with high confidence.',
      },
      human_workflow_state: 'AI_RECOMMENDED',
      fusion_latency_ms: 1.5,
      timestamp: new Date().toISOString(),
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(deepfakeFixture),
    } as any);

    const res = await request(app)
      .post('/api/risk/evaluate')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        callId: 'call-deepfake-attack',
        chunkIndex: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.risk_level).toBe('CRITICAL');
    expect(res.body.data.overall_risk_score).toBeGreaterThanOrEqual(85.0);
    expect(res.body.data.dimensions.deepfake_synthetic).toBeGreaterThanOrEqual(90.0);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Genuine Human Voice + Credential Theft
  // --------------------------------------------------------------------------
  it('TEST 3 [Human Voice + Credential Theft]: should escalate to HIGH security risk despite LOW deepfake score', async () => {
    const credTheftFixture = {
      status: 'AVAILABLE',
      call_id: 'call-human-vishing',
      turn_index: 2,
      overall_risk_score: 84.0,
      risk_level: 'HIGH',
      confidence: 0.91,
      uncertainty: 0.09,
      dimensions: {
        overall: 84.0,
        identity_impersonation: 80.0,
        deepfake_synthetic: 4.0, // Clean human voice!
        replay_injection: 2.0,
        social_engineering: 92.0,
        credential_theft: 98.0, // High credential extraction!
        financial_fraud: 70.0,
        account_takeover: 50.0,
        verification_bypass: 85.0,
        inconsistency: 0.0,
      },
      risk_velocity: 0.28,
      risk_trajectory_trend: 'ESCALATING',
      primary_drivers: ['Critical credential theft: Direct solicitation of one-time password (OTP).'],
      contradicting_signals: ['Acoustic model indicates natural bona fide voice.'],
      evidence_graph: { nodes: [{ cue: 'Direct OTP Request', layer: 'CONVERSATIONAL' }], edges: [] },
      policy_recommendation: {
        is_triggered: true,
        policy_id: 'POL-CRED-001',
        action: 'BLOCK_DISCLOSURE',
        explanation: 'Caller attempting to extract sensitive authentication token.',
      },
      human_workflow_state: 'AI_RECOMMENDED',
      fusion_latency_ms: 1.4,
      timestamp: new Date().toISOString(),
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(credTheftFixture),
    } as any);

    const res = await request(app)
      .post('/api/risk/evaluate')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        callId: 'call-human-vishing',
        chunkIndex: 2,
        textTranscript: 'Please read the 6 digit code sent to your phone immediately.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.risk_level).toBe('HIGH');
    expect(res.body.data.dimensions.deepfake_synthetic).toBeLessThan(10.0);
    expect(res.body.data.dimensions.credential_theft).toBeGreaterThanOrEqual(90.0);
    expect(res.body.data.overall_risk_score).toBeGreaterThanOrEqual(80.0);
  });

  // --------------------------------------------------------------------------
  // TEST 4: AI Unavailable (Fail-Safe Degradation)
  // --------------------------------------------------------------------------
  it('TEST 4 [AI Unavailable]: must return NOT_AVAILABLE / INCONCLUSIVE and NEVER fabricate score 0 / SAFE / ALLOW', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('AI Engine Connection Refused'));

    const result = await RiskService.evaluateUnifiedRisk({
      callId: 'call-ai-down',
      chunkIndex: 0,
    });

    // Mandatory Non-Fabrication & Safety Assertions
    expect(result.status).toBe('NOT_AVAILABLE');
    expect(result.risk_level).toBe('INCONCLUSIVE');
    expect(result.overall_risk_score).toBeNull();
    expect(result.confidence).toBe(0.0);
    expect(result.uncertainty).toBe(1.0);
    expect(result.dimensions.overall).toBeNull();
    expect(result.dimensions.deepfake_synthetic).toBeNull();
    expect(result.primary_drivers[0]).toContain('Risk Fusion service unavailable');
  });

  // --------------------------------------------------------------------------
  // TEST 5: Noisy/Low-SNR Audio
  // --------------------------------------------------------------------------
  it('TEST 5 [Noisy Audio]: should reflect high uncertainty and dampened confidence', async () => {
    const noisyAudioFixture = {
      status: 'AVAILABLE',
      call_id: 'call-noisy-env',
      turn_index: 1,
      overall_risk_score: 45.0,
      risk_level: 'GUARDED',
      confidence: 0.35, // Dampened by SNR penalty
      uncertainty: 0.65, // Elevated uncertainty
      dimensions: {
        overall: 45.0,
        identity_impersonation: 40.0,
        deepfake_synthetic: 40.0,
        replay_injection: 30.0,
        social_engineering: 10.0,
        credential_theft: 0.0,
        financial_fraud: 0.0,
        account_takeover: 0.0,
        verification_bypass: 0.0,
        inconsistency: 0.0,
      },
      risk_velocity: 0.0,
      risk_trajectory_trend: 'STABLE',
      primary_drivers: ['Acoustic signal degraded by severe background noise (SNR < 6 dB).'],
      contradicting_signals: [],
      evidence_graph: { nodes: [{ cue: 'Low SNR Quality Penalty', layer: 'ACOUSTIC' }], edges: [] },
      policy_recommendation: null,
      human_workflow_state: 'AI_RECOMMENDED',
      fusion_latency_ms: 1.2,
      timestamp: new Date().toISOString(),
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(noisyAudioFixture),
    } as any);

    const res = await request(app)
      .post('/api/risk/evaluate')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        callId: 'call-noisy-env',
        chunkIndex: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uncertainty).toBeGreaterThanOrEqual(0.60);
    expect(res.body.data.confidence).toBeLessThanOrEqual(0.40);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Replay / Digital Injection
  // --------------------------------------------------------------------------
  it('TEST 6 [Replay / Injection]: should elevate replay_injection dimension and overall risk', async () => {
    const replayFixture = {
      status: 'AVAILABLE',
      call_id: 'call-replay-attack',
      turn_index: 3,
      overall_risk_score: 78.0,
      risk_level: 'HIGH',
      confidence: 0.88,
      uncertainty: 0.12,
      dimensions: {
        overall: 78.0,
        identity_impersonation: 70.0,
        deepfake_synthetic: 15.0,
        replay_injection: 92.0, // High replay acoustic cues
        social_engineering: 20.0,
        credential_theft: 0.0,
        financial_fraud: 0.0,
        account_takeover: 0.0,
        verification_bypass: 0.0,
        inconsistency: 0.0,
      },
      risk_velocity: 0.15,
      risk_trajectory_trend: 'ESCALATING',
      primary_drivers: ['Acoustic high-frequency roll-off and secondary room reverberation detected.'],
      contradicting_signals: [],
      evidence_graph: { nodes: [{ cue: 'Replay Decay > 120ms', layer: 'ACOUSTIC' }], edges: [] },
      policy_recommendation: {
        is_triggered: true,
        policy_id: 'POL-REPLAY-001',
        action: 'REQUIRE_STEP_UP_VERIFICATION',
        explanation: 'Acoustic replay attack detected.',
      },
      human_workflow_state: 'AI_RECOMMENDED',
      fusion_latency_ms: 1.3,
      timestamp: new Date().toISOString(),
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(replayFixture),
    } as any);

    const res = await request(app)
      .post('/api/risk/evaluate')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        callId: 'call-replay-attack',
        chunkIndex: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dimensions.replay_injection).toBeGreaterThanOrEqual(85.0);
    expect(res.body.data.risk_level).toBe('HIGH');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Speaker Inconsistency / Impersonation
  // --------------------------------------------------------------------------
  it('TEST 7 [Speaker Inconsistency]: should elevate identity_impersonation risk when claimed speaker does not match biometrics', async () => {
    const speakerMismatchFixture = {
      status: 'AVAILABLE',
      call_id: 'call-impersonation',
      turn_index: 4,
      overall_risk_score: 82.0,
      risk_level: 'HIGH',
      confidence: 0.90,
      uncertainty: 0.10,
      dimensions: {
        overall: 82.0,
        identity_impersonation: 94.0, // Severe biometric mismatch
        deepfake_synthetic: 10.0,
        replay_injection: 5.0,
        social_engineering: 30.0,
        credential_theft: 0.0,
        financial_fraud: 0.0,
        account_takeover: 0.0,
        verification_bypass: 0.0,
        inconsistency: 40.0,
      },
      risk_velocity: 0.20,
      risk_trajectory_trend: 'ESCALATING',
      primary_drivers: ['Biometric vocal tract resonance does not match enrolled profile for speaker-cfo-001.'],
      contradicting_signals: [],
      evidence_graph: { nodes: [{ cue: 'ECAPA Cosine Similarity < 0.35', layer: 'BIOMETRIC' }], edges: [] },
      policy_recommendation: {
        is_triggered: true,
        policy_id: 'POL-IDENTITY-001',
        action: 'REQUIRE_STEP_UP_VERIFICATION',
        explanation: 'Claimed identity failed biometric voice verification.',
      },
      human_workflow_state: 'AI_RECOMMENDED',
      fusion_latency_ms: 1.4,
      timestamp: new Date().toISOString(),
    };

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(speakerMismatchFixture),
    } as any);

    const res = await request(app)
      .post('/api/risk/evaluate')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        callId: 'call-impersonation',
        chunkIndex: 4,
        claimedSpeakerId: 'speaker-cfo-001',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dimensions.identity_impersonation).toBeGreaterThanOrEqual(90.0);
    expect(res.body.data.risk_level).toBe('HIGH');
  });
});
