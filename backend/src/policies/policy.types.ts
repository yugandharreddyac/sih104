export type PolicyAction =
  | 'ALLOW'
  | 'MONITOR'
  | 'WARN_OPERATOR'
  | 'BLOCK_DISCLOSURE'
  | 'REQUIRE_STEP_UP_VERIFICATION'
  | 'RESTRICT_TRANSACTION'
  | 'BLOCK_PROTECTED_WORKFLOW'
  | 'TERMINATE_CALL';

export type PolicyOperator = 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'GREATER_THAN' | 'IN';

export interface RuleCondition {
  field: string; // e.g. "requested_information", "transaction_type", "deepfake_risk", "action_risk", "identity_verified"
  operator: PolicyOperator;
  value: any;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  action: PolicyAction;
  priority: number; // lower number = higher priority
  parameters?: Record<string, any>;
}

export interface Policy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  isActive: boolean;
  rules: PolicyRule[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyEvaluationContext {
  requested_information?: string;
  transaction_type?: string;
  transaction_amount?: number;
  deepfake_risk?: string;
  action_risk?: string;
  identity_verified?: boolean;
  urgency_level?: string;
  [key: string]: any;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  actionsTriggered: PolicyAction[];
  matchedRules: Array<{
    ruleId: string;
    ruleName: string;
    action: PolicyAction;
    reason: string;
  }>;
  evaluatedAt: Date;
}
