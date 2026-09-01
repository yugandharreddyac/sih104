export type InterventionLevel =
  | 'LEVEL_0_MONITOR'
  | 'LEVEL_1_SOC_ALERT'
  | 'LEVEL_2_STEP_UP_VERIFICATION'
  | 'LEVEL_3_RESTRICT_ACTION'
  | 'LEVEL_4_ESCALATE_SUPERVISOR'
  | 'LEVEL_5_TERMINATE_CALL';

export type HumanDecision = 'APPROVED' | 'OVERRIDDEN' | 'REJECTED';

export type InterventionStatus =
  | 'AI_RECOMMENDED'
  | 'POLICY_APPROVED'
  | 'AWAITING_HUMAN'
  | 'EXECUTED'
  | 'OVERRIDDEN'
  | 'REJECTED'
  | 'FAILED';

export interface InterventionRecord {
  id: string;
  callId: string;
  organizationId: string;
  riskAssessmentId?: string;
  policyId?: string;
  level: InterventionLevel;
  actionType: string;
  status: InterventionStatus;
  requestedBy: string; // e.g. "AI_POLICY_ENGINE" or user ID
  approvedBy?: string;
  humanDecision?: HumanDecision;
  decisionReason?: string;
  evidenceSummary: string[];
  createdAt: Date;
  executedAt?: Date;
  metadata?: Record<string, any>;
}
