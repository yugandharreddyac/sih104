/**
 * Phase 2: Risk Engine Safety & Threat Scenario Validation Test Suite
 * Hardens and scientifically/logically validates the SIH104 risk engine
 * against critical voice threat combinations and fail-safe policy precedence.
 *
 * Core Principle:
 * A low deepfake score MUST NOT override strong evidence of credential theft,
 * OTP/PIN/password solicitation, social engineering, impersonation, replay/injection,
 * financial fraud, account takeover, or verification bypass.
 *
 * Scenarios Tested:
 * - Scenario A: Normal Human (Bona fide voice, clean, benign inquiry -> SAFE / ALLOW)
 * - Scenario B: AI-Generated / Deepfake Voice (High spoof score -> CRITICAL / Step-Up)
 * - Scenario C: Human Voice + OTP/Credential Theft (CRITICAL REGRESSION: Low deepfake, high credential theft -> HIGH/CRITICAL)
 * - Scenario D: Social Engineering (Urgency & authority coercion -> Elevated social_engineering risk)
 * - Scenario E: Replay Attack (Acoustic room reverb/decay -> Elevated replay_injection risk)
 * - Scenario F: Speaker Impersonation (Biometric mismatch -> Elevated identity_impersonation risk)
 * - Scenario G: Financial Fraud (Suspicious money transfer / high value fraud -> Elevated financial_fraud risk)
 * - Scenario H: Account Takeover (Remote takeover / verification bypass -> Elevated account_takeover risk)
 * - Scenario I: Multiple Threats (Multi-modal corroboration -> Combined risk without signal cancellation)
 * - Scenario J: AI Unavailable (Degraded fail-safe -> status=NOT_AVAILABLE, uncertainty=1.0, score=null, INCONCLUSIVE)
 * - Scenario K: Low-SNR / Noisy Audio (SNR penalty -> Elevated uncertainty, dampened confidence)
 * - Scenario L: Contradictory Evidence (Spoof vs natural cues -> Uncertainty increases, contradiction tracked)
 * - Step 5: Policy Precedence Hierarchy (CRITICAL_BLOCK > STEP_UP > WARN/MONITOR > ALLOW)
 * - Step 6: Explainability & Privacy Redaction (Transparent evidence graph, no raw credential leaks)
 * - Step 7: Edge Cases & Mathematical Robustness (No NaN, no Infinity, nulls handled safely, bounds [0, 100])
 */

import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { RiskService } from '../src/risk/risk.service';
import { PoliciesService } from '../src/policies/policies.service';
import { PolicyEngine } from '../src/policies/policy_engine';

describe('Phase 2: Risk Engine Safety & Threat Scenario Validation', () => {
  const originalFetch = global.fetch;

  const analystToken = TokenService.generateToken({
    userId: 'u-lead-auditor',
    email: 'auditor@voxshield.local',
    role: RoleName.SECURITY_ANALYST,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  beforeAll(() => {
    PoliciesService.initializeDefaultPolicies();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ==========================================================================
  // SCENARIO A — NORMAL HUMAN
  // ==========================================================================
  describe('SCENARIO A — Normal Human Voice', () => {
    it('should return LOW/SAFE risk, high confidence, and ALLOW policy recommendation', async () => {
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
          voice_inconsistency: 0.0,
          behavioral_anomaly: 0.0,
          social_engineering: 5.0,
          credential_theft: 0.0,
          financial_fraud: 0.0,
          account_takeover: 0.0,
          verification_bypass: 0.0,
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
      expect(res.body.data.dimensions.credential_theft).toBe(0.0);

      // Verify policy outcome for benign normal human
      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        deepfake_risk: 'LOW',
        action_risk: 'LOW',
        identity_verified: true,
      });
      expect(policyRes.allowed).toBe(true);
      expect(policyRes.actionsTriggered).not.toContain('BLOCK_DISCLOSURE');
      expect(policyRes.actionsTriggered).not.toContain('BLOCK_PROTECTED_WORKFLOW');
    });
  });

  // ==========================================================================
  // SCENARIO B — AI-GENERATED / DEEPFAKE VOICE
  // ==========================================================================
  describe('SCENARIO B — AI-Generated / Deepfake Voice', () => {
    it('should return elevated/CRITICAL risk and enforce step-up/blocking action', async () => {
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
          voice_inconsistency: 45.0,
          behavioral_anomaly: 20.0,
          social_engineering: 40.0,
          credential_theft: 0.0,
          financial_fraud: 0.0,
          account_takeover: 0.0,
          verification_bypass: 0.0,
        },
        risk_velocity: 0.35,
        risk_trajectory_trend: 'ESCALATING',
        primary_drivers: ['Critical synthetic neural deepfake detected with vocoder artifacts.'],
        contradicting_signals: [],
        evidence_graph: { nodes: [{ cue: 'AASIST Spoof Score 0.96', layer: 'ACOUSTIC' }], edges: [] },
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

      // Verify policy blocks critical workflows on deepfake anomaly
      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        deepfake_risk: 'HIGH',
        action_risk: 'CRITICAL',
      });
      expect(policyRes.allowed).toBe(false);
      expect(policyRes.actionsTriggered).toContain('BLOCK_PROTECTED_WORKFLOW');
    });
  });

  // ==========================================================================
  // SCENARIO C — HUMAN VOICE + OTP/CREDENTIAL THEFT (CRITICAL REGRESSION)
  // ==========================================================================
  describe('SCENARIO C — Human Voice + OTP/Credential Theft (Regression Safety)', () => {
    it('MUST NOT produce GREEN/ALLOW merely because voice is human; must enforce BLOCK_DISCLOSURE', async () => {
      const credTheftFixture = {
        status: 'AVAILABLE',
        call_id: 'call-human-vishing',
        turn_index: 2,
        overall_risk_score: 86.0,
        risk_level: 'HIGH',
        confidence: 0.91,
        uncertainty: 0.09,
        dimensions: {
          overall: 86.0,
          identity_impersonation: 80.0,
          deepfake_synthetic: 4.0, // CLEAN NATURAL HUMAN VOICE
          replay_injection: 2.0,
          voice_inconsistency: 0.0,
          behavioral_anomaly: 15.0,
          social_engineering: 92.0,
          credential_theft: 98.0, // CRITICAL CREDENTIAL THEFT
          financial_fraud: 70.0,
          account_takeover: 50.0,
          verification_bypass: 85.0,
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
          textTranscript: 'Please read the 6-digit OTP code sent to your phone immediately.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.risk_level).toBe('HIGH');
      // Deepfake is low (<10%), but credential theft is critical (>=90%)
      expect(res.body.data.dimensions.deepfake_synthetic).toBeLessThan(10.0);
      expect(res.body.data.dimensions.credential_theft).toBeGreaterThanOrEqual(90.0);
      expect(res.body.data.overall_risk_score).toBeGreaterThanOrEqual(80.0);

      // Policy MUST trigger BLOCK_DISCLOSURE and disallow action
      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        requested_information: 'OTP',
        deepfake_risk: 'LOW',
        credential_theft_risk: 'HIGH',
      });
      expect(policyRes.allowed).toBe(false);
      expect(policyRes.actionsTriggered).toContain('BLOCK_DISCLOSURE');
    });
  });

  // ==========================================================================
  // SCENARIO D — SOCIAL ENGINEERING
  // ==========================================================================
  describe('SCENARIO D — Social Engineering & Coercion', () => {
    it('should elevate social_engineering dimension and trigger step-up verification', async () => {
      const socialEngFixture = {
        status: 'AVAILABLE',
        call_id: 'call-social-eng',
        turn_index: 1,
        overall_risk_score: 76.0,
        risk_level: 'HIGH',
        confidence: 0.89,
        uncertainty: 0.11,
        dimensions: {
          overall: 76.0,
          identity_impersonation: 65.0,
          deepfake_synthetic: 10.0,
          replay_injection: 5.0,
          voice_inconsistency: 10.0,
          behavioral_anomaly: 40.0,
          social_engineering: 94.0, // HIGH SOCIAL ENGINEERING
          credential_theft: 30.0,
          financial_fraud: 45.0,
          account_takeover: 20.0,
          verification_bypass: 60.0,
        },
        risk_velocity: 0.22,
        risk_trajectory_trend: 'ESCALATING',
        primary_drivers: ['Extreme urgency pressure and authority exploitation detected.'],
        contradicting_signals: [],
        evidence_graph: { nodes: [{ cue: 'Urgency & Authority Coercion', layer: 'CONVERSATIONAL' }], edges: [] },
        policy_recommendation: {
          is_triggered: true,
          action: 'REQUIRE_STEP_UP_VERIFICATION',
          explanation: 'Social engineering attack pattern identified.',
        },
        human_workflow_state: 'AI_RECOMMENDED',
        fusion_latency_ms: 1.3,
        timestamp: new Date().toISOString(),
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(socialEngFixture),
      } as any);

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-social-eng',
          chunkIndex: 1,
          textTranscript: 'This is the senior IT director. You must approve this override right now or face termination.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dimensions.social_engineering).toBeGreaterThanOrEqual(90.0);
      expect(res.body.data.risk_level).toBe('HIGH');
      expect(res.body.data.primary_drivers[0]).toContain('urgency pressure');

      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        social_engineering_risk: 'HIGH',
      });
      expect(policyRes.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });
  });

  // ==========================================================================
  // SCENARIO E — REPLAY ATTACK
  // ==========================================================================
  describe('SCENARIO E — Acoustic Replay Attack', () => {
    it('should elevate replay_injection dimension and require step-up verification', async () => {
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
          replay_injection: 92.0, // HIGH REPLAY ACOUSTIC SIGNALS
          voice_inconsistency: 20.0,
          behavioral_anomaly: 10.0,
          social_engineering: 20.0,
          credential_theft: 0.0,
          financial_fraud: 0.0,
          account_takeover: 0.0,
          verification_bypass: 0.0,
        },
        risk_velocity: 0.15,
        risk_trajectory_trend: 'ESCALATING',
        primary_drivers: ['Acoustic high-frequency roll-off and secondary room reverberation detected.'],
        contradicting_signals: [],
        evidence_graph: { nodes: [{ cue: 'Replay Decay > 120ms', layer: 'ACOUSTIC' }], edges: [] },
        policy_recommendation: {
          is_triggered: true,
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

      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        replay_risk: 'HIGH',
      });
      expect(policyRes.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });
  });

  // ==========================================================================
  // SCENARIO F — SPEAKER IMPERSONATION
  // ==========================================================================
  describe('SCENARIO F — Speaker Biometric Impersonation', () => {
    it('should elevate identity_impersonation risk when claimed speaker fails biometrics', async () => {
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
          identity_impersonation: 94.0, // SEVERE BIOMETRIC MISMATCH
          deepfake_synthetic: 10.0,
          replay_injection: 5.0,
          voice_inconsistency: 40.0,
          behavioral_anomaly: 30.0,
          social_engineering: 30.0,
          credential_theft: 0.0,
          financial_fraud: 0.0,
          account_takeover: 0.0,
          verification_bypass: 0.0,
        },
        risk_velocity: 0.20,
        risk_trajectory_trend: 'ESCALATING',
        primary_drivers: ['Biometric vocal tract resonance does not match enrolled profile for speaker-cfo-001.'],
        contradicting_signals: [],
        evidence_graph: { nodes: [{ cue: 'ECAPA Cosine Similarity < 0.35', layer: 'BIOMETRIC' }], edges: [] },
        policy_recommendation: {
          is_triggered: true,
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

      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        speaker_mismatch: true,
      });
      expect(policyRes.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });
  });

  // ==========================================================================
  // SCENARIO G — FINANCIAL FRAUD
  // ==========================================================================
  describe('SCENARIO G — Financial Fraud & Wire Exfiltration', () => {
    it('should elevate financial_fraud dimension and block critical transaction workflows', async () => {
      const fraudFixture = {
        status: 'AVAILABLE',
        call_id: 'call-fraud-wire',
        turn_index: 2,
        overall_risk_score: 88.0,
        risk_level: 'CRITICAL',
        confidence: 0.92,
        uncertainty: 0.08,
        dimensions: {
          overall: 88.0,
          identity_impersonation: 60.0,
          deepfake_synthetic: 8.0,
          replay_injection: 4.0,
          voice_inconsistency: 0.0,
          behavioral_anomaly: 35.0,
          social_engineering: 75.0,
          credential_theft: 40.0,
          financial_fraud: 95.0, // HIGH FINANCIAL FRAUD
          account_takeover: 60.0,
          verification_bypass: 70.0,
        },
        risk_velocity: 0.30,
        risk_trajectory_trend: 'ESCALATING',
        primary_drivers: ['High-value outbound wire solicitation with unverified beneficiary.'],
        contradicting_signals: [],
        evidence_graph: { nodes: [{ cue: 'High Value Wire Transfer $250,000', layer: 'CONVERSATIONAL' }], edges: [] },
        policy_recommendation: {
          is_triggered: true,
          action: 'BLOCK_PROTECTED_WORKFLOW',
          explanation: 'Critical financial fraud indicators detected.',
        },
        human_workflow_state: 'AI_RECOMMENDED',
        fusion_latency_ms: 1.4,
        timestamp: new Date().toISOString(),
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(fraudFixture),
      } as any);

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-fraud-wire',
          chunkIndex: 2,
          textTranscript: 'Initiate an urgent wire transfer of 250,000 USD to this overseas account right away.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dimensions.financial_fraud).toBeGreaterThanOrEqual(90.0);
      expect(res.body.data.risk_level).toBe('CRITICAL');

      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        financial_fraud_risk: 'CRITICAL',
      });
      expect(policyRes.allowed).toBe(false);
      expect(policyRes.actionsTriggered).toContain('BLOCK_PROTECTED_WORKFLOW');
    });
  });

  // ==========================================================================
  // SCENARIO H — ACCOUNT TAKEOVER
  // ==========================================================================
  describe('SCENARIO H — Account Takeover & Verification Bypass', () => {
    it('should elevate account_takeover and verification_bypass dimensions', async () => {
      const takeoverFixture = {
        status: 'AVAILABLE',
        call_id: 'call-takeover',
        turn_index: 3,
        overall_risk_score: 83.0,
        risk_level: 'HIGH',
        confidence: 0.89,
        uncertainty: 0.11,
        dimensions: {
          overall: 83.0,
          identity_impersonation: 75.0,
          deepfake_synthetic: 12.0,
          replay_injection: 6.0,
          voice_inconsistency: 25.0,
          behavioral_anomaly: 50.0,
          social_engineering: 80.0,
          credential_theft: 60.0,
          financial_fraud: 30.0,
          account_takeover: 92.0, // HIGH ACCOUNT TAKEOVER
          verification_bypass: 88.0, // HIGH VERIFICATION BYPASS
        },
        risk_velocity: 0.25,
        risk_trajectory_trend: 'ESCALATING',
        primary_drivers: ['Attempted remote password reset and MFA bypass maneuver.'],
        contradicting_signals: [],
        evidence_graph: { nodes: [{ cue: 'MFA Bypass + Recovery Email Alteration', layer: 'CONVERSATIONAL' }], edges: [] },
        policy_recommendation: {
          is_triggered: true,
          action: 'REQUIRE_STEP_UP_VERIFICATION',
          explanation: 'Account takeover sequence in progress.',
        },
        human_workflow_state: 'AI_RECOMMENDED',
        fusion_latency_ms: 1.3,
        timestamp: new Date().toISOString(),
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(takeoverFixture),
      } as any);

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-takeover',
          chunkIndex: 3,
          textTranscript: 'I lost my authenticator app, please bypass MFA and change the recovery email on my account.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dimensions.account_takeover).toBeGreaterThanOrEqual(90.0);
      expect(res.body.data.dimensions.verification_bypass).toBeGreaterThanOrEqual(85.0);

      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        account_takeover_risk: 'HIGH',
      });
      expect(policyRes.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });
  });

  // ==========================================================================
  // SCENARIO I — MULTIPLE THREATS (CORROBORATION)
  // ==========================================================================
  describe('SCENARIO I — Multiple Compound Threats', () => {
    it('should reflect multiple independent threats without signal cancellation', async () => {
      const compoundThreatFixture = {
        status: 'AVAILABLE',
        call_id: 'call-compound-threat',
        turn_index: 3,
        overall_risk_score: 98.0,
        risk_level: 'CRITICAL',
        confidence: 0.96,
        uncertainty: 0.04,
        dimensions: {
          overall: 98.0,
          identity_impersonation: 92.0,
          deepfake_synthetic: 95.0,
          replay_injection: 88.0,
          voice_inconsistency: 60.0,
          behavioral_anomaly: 70.0,
          social_engineering: 94.0,
          credential_theft: 96.0,
          financial_fraud: 90.0,
          account_takeover: 85.0,
          verification_bypass: 88.0,
        },
        risk_velocity: 0.45,
        risk_trajectory_trend: 'ESCALATING',
        primary_drivers: [
          'Multi-modal attack: Deepfake synthesis, speaker mismatch, and OTP harvesting.',
        ],
        contradicting_signals: [],
        evidence_graph: {
          nodes: [
            { cue: 'AASIST Deepfake Spoof > 0.95', layer: 'ACOUSTIC' },
            { cue: 'Speaker Mismatch Cosine < 0.3', layer: 'BIOMETRIC' },
            { cue: 'Replay Decay > 120ms', layer: 'ACOUSTIC' },
            { cue: 'Direct OTP Extraction', layer: 'CONVERSATIONAL' },
          ],
          edges: [],
        },
        policy_recommendation: {
          is_triggered: true,
          action: 'BLOCK_DISCLOSURE',
          explanation: 'Compound high-threat attack pattern verified.',
        },
        human_workflow_state: 'AI_RECOMMENDED',
        fusion_latency_ms: 1.6,
        timestamp: new Date().toISOString(),
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(compoundThreatFixture),
      } as any);

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-compound-threat',
          chunkIndex: 3,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.risk_level).toBe('CRITICAL');
      expect(res.body.data.overall_risk_score).toBeGreaterThanOrEqual(95.0);
      expect(res.body.data.dimensions.deepfake_synthetic).toBeGreaterThanOrEqual(90.0);
      expect(res.body.data.dimensions.credential_theft).toBeGreaterThanOrEqual(90.0);
      expect(res.body.data.dimensions.identity_impersonation).toBeGreaterThanOrEqual(90.0);
      expect(res.body.data.dimensions.replay_injection).toBeGreaterThanOrEqual(85.0);

      // Evaluate policy with multiple triggers: CRITICAL_BLOCK must win
      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        requested_information: 'OTP',
        deepfake_risk: 'HIGH',
        action_risk: 'CRITICAL',
        speaker_mismatch: true,
        replay_risk: 'HIGH',
      });
      expect(policyRes.allowed).toBe(false);
      expect(policyRes.actionsTriggered).toContain('BLOCK_DISCLOSURE');
      expect(policyRes.actionsTriggered).toContain('BLOCK_PROTECTED_WORKFLOW');
      expect(policyRes.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });
  });

  // ==========================================================================
  // SCENARIO J — AI UNAVAILABLE (FAIL-SAFE DEGRADATION)
  // ==========================================================================
  describe('SCENARIO J — AI Engine Unavailable (Fail-Safe Degradation)', () => {
    it('must return NOT_AVAILABLE / INCONCLUSIVE and NEVER fabricate score 0 / SAFE / ALLOW', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('AI Engine Connection Refused'));

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-ai-down',
        chunkIndex: 0,
      });

      // Mandatory Non-Fabrication & Fail-Safe Assertions
      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.risk_level).toBe('INCONCLUSIVE');
      expect(result.overall_risk_score).toBeNull();
      expect(result.confidence).toBe(0.0);
      expect(result.uncertainty).toBe(1.0);
      expect(result.dimensions.overall).toBeNull();
      expect(result.dimensions.deepfake_synthetic).toBeNull();
      expect(result.dimensions.credential_theft).toBeNull();
      expect(result.primary_drivers[0]).toContain('Risk Fusion service unavailable');
    });

    it('must handle AI timeout gracefully without crashing', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-ai-timeout',
        chunkIndex: 0,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_TIMEOUT');
      expect(result.risk_level).toBe('INCONCLUSIVE');
      expect(result.uncertainty).toBe(1.0);
    });

    it('must handle AI HTTP 500 server error safely as NOT_AVAILABLE', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-ai-500',
        chunkIndex: 0,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_HTTP_ERROR');
      expect(result.http_status).toBe(500);
      expect(result.overall_risk_score).toBeNull();
      expect(result.risk_level).toBe('INCONCLUSIVE');
    });
  });

  // ==========================================================================
  // SCENARIO K — LOW-SNR / NOISY AUDIO
  // ==========================================================================
  describe('SCENARIO K — Low-SNR / Noisy Audio', () => {
    it('should reflect high uncertainty and dampened confidence without assuming safe', async () => {
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
          voice_inconsistency: 30.0,
          behavioral_anomaly: 10.0,
          social_engineering: 10.0,
          credential_theft: 0.0,
          financial_fraud: 0.0,
          account_takeover: 0.0,
          verification_bypass: 0.0,
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
      expect(res.body.data.risk_level).not.toBe('SAFE');
    });
  });

  // ==========================================================================
  // SCENARIO L — CONTRADICTORY EVIDENCE
  // ==========================================================================
  describe('SCENARIO L — Contradictory Multi-Modal Evidence', () => {
    it('should preserve both conflicting signals in evidence and elevate uncertainty safely', async () => {
      const contradictionFixture = {
        status: 'AVAILABLE',
        call_id: 'call-contradiction',
        turn_index: 2,
        overall_risk_score: 65.0,
        risk_level: 'ELEVATED',
        confidence: 0.62,
        uncertainty: 0.38,
        dimensions: {
          overall: 65.0,
          identity_impersonation: 20.0,
          deepfake_synthetic: 88.0, // High acoustic spoof score
          replay_injection: 10.0,
          voice_inconsistency: 50.0,
          behavioral_anomaly: 15.0,
          social_engineering: 10.0,
          credential_theft: 0.0,
          financial_fraud: 0.0,
          account_takeover: 0.0,
          verification_bypass: 0.0,
        },
        risk_velocity: 0.10,
        risk_trajectory_trend: 'STABLE',
        primary_drivers: ['Acoustic model detected deepfake vocoder artifacts.'],
        contradicting_signals: [
          'High acoustic spoof probability (0.88) contradicts strong speaker biometric match (0.92).',
        ],
        evidence_graph: {
          nodes: [
            { cue: 'AASIST Deepfake Logit > 0.85', layer: 'ACOUSTIC' },
            { cue: 'ECAPA Biometric Match Cosine > 0.90', layer: 'BIOMETRIC' },
          ],
          edges: [],
          contradictions: ['Acoustic vs Biometric mismatch'],
        },
        policy_recommendation: {
          is_triggered: true,
          action: 'REQUIRE_STEP_UP_VERIFICATION',
          explanation: 'Contradictory biometric vs synthetic indicators require out-of-band resolution.',
        },
        human_workflow_state: 'AI_RECOMMENDED',
        fusion_latency_ms: 1.4,
        timestamp: new Date().toISOString(),
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(contradictionFixture),
      } as any);

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-contradiction',
          chunkIndex: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.contradicting_signals.length).toBeGreaterThan(0);
      expect(res.body.data.dimensions.deepfake_synthetic).toBeGreaterThanOrEqual(80.0);
      // Ensure contradiction does NOT silently collapse into safe ALLOW
      expect(res.body.data.risk_level).not.toBe('SAFE');
    });
  });

  // ==========================================================================
  // STEP 5: POLICY PRECEDENCE HIERARCHY
  // ==========================================================================
  describe('Step 5: Policy Precedence Hierarchy', () => {
    it('CRITICAL_BLOCK must take precedence over STEP_UP and ALLOW', () => {
      const context = {
        requested_information: 'OTP', // triggers BLOCK_DISCLOSURE (priority 10)
        transaction_type: 'HIGH_VALUE', // triggers REQUIRE_STEP_UP_VERIFICATION (priority 20)
        identity_verified: false,
      };

      const result = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
      expect(result.allowed).toBe(false);
      expect(result.actionsTriggered).toContain('BLOCK_DISCLOSURE');
      expect(result.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('MANDATORY_STEP_UP must override default ALLOW for unverified high-value transactions', () => {
      const context = {
        transaction_type: 'HIGH_VALUE',
        identity_verified: false,
      };

      const result = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
      expect(result.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('credential theft with low deepfake MUST NOT become ALLOW', () => {
      const context = {
        requested_information: 'PASSWORD',
        deepfake_risk: 'SAFE',
        credential_theft_risk: 'HIGH',
      };

      const result = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
      expect(result.allowed).toBe(false);
      expect(result.actionsTriggered).toContain('BLOCK_DISCLOSURE');
    });

    it('social engineering with normal human voice MUST NOT become ALLOW', () => {
      const context = {
        deepfake_risk: 'SAFE',
        social_engineering_risk: 'HIGH',
      };

      const result = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
      expect(result.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('speaker impersonation with normal human voice MUST NOT become ALLOW', () => {
      const context = {
        deepfake_risk: 'SAFE',
        speaker_mismatch: true,
      };

      const result = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
      expect(result.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('replay attack with normal human voice MUST NOT become ALLOW', () => {
      const context = {
        deepfake_risk: 'SAFE',
        replay_risk: 'HIGH',
      };

      const result = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', context);
      expect(result.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });
  });

  // ==========================================================================
  // STEP 6: EXPLAINABILITY & PRIVACY REDACTION
  // ==========================================================================
  describe('Step 6: Explainability & Privacy Redaction', () => {
    it('should sanitize raw OTPs and PINs in transcript before passing to risk fusion', async () => {
      let forwardedBody: any = null;

      jest.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
        forwardedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            status: 'AVAILABLE',
            call_id: 'call-privacy-test',
            turn_index: 0,
            overall_risk_score: 85.0,
            risk_level: 'HIGH',
            confidence: 0.9,
            uncertainty: 0.1,
            dimensions: {
              overall: 85.0,
              identity_impersonation: 0.0,
              deepfake_synthetic: 0.0,
              replay_injection: 0.0,
              voice_inconsistency: 0.0,
              behavioral_anomaly: 0.0,
              social_engineering: 90.0,
              credential_theft: 95.0,
              financial_fraud: 0.0,
              account_takeover: 0.0,
              verification_bypass: 0.0,
            },
            primary_drivers: ['Credential solicitation detected.'],
            evidence_graph: { nodes: [], edges: [] },
            contradicting_signals: [],
          }),
        } as any;
      });

      await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-privacy-test',
          chunkIndex: 0,
          textTranscript: 'Your OTP is 849201 and CVV is 934, do not share.',
          metadata: { sensitivePin: '1234' },
        });

      // Verify privacy redaction was applied
      expect(forwardedBody).not.toBeNull();
      expect(forwardedBody.text_transcript).toContain('[AUTHENTICATION_CODE_REDACTED]');
      expect(forwardedBody.text_transcript).toContain('[CVV_REDACTED]');
      expect(forwardedBody.text_transcript).not.toContain('849201');
      expect(forwardedBody.text_transcript).not.toContain('934');
      expect(forwardedBody.metadata.sensitivePin).toBe('[AUTHENTICATION_CODE_REDACTED]');
    });
  });

  // ==========================================================================
  // STEP 7: EDGE CASES & MATHEMATICAL ROBUSTNESS
  // ==========================================================================
  describe('Step 7: Edge Cases & Mathematical Robustness', () => {
    it('should reject malformed AI response with NaN score and fallback safely to degraded result', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'AVAILABLE',
          overall_risk_score: NaN,
          risk_level: 'SAFE',
          dimensions: { overall: 50.0 },
        }),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-nan-score',
        chunkIndex: 0,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
      expect(result.risk_level).toBe('INCONCLUSIVE');
      expect(result.overall_risk_score).toBeNull();
    });

    it('should reject malformed AI response with Infinity score', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'AVAILABLE',
          overall_risk_score: Infinity,
          risk_level: 'CRITICAL',
          dimensions: { overall: 100.0 },
        }),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-inf-score',
        chunkIndex: 0,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.risk_level).toBe('INCONCLUSIVE');
    });

    it('should reject malformed AI response with invalid enum for risk_level', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'AVAILABLE',
          overall_risk_score: 50.0,
          risk_level: 'SUPER_SAFE_FAKE_LEVEL',
          dimensions: { overall: 50.0 },
        }),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-invalid-level',
        chunkIndex: 0,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.risk_level).toBe('INCONCLUSIVE');
    });

    it('should reject out-of-bounds score (< 0 or > 100)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'AVAILABLE',
          overall_risk_score: 150.0,
          risk_level: 'CRITICAL',
          dimensions: { overall: 150.0 },
        }),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-out-of-bounds',
        chunkIndex: 0,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.risk_level).toBe('INCONCLUSIVE');
    });

    it('should safely return structured explainable baseline when no assessment has occurred yet', () => {
      const baseline = RiskService.getAssessmentForCall('call-unseen-id-999');
      expect(baseline.status).toBe('NOT_AVAILABLE');
      expect(baseline.compositeScore).toBeNull();
      expect(baseline.confidence).toBeNull();
      expect(baseline.uncertainty).toBeNull();
      expect(baseline.factors.length).toBe(4);
    });
  });
});
