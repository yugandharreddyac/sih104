export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AssessmentStatus = 'NOT_AVAILABLE' | 'PROCESSING' | 'AVAILABLE' | 'ERROR';

export interface RiskFactor {
  category: 'VOICE' | 'IDENTITY' | 'CONVERSATION' | 'SENSITIVE_INFO' | 'ACTION' | 'CONTEXT' | 'POLICY';
  factorName: string;
  score: number | null; // null in Phase 1
  weight: number;
  contribution: number | null;
  explanation: string;
  evidenceRef?: string | null;
}

export interface RiskAssessment {
  id: string;
  callId: string;
  status: AssessmentStatus;
  severity: RiskSeverity;
  compositeScore: number | null; // null in Phase 1
  confidence: number | null; // null in Phase 1
  uncertainty: number | null; // null in Phase 1
  factors: RiskFactor[];
  recommendedAction: 'ALLOW' | 'STEP_UP_VERIFICATION' | 'WARN_OPERATOR' | 'BLOCK_ACTION' | 'TERMINATE_CALL' | null;
  evaluatedAt: Date;
  details: {
    voiceRiskStatus: AssessmentStatus;
    identityRiskStatus: AssessmentStatus;
    conversationRiskStatus: AssessmentStatus;
    actionRiskStatus: AssessmentStatus;
    contextRiskStatus: AssessmentStatus;
    policyRiskStatus: AssessmentStatus;
    phaseNote: string;
  };
}
