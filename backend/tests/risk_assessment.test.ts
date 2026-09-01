import { RiskService } from '../src/risk/risk.service';

describe('Explainable Risk Assessment Model Tests', () => {
  it('should return explicit NOT_AVAILABLE state without generating fake AI scores', () => {
    const callId = 'c-test-risk-001';
    const assessment = RiskService.getAssessmentForCall(callId);

    expect(assessment.status).toBe('NOT_AVAILABLE');
    expect(assessment.compositeScore).toBeNull();
    expect(assessment.confidence).toBeNull();
    expect(assessment.uncertainty).toBeNull();
    expect(Array.isArray(assessment.factors)).toBe(true);
    expect(assessment.factors.length).toBeGreaterThan(0);

    // Verify all factors have explainable explanations and null scores
    for (const factor of assessment.factors) {
      expect(factor.score).toBeNull();
      expect(factor.explanation).toBeDefined();
      expect(factor.category).toBeDefined();
    }
  });
});
