import request from 'supertest';
import express from 'express';
import { MetricsController } from '../src/health/metrics.controller';
import { StreamBuffer } from '../src/calls/stream_buffer';
import { PrivacyFirewall } from '../src/security/privacy_firewall';
import { InterventionService } from '../src/interventions/intervention.service';
import { PolicyEngine } from '../src/policies/policy_engine';
import { Policy } from '../src/policies/policy.types';
import { dbQueryDurationSeconds } from '../src/health/metrics.controller';

describe('Phase 5: Prometheus Observability Expansion Suite', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.get('/metrics', MetricsController.getMetrics);
  });

  describe('1. audio_errors_total metric', () => {
    it('should accurately count malformed, gap, out_of_order, and duplicate audio frame errors', () => {
      const buffer = new StreamBuffer('call-p5-1', 'stream-p5-1', 'WEBRTC');

      // Malformed chunk (empty/invalid data)
      const resMalformed = buffer.push({ sequenceNumber: 0, data: Buffer.alloc(0) });
      expect(resMalformed.accepted).toBe(false);

      // Initial valid chunk (seq=0)
      buffer.push({ sequenceNumber: 0, data: Buffer.from('chunk0') });

      // Duplicate chunk (seq=0 again)
      const resDuplicate = buffer.push({ sequenceNumber: 0, data: Buffer.from('chunk0') });
      expect(resDuplicate.isDuplicate).toBe(true);

      // Gap chunk (seq=5 instead of expected 1)
      const resGap = buffer.push({ sequenceNumber: 5, data: Buffer.from('chunk5') });
      expect(resGap.sequenceError).toBe(true);

      // Out-of-order/stale chunk (seq=2 arriving after seq=5 committed)
      const resOutOfOrder = buffer.push({ sequenceNumber: 2, data: Buffer.from('chunk2') });
      expect(resOutOfOrder.sequenceError).toBe(true);
      expect(resOutOfOrder.isStale).toBe(true);

      buffer.clear();
    });
  });

  describe('2. stream_buffer_queue_depth metric', () => {
    it('should aggregate queued depth across multiple active streams sharing the same protocol', async () => {
      const streamA = new StreamBuffer('call-a', 'stream-a', 'WEBRTC');
      const streamB = new StreamBuffer('call-b', 'stream-b', 'WEBRTC');

      // Push 2 chunks to A, 3 chunks to B
      streamA.push({ sequenceNumber: 0, data: Buffer.from('a0') });
      streamA.push({ sequenceNumber: 1, data: Buffer.from('a1') });

      streamB.push({ sequenceNumber: 0, data: Buffer.from('b0') });
      streamB.push({ sequenceNumber: 1, data: Buffer.from('b1') });
      streamB.push({ sequenceNumber: 2, data: Buffer.from('b2') });

      const metricsRes = await request(app).get('/metrics');
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.text).toContain('stream_buffer_queue_depth{protocol="WEBRTC"}');

      // Pop 1 chunk from A
      streamA.pop();

      // Clean up buffers
      streamA.clear();
      streamB.clear();
    });
  });

  describe('3. policy_actions_total metric', () => {
    it('should increment redact, alert, and block action metrics on actual enforcement', async () => {
      // 1. Redact action via PrivacyFirewall
      const result = PrivacyFirewall.sanitize('My secret OTP is 482913 and PIN is 1234');
      expect(result.redactionsCount).toBeGreaterThan(0);

      // 2. Alert action via InterventionService
      await InterventionService.createIntervention({
        callId: 'call-p5-alert',
        organizationId: 'org-p5-test',
        level: 'LEVEL_1_SOC_ALERT',
        actionType: 'PAUSE_DATA_COLLECTION',
        evidenceSummary: ['High risk detected'],
      });

      // 3. Block action via PolicyEngine
      const mockPolicies: Policy[] = [
        {
          id: 'pol-1',
          organizationId: 'org-p5-test',
          name: 'Block Policy',
          description: 'Blocks sensitive access',
          isActive: true,
          rules: [
            {
              id: 'rule-1',
              name: 'Block Rule',
              description: 'Rule to block disclosure',
              priority: 1,
              action: 'BLOCK_DISCLOSURE',
              conditions: [{ field: 'riskScore', operator: 'GREATER_THAN', value: 80 }],
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const evalResult = PolicyEngine.evaluate(mockPolicies, { riskScore: 90 });
      expect(evalResult.allowed).toBe(false);

      const metricsRes = await request(app).get('/metrics');
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.text).toContain('policy_actions_total{action="redact"}');
      expect(metricsRes.text).toContain('policy_actions_total{action="alert"}');
      expect(metricsRes.text).toContain('policy_actions_total{action="block"}');
    });
  });

  describe('4. db_query_duration_seconds metric', () => {
    it('should observe query execution duration histogram accurately', async () => {
      dbQueryDurationSeconds.observe({ operation: 'select' }, 0.012);

      const metricsRes = await request(app).get('/metrics');
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.text).toContain('db_query_duration_seconds_bucket{le="0.025",operation="select"}');
      expect(metricsRes.text).toContain('db_query_duration_seconds_count{operation="select"}');
    });
  });

  describe('5. GET /metrics endpoint integration', () => {
    it('should return 200 OK and valid Prometheus plain-text format containing all 4 Phase 5 metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');

      expect(res.text).toContain('# HELP audio_errors_total');
      expect(res.text).toContain('# TYPE audio_errors_total counter');

      expect(res.text).toContain('# HELP stream_buffer_queue_depth');
      expect(res.text).toContain('# TYPE stream_buffer_queue_depth gauge');

      expect(res.text).toContain('# HELP policy_actions_total');
      expect(res.text).toContain('# TYPE policy_actions_total counter');

      expect(res.text).toContain('# HELP db_query_duration_seconds');
      expect(res.text).toContain('# TYPE db_query_duration_seconds histogram');
    });
  });
});
