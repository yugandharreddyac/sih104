/**
 * Phase 4: AI → Backend Signal Contract Validation Test Suite
 *
 * Validates the complete contract between Python AI microservices and the TypeScript backend:
 * - Canonical AI signal normalization & status semantics (AVAILABLE, NOT_AVAILABLE, INCONCLUSIVE, ERROR).
 * - Numerical boundary validation (finiteness, [0, 1] probabilities, [0, 100] scores, rejecting NaN / Infinity / negative / strings).
 * - Deepfake contract (spoof logits, vocoder artifacts, low deepfake non-suppression).
 * - Speaker verification contract (biometric similarity, missing enrollments never interpreted as verified).
 * - Replay detection contract (spectral decay, room impulse probability).
 * - ASR & Conversational Intelligence contract (transcripts, intent cues, social engineering progression).
 * - Schema & Version mismatch resilience (missing fields, unexpected extra keys, invalid enums).
 * - AI failure matrix (timeouts, HTTP 500/503, network drop, malformed JSON).
 * - Contradictory evidence preservation & uncertainty elevation.
 * - Multi-call session/request correlation (5 & 10 concurrent streams).
 * - Pre-persistence PrivacyFirewall credential redaction.
 */

import { AcousticService } from '../src/acoustic/acoustic.service';
import { ConversationService } from '../src/conversation/conversation.service';
import { RiskService } from '../src/risk/risk.service';
import { PoliciesService } from '../src/policies/policies.service';
import { PrivacyFirewall } from '../src/security/privacy_firewall';

describe('Phase 4: AI → Backend Contract Validation', () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    PoliciesService.initializeDefaultPolicies();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // ==========================================================================
  // TASK 2 & 3: CANONICAL STATUS SEMANTICS & NUMERICAL VALIDATION
  // ==========================================================================
  describe('Task 2 & 3: Canonical Status Semantics & Numerical Robustness', () => {
    it('should correctly accept valid normal bounded AI outputs', async () => {
      const validAcousticPayload = {
        deepfake: { status: 'AUTHENTIC', spoof_score: 0.05, confidence: 0.95 },
        speaker: { status: 'MATCH', similarity_score: 0.88, confidence: 0.90, is_enrolled: true },
        replay: { status: 'NOT_REPLAY', replay_probability: 0.04, confidence: 0.92 },
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => validAcousticPayload,
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-valid-num', chunkIndex: 0 });
      expect(res.deepfake.status).toBe('AUTHENTIC');
      expect(res.deepfake.spoof_score).toBe(0.05);
      expect(res.speaker.status).toBe('MATCH');
      expect(res.replay.status).toBe('NOT_REPLAY');
    });

    const malformedNumericCases = [
      { name: 'NaN spoof_score', payload: { deepfake: { status: 'SUSPICIOUS', spoof_score: NaN }, speaker: { status: 'MATCH' }, replay: { status: 'NOT_REPLAY' } } },
      { name: 'Infinity spoof_score', payload: { deepfake: { status: 'SUSPICIOUS', spoof_score: Infinity }, speaker: { status: 'MATCH' }, replay: { status: 'NOT_REPLAY' } } },
      { name: '-Infinity spoof_score', payload: { deepfake: { status: 'SUSPICIOUS', spoof_score: -Infinity }, speaker: { status: 'MATCH' }, replay: { status: 'NOT_REPLAY' } } },
      { name: 'negative spoof_score', payload: { deepfake: { status: 'SUSPICIOUS', spoof_score: -0.5 }, speaker: { status: 'MATCH' }, replay: { status: 'NOT_REPLAY' } } },
      { name: 'out-of-bounds (> 1.0) spoof_score', payload: { deepfake: { status: 'SUSPICIOUS', spoof_score: 1.5 }, speaker: { status: 'MATCH' }, replay: { status: 'NOT_REPLAY' } } },
      { name: 'string spoof_score', payload: { deepfake: { status: 'SUSPICIOUS', spoof_score: '0.99' }, speaker: { status: 'MATCH' }, replay: { status: 'NOT_REPLAY' } } },
      { name: 'NaN speaker similarity', payload: { deepfake: { status: 'AUTHENTIC', spoof_score: 0.1 }, speaker: { status: 'MATCH', similarity_score: NaN }, replay: { status: 'NOT_REPLAY' } } },
      { name: 'out-of-bounds replay probability', payload: { deepfake: { status: 'AUTHENTIC', spoof_score: 0.1 }, speaker: { status: 'MATCH' }, replay: { status: 'REPLAY', replay_probability: 250.0 } } },
    ];

    malformedNumericCases.forEach(({ name, payload }) => {
      it(`should reject ${name} and degrade safely to NOT_AVAILABLE / INCONCLUSIVE`, async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          json: async () => payload,
        } as any);

        const res = await AcousticService.analyze({ callId: 'call-malformed-num', chunkIndex: 0 });
        expect(res.analysis_status).toBe('AI_INVALID_RESPONSE');
        expect(res.overall_assessment).toBe('NOT_AVAILABLE');
        expect(res.deepfake.status).toBe('NOT_AVAILABLE');
        expect(res.deepfake.spoof_score).toBeNull();
        expect(res.deepfake.uncertainty).toBe(1.0);
      });
    });
  });

  // ==========================================================================
  // TASK 4: DEEPFAKE CONTRACT VALIDATION
  // ==========================================================================
  describe('Task 4: Deepfake Detection Contract', () => {
    it('Scenario A [High Spoof]: should report SUSPICIOUS deepfake with high spoof logit', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'SUSPICIOUS', spoof_score: 0.96, confidence: 0.94, model_version: 'deepfake_aasist_spectral_v3', explainability: ['Phase distortion in vocoder sub-bands'] },
          speaker: { status: 'MATCH', similarity_score: 0.85, confidence: 0.90 },
          replay: { status: 'NOT_REPLAY', replay_probability: 0.05, confidence: 0.90 },
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-df-high', chunkIndex: 1 });
      expect(res.deepfake.status).toBe('SUSPICIOUS');
      expect(res.deepfake.spoof_score).toBe(0.96);
      expect(res.deepfake.confidence).toBe(0.94);
      expect(res.deepfake.explainability[0]).toContain('Phase distortion');
    });

    it('Scenario B & C [Low / Exactly 0.0 Spoof]: should report AUTHENTIC when spoof score is 0.0', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'AUTHENTIC', spoof_score: 0.0, confidence: 0.99 },
          speaker: { status: 'MATCH', similarity_score: 0.92, confidence: 0.95 },
          replay: { status: 'NOT_REPLAY', replay_probability: 0.0, confidence: 0.99 },
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-df-zero', chunkIndex: 1 });
      expect(res.deepfake.status).toBe('AUTHENTIC');
      expect(res.deepfake.spoof_score).toBe(0.0);
    });

    it('Scenario D [Exactly 1.0 Spoof]: should accept 1.0 boundary cleanly', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'SUSPICIOUS', spoof_score: 1.0, confidence: 1.0 },
          speaker: { status: 'NOT_ENROLLED' },
          replay: { status: 'NOT_REPLAY', replay_probability: 0.0 },
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-df-one', chunkIndex: 1 });
      expect(res.deepfake.spoof_score).toBe(1.0);
    });
  });

  // ==========================================================================
  // TASK 5: SPEAKER VERIFICATION CONTRACT
  // ==========================================================================
  describe('Task 5: Biometric Speaker Verification Contract', () => {
    it('Scenario A [Strong Match]: should confirm enrolled caller identity with similarity >= threshold', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'AUTHENTIC', spoof_score: 0.02 },
          speaker: { status: 'MATCH', similarity_score: 0.92, confidence: 0.94, is_enrolled: true, threshold_applied: 0.72 },
          replay: { status: 'NOT_REPLAY', replay_probability: 0.02 },
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-spk-match', chunkIndex: 1, claimedSpeakerId: 'user-cfo-1' });
      expect(res.speaker.status).toBe('MATCH');
      expect(res.speaker.similarity_score).toBe(0.92);
      expect(res.speaker.is_enrolled).toBe(true);
    });

    it('Scenario B [Strong Mismatch]: should flag biometric speaker mismatch', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'AUTHENTIC', spoof_score: 0.05 },
          speaker: { status: 'MISMATCH', similarity_score: 0.28, confidence: 0.91, is_enrolled: true, threshold_applied: 0.72 },
          replay: { status: 'NOT_REPLAY', replay_probability: 0.03 },
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-spk-mismatch', chunkIndex: 1, claimedSpeakerId: 'user-cfo-1' });
      expect(res.speaker.status).toBe('MISMATCH');
      expect(res.speaker.similarity_score).toBe(0.28);
    });

    it('Scenario D [Missing Reference / Not Enrolled]: must NEVER assume missing speaker is verified', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'AUTHENTIC', spoof_score: 0.05 },
          speaker: { status: 'NOT_ENROLLED', similarity_score: null, confidence: 0.0, is_enrolled: false },
          replay: { status: 'NOT_REPLAY', replay_probability: 0.03 },
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-spk-unenrolled', chunkIndex: 1 });
      expect(res.speaker.status).toBe('NOT_ENROLLED');
      expect(res.speaker.is_enrolled).toBe(false);

      // Verify policy engine requires step-up on unverified identity for high-value transactions
      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        transaction_type: 'HIGH_VALUE',
        identity_verified: false,
      });
      expect(policyRes.actionsTriggered).toContain('REQUIRE_STEP_UP_VERIFICATION');
    });
  });

  // ==========================================================================
  // TASK 6: REPLAY CONTRACT
  // ==========================================================================
  describe('Task 6: Acoustic Replay Detection Contract', () => {
    it('should correctly ingest replay detection probabilities and explainability cues', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'AUTHENTIC', spoof_score: 0.05 },
          speaker: { status: 'MATCH', similarity_score: 0.85 },
          replay: {
            status: 'REPLAY',
            replay_probability: 0.89,
            confidence: 0.88,
            model_version: 'replay_spectral_decay_v3',
            explainability: ['Acoustic high-frequency roll-off > 8kHz and room impulse reverberation'],
          },
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-replay-contract', chunkIndex: 1 });
      expect(res.replay.status).toBe('REPLAY');
      expect(res.replay.replay_probability).toBe(0.89);
      expect(res.replay.explainability[0]).toContain('high-frequency roll-off');
    });
  });

  // ==========================================================================
  // TASK 7 & 8: ASR, INTENT & SOCIAL ENGINEERING CONTRACTS
  // ==========================================================================
  describe('Task 7 & 8: ASR, Intent & Social Engineering Contract', () => {
    it('should consume complete conversational intelligence schema without field loss', async () => {
      const convPayload = {
        call_id: 'call-conv-01',
        turn_index: 1,
        asr: {
          status: 'AVAILABLE',
          model_version: 'whisper_streaming_conformer_v4',
          transcript: 'Please give me your secret banking OTP code immediately.',
          confidence: 0.94,
          uncertainty: 0.06,
          language: 'en-IN',
        },
        intent: {
          status: 'AVAILABLE',
          primary_intent: 'OTP_REQUEST',
          confidence: 0.96,
          is_adversarial: true,
          evidence_cues: ['Direct OTP solicitation under urgency'],
        },
        social_engineering: {
          status: 'AVAILABLE',
          model_version: 'social_eng_multi_turn_v4',
          tactics_detected: ['AUTHORITY_EXPLOITATION', 'URGENCY_PRESSURE'],
          progression_state: 'SECRET_HARVESTING_ATTEMPTED',
          attack_sequence_score: 0.92,
          confidence: 0.90,
          explainability: ['Authority coercion and secret harvesting detected'],
        },
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => convPayload,
      } as any);

      const res = await ConversationService.analyzeTurn({ callId: 'call-conv-01', chunkIndex: 1 });
      expect(res.asr.status).toBe('AVAILABLE');
      expect(res.asr.transcript).toContain('OTP code');
      expect(res.intent.primary_intent).toBe('OTP_REQUEST');
      expect(res.intent.is_adversarial).toBe(true);
      expect(res.social_engineering.attack_sequence_score).toBe(0.92);
      expect(res.social_engineering.tactics_detected).toContain('AUTHORITY_EXPLOITATION');
    });

    it('should sanitize raw OTP secrets before persistence/logging', () => {
      const rawText = 'My OTP is 984021 and password is MasterSecret123!';
      const sanitized = PrivacyFirewall.sanitize(rawText);

      expect(sanitized.hasSensitiveSecrets).toBe(true);
      expect(sanitized.sanitizedText).toContain('[AUTHENTICATION_CODE_REDACTED]');
      expect(sanitized.sanitizedText).toContain('[PASSWORD_REDACTED]');
      expect(sanitized.sanitizedText).not.toContain('984021');
      expect(sanitized.sanitizedText).not.toContain('MasterSecret123!');
    });
  });

  // ==========================================================================
  // TASK 9: VERSION / SCHEMA MISMATCH & EXTRA FIELDS
  // ==========================================================================
  describe('Task 9: Version / Schema Mismatch Resilience', () => {
    it('should tolerate unexpected extra fields if core required sub-objects are valid', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'AUTHENTIC', spoof_score: 0.05 },
          speaker: { status: 'MATCH', similarity_score: 0.85 },
          replay: { status: 'NOT_REPLAY', replay_probability: 0.05 },
          future_experimental_v6_field: { logit: 0.12, weights: [1, 2, 3] }, // Unexpected future schema key
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-future-field', chunkIndex: 1 });
      expect(res.deepfake.status).toBe('AUTHENTIC');
      expect(res.deepfake.spoof_score).toBe(0.05);
    });

    it('should safely degrade if a required sub-object is missing', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          deepfake: { status: 'AUTHENTIC', spoof_score: 0.05 },
          // Missing speaker and replay objects
        }),
      } as any);

      const res = await AcousticService.analyze({ callId: 'call-missing-subobject', chunkIndex: 1 });
      expect(res.analysis_status).toBe('AI_INVALID_RESPONSE');
      expect(res.overall_assessment).toBe('NOT_AVAILABLE');
      expect(res.speaker.status).toBe('NOT_AVAILABLE');
    });
  });

  // ==========================================================================
  // TASK 10: COMPLETE AI FAILURE MATRIX
  // ==========================================================================
  describe('Task 10: AI Failure Matrix & Fail-Safe Degradation', () => {
    const failureScenarios = [
      {
        name: 'AI Timeout (AbortError)',
        mockSetup: () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          return Promise.reject(err);
        },
        expectedStatus: 'AI_TIMEOUT',
      },
      {
        name: 'HTTP 500 Internal Server Error',
        mockSetup: () =>
          Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error' } as any),
        expectedStatus: 'AI_HTTP_ERROR',
      },
      {
        name: 'HTTP 503 Service Unavailable',
        mockSetup: () =>
          Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' } as any),
        expectedStatus: 'AI_HTTP_ERROR',
      },
      {
        name: 'Network Error (ECONNREFUSED)',
        mockSetup: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:8000')),
        expectedStatus: 'AI_NETWORK_ERROR',
      },
      {
        name: 'Malformed Non-JSON Response Body',
        mockSetup: () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
          } as any),
        expectedStatus: 'AI_INVALID_RESPONSE',
      },
    ];

    failureScenarios.forEach(({ name, mockSetup, expectedStatus }) => {
      it(`Acoustic Service: ${name} must yield NOT_AVAILABLE without throwing`, async () => {
        jest.spyOn(global, 'fetch').mockImplementation(mockSetup);

        const res = await AcousticService.analyze({ callId: 'call-fail-matrix', chunkIndex: 1 });
        expect(res.overall_assessment).toBe('NOT_AVAILABLE');
        expect(res.analysis_status).toBe(expectedStatus);
        expect(res.deepfake.status).toBe('NOT_AVAILABLE');
        expect(res.speaker.status).toBe('NOT_AVAILABLE');
        expect(res.replay.status).toBe('NOT_AVAILABLE');
        expect(res.deepfake.uncertainty).toBe(1.0);
      });

      it(`Risk Fusion Service: ${name} must yield overall_risk_score = null and INCONCLUSIVE`, async () => {
        jest.spyOn(global, 'fetch').mockImplementation(mockSetup);

        const res = await RiskService.evaluateUnifiedRisk({ callId: 'call-fail-matrix-risk', chunkIndex: 1 });
        expect(res.status).toBe('NOT_AVAILABLE');
        expect(res.risk_level).toBe('INCONCLUSIVE');
        expect(res.overall_risk_score).toBeNull();
        expect(res.confidence).toBe(0.0);
        expect(res.uncertainty).toBe(1.0);
        expect(res.dimensions.overall).toBeNull();
      });
    });
  });

  // ==========================================================================
  // TASK 11: CONTRADICTORY EVIDENCE ACROSS MODALITIES
  // ==========================================================================
  describe('Task 11: Cross-Modal Contradiction Handling', () => {
    it('High deepfake (0.95) + strong biometric speaker match (0.92) must not cancel each other', async () => {
      const contradictionResponse = {
        status: 'AVAILABLE',
        call_id: 'call-contradict-01',
        turn_index: 1,
        overall_risk_score: 72.0,
        risk_level: 'HIGH',
        confidence: 0.65,
        uncertainty: 0.35, // Elevated uncertainty
        dimensions: {
          overall: 72.0,
          identity_impersonation: 10.0,
          deepfake_synthetic: 95.0, // High synthetic spoof logit
          replay_injection: 5.0,
          social_engineering: 10.0,
          credential_theft: 0.0,
          financial_fraud: 0.0,
          account_takeover: 0.0,
          verification_bypass: 0.0,
          inconsistency: 60.0,
        },
        contradicting_signals: ['Acoustic synthetic spoof logit contradicts verified speaker biometrics.'],
        evidence_graph: {
          nodes: [
            { cue: 'AASIST Deepfake Spoof > 0.95', layer: 'ACOUSTIC' },
            { cue: 'ECAPA Biometric Match > 0.90', layer: 'BIOMETRIC' },
          ],
          edges: [],
          contradictions: ['Synthetic vocoder artifacts detected on enrolled voice'],
        },
        policy_recommendation: {
          is_triggered: true,
          action: 'REQUIRE_STEP_UP_VERIFICATION',
          explanation: 'Contradictory deepfake vs enrolled speaker indicators require step-up challenge.',
        },
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => contradictionResponse,
      } as any);

      const res = await RiskService.evaluateUnifiedRisk({ callId: 'call-contradict-01', chunkIndex: 1 });
      expect(res.risk_level).toBe('HIGH');
      expect(res.dimensions.deepfake_synthetic).toBe(95.0);
      expect(res.contradicting_signals.length).toBeGreaterThan(0);
      expect(res.policy_recommendation.action).toBe('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('Low deepfake (0.02) + high credential theft (95.0) MUST NOT produce SAFE / ALLOW', () => {
      const policyRes = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        deepfake_risk: 'SAFE',
        requested_information: 'OTP',
        credential_theft_risk: 'HIGH',
      });

      expect(policyRes.allowed).toBe(false);
      expect(policyRes.actionsTriggered).toContain('BLOCK_DISCLOSURE');
    });
  });

  // ==========================================================================
  // TASK 12: CALL ID / REQUEST CORRELATION UNDER CONCURRENCY
  // ==========================================================================
  describe('Task 12: Call ID & Session Correlation Under Concurrency', () => {
    it('should maintain strict callId correlation across 5 simultaneous requests', async () => {
      const callIds = Array.from({ length: 5 }, (_, i) => `call-correlation-5-${i + 1}`);

      jest.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            call_id: body.call_id,
            deepfake: { status: 'AUTHENTIC', spoof_score: 0.05 },
            speaker: { status: 'MATCH', similarity_score: 0.85 },
            replay: { status: 'NOT_REPLAY', replay_probability: 0.05 },
          }),
        } as any;
      });

      const promises = callIds.map(async (callId, idx) => {
        const res = await AcousticService.analyze({ callId, chunkIndex: idx });
        expect(res.call_id).toBe(callId);
      });

      await Promise.all(promises);
    });

    it('should maintain strict callId correlation across 10 simultaneous requests', async () => {
      const callIds = Array.from({ length: 10 }, (_, i) => `call-correlation-10-${i + 1}`);

      jest.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            call_id: body.call_id,
            deepfake: { status: 'AUTHENTIC', spoof_score: 0.05 },
            speaker: { status: 'MATCH', similarity_score: 0.85 },
            replay: { status: 'NOT_REPLAY', replay_probability: 0.05 },
          }),
        } as any;
      });

      const promises = callIds.map(async (callId, idx) => {
        const res = await AcousticService.analyze({ callId, chunkIndex: idx });
        expect(res.call_id).toBe(callId);
      });

      await Promise.all(promises);
    });
  });
});
