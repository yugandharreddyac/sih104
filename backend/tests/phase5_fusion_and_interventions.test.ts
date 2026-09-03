import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { InterventionService } from '../src/interventions/intervention.service';
import { RiskService } from '../src/risk/risk.service';

describe('Phase 5: Unified Risk Fusion, Deterministic Policy, Step-Up & Interventions', () => {
  const originalFetch = global.fetch;

  const analystToken = TokenService.generateToken({
    userId: 'u-analyst-phase5',
    email: 'analyst5@voxshield.local',
    role: RoleName.SECURITY_ANALYST,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  const viewerToken = TokenService.generateToken({
    userId: 'u-vw-phase5',
    email: 'viewer5@voxshield.local',
    role: RoleName.VIEWER,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('REST Endpoints (/api/risk/* and /api/interventions/*)', () => {
    it('should pass through valid AI Risk Fusion response on success path', async () => {
      const validFusionResponse = {
        status: 'AVAILABLE',
        call_id: 'call-phase5-valid',
        turn_index: 0,
        overall_risk_score: 85.5,
        risk_level: 'CRITICAL',
        confidence: 0.92,
        uncertainty: 0.08,
        dimensions: {
          overall: 85.5,
          identity_impersonation: 80.0,
          deepfake_synthetic: 90.0,
          replay_injection: 10.0,
          social_engineering: 88.0,
          credential_theft: 95.0,
          financial_fraud: 0.0,
          account_takeover: 0.0,
          verification_bypass: 0.0,
          inconsistency: 5.0,
        },
        risk_velocity: 0.2,
        risk_trajectory_trend: 'ESCALATING',
        primary_drivers: ['Critical synthetic deepfake detected with high confidence.'],
        contradicting_signals: [],
        evidence_graph: { nodes: [], edges: [], primary_findings: ['High confidence voice spoof.'] },
        policy_recommendation: null,
        human_workflow_state: 'AI_RECOMMENDED',
        fusion_latency_ms: 1.2,
        timestamp: new Date().toISOString(),
      };

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(validFusionResponse),
      } as any);

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-phase5-valid',
          chunkIndex: 0,
          textTranscript: 'I am calling from your security department. Disclose your OTP 928401 immediately.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.call_id).toBe('call-phase5-valid');
      expect(res.body.data.overall_risk_score).toBe(85.5);
      expect(res.body.data.risk_level).toBe('CRITICAL');
      expect(res.body.data.confidence).toBe(0.92);
      expect(res.body.data.dimensions.deepfake_synthetic).toBe(90.0);
    });

    it('should return safe degraded result when AI Fusion service is unavailable (network error)', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await request(app)
        .post('/api/risk/evaluate')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-phase5-netfail',
          chunkIndex: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      // Critical Security Assertions: Never declare SAFE or fabricate scores on failure
      expect(data.status).toBe('NOT_AVAILABLE');
      expect(data.risk_level).toBe('INCONCLUSIVE');
      expect(data.overall_risk_score).toBeNull();
      expect(data.confidence).toBe(0.0);
      expect(data.uncertainty).toBe(1.0);
      expect(data.primary_drivers[0]).toContain('Risk Fusion service unavailable');
      expect(data.dimensions.overall).toBeNull();
    });

    it('should return safe degraded result on HTTP 500 from AI Fusion service', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-risk-500',
        chunkIndex: 1,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_HTTP_ERROR');
      expect(result.http_status).toBe(500);
      expect(result.risk_level).toBe('INCONCLUSIVE');
      expect(result.overall_risk_score).toBeNull();
    });

    it('should return safe degraded result on HTTP 503 service unavailable', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-risk-503',
        chunkIndex: 2,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_HTTP_ERROR');
      expect(result.http_status).toBe(503);
      expect(result.risk_level).toBe('INCONCLUSIVE');
    });

    it('should return safe degraded result on HTTP 429 rate limit', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-risk-429',
        chunkIndex: 3,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_HTTP_ERROR');
      expect(result.http_status).toBe(429);
      expect(result.risk_level).toBe('INCONCLUSIVE');
    });

    it('should return safe degraded result when AI Fusion request times out', async () => {
      jest.spyOn(global, 'fetch').mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-risk-timeout',
        chunkIndex: 4,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_TIMEOUT');
      expect(result.risk_level).toBe('INCONCLUSIVE');
      expect(result.overall_risk_score).toBeNull();
      expect(result.confidence).toBe(0.0);
    });

    it('should return safe degraded result on malformed JSON response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token in JSON')),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-risk-malformed-json',
        chunkIndex: 5,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
      expect(result.risk_level).toBe('INCONCLUSIVE');
      expect(result.overall_risk_score).toBeNull();
    });

    it('should return safe degraded result on empty JSON object response {}', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-risk-empty-json',
        chunkIndex: 6,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
      expect(result.risk_level).toBe('INCONCLUSIVE');
      expect(result.overall_risk_score).toBeNull();
    });

    it('should return safe degraded result on invalid numeric score (NaN / Infinity / out of range)', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          dimensions: {},
          overall_risk_score: NaN,
          risk_level: 'HIGH',
        }),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-risk-invalid-score',
        chunkIndex: 7,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
      expect(result.overall_risk_score).toBeNull();
    });

    it('should return safe degraded result on invalid risk level string', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          dimensions: {},
          overall_risk_score: 50.0,
          risk_level: 'SUPER_SAFE', // Invalid risk level
        }),
      } as any);

      const result = await RiskService.evaluateUnifiedRisk({
        callId: 'call-risk-invalid-level',
        chunkIndex: 8,
      });

      expect(result.status).toBe('NOT_AVAILABLE');
      expect(result.analysis_status).toBe('AI_INVALID_RESPONSE');
      expect(result.risk_level).toBe('INCONCLUSIVE');
    });

    it('should retrieve timeline history for call', async () => {
      const res = await request(app)
        .get('/api/risk/call-phase5-valid/timeline')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should recommend intervention under policy enforcement', async () => {
      const res = await request(app)
        .post('/api/interventions/recommend')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          callId: 'call-phase5-test',
          level: 'LEVEL_2_STEP_UP_VERIFICATION',
          actionType: 'REQUIRE_STEP_UP_VERIFICATION',
          policyId: 'POL-CRED-001',
          evidenceSummary: ['Direct solicitation of OTP [REDACTED]'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('AWAITING_HUMAN');
      expect(res.body.data.actionType).toBe('REQUIRE_STEP_UP_VERIFICATION');
    });

    it('should record human SOC decision (APPROVAL) on intervention', async () => {
      const created = await InterventionService.createIntervention({
        callId: 'call-phase5-approval',
        organizationId: '00000000-0000-0000-0000-000000000001',
        level: 'LEVEL_2_STEP_UP_VERIFICATION',
        actionType: 'REQUIRE_STEP_UP_VERIFICATION',
      });

      const res = await request(app)
        .post('/api/interventions/decision')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          interventionId: created.id,
          decision: 'APPROVED',
          reason: 'Confirmed multi-turn social engineering pattern.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('EXECUTED');
      expect(res.body.data.humanDecision).toBe('APPROVED');
    });

    it('should forbid VIEWER from creating interventions with 403', async () => {
      const res = await request(app)
        .post('/api/interventions/recommend')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          callId: 'call-phase5-test',
          level: 'LEVEL_2_STEP_UP_VERIFICATION',
          actionType: 'REQUIRE_STEP_UP_VERIFICATION',
        });

      expect(res.status).toBe(403);
    });
  });
});
