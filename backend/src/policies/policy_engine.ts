import {
  Policy,
  PolicyAction,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  PolicyRule,
  RuleCondition,
} from './policy.types';
import { policyActionsTotal } from '../health/metrics.controller';

export class PolicyEngine {
  /**
   * Evaluates a single rule condition against the context.
   */
  private static evaluateCondition(condition: RuleCondition, context: PolicyEvaluationContext): boolean {
    const contextValue = context[condition.field];

    switch (condition.operator) {
      case 'EQUALS':
        return contextValue === condition.value;
      case 'NOT_EQUALS':
        return contextValue !== condition.value;
      case 'CONTAINS':
        if (typeof contextValue === 'string' && typeof condition.value === 'string') {
          return contextValue.toLowerCase().includes(condition.value.toLowerCase());
        }
        if (Array.isArray(contextValue)) {
          return contextValue.includes(condition.value);
        }
        return false;
      case 'GREATER_THAN':
        return typeof contextValue === 'number' && contextValue > condition.value;
      case 'IN':
        if (Array.isArray(condition.value)) {
          return condition.value.includes(contextValue);
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * Evaluates a policy rule. All conditions in a rule must be satisfied (AND logic).
   */
  public static evaluateRule(rule: PolicyRule, context: PolicyEvaluationContext): boolean {
    if (!rule.conditions || rule.conditions.length === 0) {
      return false;
    }
    return rule.conditions.every((c) => this.evaluateCondition(c, context));
  }

  /**
   * Evaluates all active policies against context and determines actions.
   */
  public static evaluate(
    policies: Policy[],
    context: PolicyEvaluationContext
  ): PolicyEvaluationResult {
    const matchedRules: PolicyEvaluationResult['matchedRules'] = [];
    const actionsSet = new Set<PolicyAction>();

    // Collect all rules from active policies and sort by priority (ascending)
    const allRules: Array<PolicyRule & { policyName: string }> = [];
    for (const policy of policies) {
      if (!policy.isActive) continue;
      for (const rule of policy.rules) {
        allRules.push({ ...rule, policyName: policy.name });
      }
    }

    allRules.sort((a, b) => a.priority - b.priority);

    for (const rule of allRules) {
      if (this.evaluateRule(rule, context)) {
        actionsSet.add(rule.action);
        matchedRules.push({
          ruleId: rule.id,
          ruleName: `${rule.policyName}: ${rule.name}`,
          action: rule.action,
          reason: `Matched conditions on ${rule.conditions.map((c) => `${c.field} ${c.operator} ${c.value}`).join(' AND ')}`,
        });
      }
    }

    const actionsTriggered = Array.from(actionsSet);
    const hasBlockAction = actionsTriggered.some((a) =>
      ['BLOCK_DISCLOSURE', 'BLOCK_PROTECTED_WORKFLOW', 'TERMINATE_CALL'].includes(a)
    );

    if (hasBlockAction) {
      try {
        policyActionsTotal.inc({ action: 'block' });
      } catch {}
    }

    return {
      allowed: !hasBlockAction,
      actionsTriggered,
      matchedRules,
      evaluatedAt: new Date(),
    };
  }
}
