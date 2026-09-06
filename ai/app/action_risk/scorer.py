"""
Quantitative Multi-Factor Action Risk Scorer (Master 2)
Evaluates high-risk caller requested actions (financial transfers, credential harvesting,
remote access, security modifications) with deterministic weighting and explicit explainability.
"""

from typing import Dict, Any, Optional, List
from ai.app.core.types import (
    ActionType,
    ActionRiskEvaluation,
    RiskSeverity,
    PipelineStatus,
    SocialEngineeringTactic
)
from ai.app.context.contract import AIConversationContext


class ActionRiskScorer:
    def __init__(self):
        self.model_version = "action_risk_multi_factor_v2"
        self.status = PipelineStatus.AVAILABLE

        # Inherent baseline risk weights for action categories
        self._base_action_weights: Dict[ActionType, Dict[str, Any]] = {
            ActionType.INSTALL_REMOTE_SOFTWARE: {
                "base_score": 95.0,
                "severity": RiskSeverity.CRITICAL,
                "financial_impact": 0.90,
                "credential_sensitivity": 0.95,
                "is_high_risk": True,
                "category_desc": "Remote access tool installation (e.g. AnyDesk, TeamViewer)"
            },
            ActionType.DOWNLOAD_MALICIOUS_APP: {
                "base_score": 95.0,
                "severity": RiskSeverity.CRITICAL,
                "financial_impact": 0.85,
                "credential_sensitivity": 0.90,
                "is_high_risk": True,
                "category_desc": "Unverified APK / malicious application download"
            },
            ActionType.DISCLOSE_OTP: {
                "base_score": 92.0,
                "severity": RiskSeverity.CRITICAL,
                "financial_impact": 0.95,
                "credential_sensitivity": 1.00,
                "is_high_risk": True,
                "category_desc": "One-Time Password (OTP) disclosure solicitation"
            },
            ActionType.DISCLOSE_PIN: {
                "base_score": 92.0,
                "severity": RiskSeverity.CRITICAL,
                "financial_impact": 0.95,
                "credential_sensitivity": 1.00,
                "is_high_risk": True,
                "category_desc": "ATM/UPI PIN disclosure solicitation"
            },
            ActionType.DISCLOSE_PASSWORD: {
                "base_score": 90.0,
                "severity": RiskSeverity.CRITICAL,
                "financial_impact": 0.85,
                "credential_sensitivity": 0.95,
                "is_high_risk": True,
                "category_desc": "Account password or netbanking passphrase disclosure"
            },
            ActionType.DISCLOSE_CARD_INFO: {
                "base_score": 88.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.85,
                "credential_sensitivity": 0.90,
                "is_high_risk": True,
                "category_desc": "Payment card number, expiry, or CVV disclosure"
            },
            ActionType.DISCLOSE_CREDENTIAL: {
                "base_score": 88.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.80,
                "credential_sensitivity": 0.90,
                "is_high_risk": True,
                "category_desc": "Generic sensitive credential disclosure"
            },
            ActionType.SHARE_SCREEN: {
                "base_score": 85.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.75,
                "credential_sensitivity": 0.90,
                "is_high_risk": True,
                "category_desc": "Live device screen sharing request"
            },
            ActionType.TRANSFER_FUNDS: {
                "base_score": 82.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 1.00,
                "credential_sensitivity": 0.40,
                "is_high_risk": True,
                "category_desc": "Direct monetary / wire transfer request"
            },
            ActionType.UPI_PAYMENT: {
                "base_score": 80.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.90,
                "credential_sensitivity": 0.50,
                "is_high_risk": True,
                "category_desc": "UPI payment or QR scan solicitation"
            },
            ActionType.APPROVE_TRANSACTION: {
                "base_score": 78.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.90,
                "credential_sensitivity": 0.40,
                "is_high_risk": True,
                "category_desc": "Out-of-band payment authorization prompt"
            },
            ActionType.CHANGE_BENEFICIARY: {
                "base_score": 78.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.85,
                "credential_sensitivity": 0.50,
                "is_high_risk": True,
                "category_desc": "Payee or beneficiary modification"
            },
            ActionType.BENEFICIARY_ADDITION: {
                "base_score": 78.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.85,
                "credential_sensitivity": 0.50,
                "is_high_risk": True,
                "category_desc": "New unverified beneficiary addition"
            },
            ActionType.BYPASS_POLICY: {
                "base_score": 85.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.70,
                "credential_sensitivity": 0.70,
                "is_high_risk": True,
                "category_desc": "Request to circumvent institutional verification policy"
            },
            ActionType.CHANGE_SECURITY_SETTINGS: {
                "base_score": 72.0,
                "severity": RiskSeverity.HIGH,
                "financial_impact": 0.60,
                "credential_sensitivity": 0.75,
                "is_high_risk": True,
                "category_desc": "Authentication or security settings reconfiguration"
            },
            ActionType.ACCOUNT_RECOVERY: {
                "base_score": 70.0,
                "severity": RiskSeverity.MEDIUM,
                "financial_impact": 0.50,
                "credential_sensitivity": 0.70,
                "is_high_risk": True,
                "category_desc": "Account recovery or password reset initiation"
            },
            ActionType.SUSPICIOUS_LOGIN: {
                "base_score": 65.0,
                "severity": RiskSeverity.MEDIUM,
                "financial_impact": 0.40,
                "credential_sensitivity": 0.60,
                "is_high_risk": True,
                "category_desc": "Prompt to authenticate into suspicious portal"
            },
            ActionType.BENIGN_ACTION: {
                "base_score": 5.0,
                "severity": RiskSeverity.LOW,
                "financial_impact": 0.0,
                "credential_sensitivity": 0.0,
                "is_high_risk": False,
                "category_desc": "Standard benign conversational action or service inquiry"
            }
        }

    def evaluate_action(
        self,
        action_type: ActionType,
        text: str = "",
        tactics: Optional[List[SocialEngineeringTactic]] = None,
        context: Optional[AIConversationContext] = None,
        recipient_hesitated: bool = False
    ) -> ActionRiskEvaluation:
        """
        Computes multi-dimensional quantitative risk evaluation for a requested action.
        """
        config = self._base_action_weights.get(
            action_type,
            self._base_action_weights[ActionType.BENIGN_ACTION]
        )

        base_score = config["base_score"]
        financial_impact = config["financial_impact"]
        credential_sensitivity = config["credential_sensitivity"]
        is_high_risk = config["is_high_risk"]

        contributing_factors: List[str] = [
            f"Base action classification: {action_type.value} ({config['category_desc']})"
        ]

        if not is_high_risk:
            return ActionRiskEvaluation(
                action_type=action_type,
                risk_score=base_score,
                normalized_score=round(base_score / 100.0, 3),
                severity=RiskSeverity.LOW,
                is_high_risk=False,
                financial_impact_weight=financial_impact,
                credential_sensitivity_weight=credential_sensitivity,
                urgency_multiplier=1.0,
                authority_multiplier=1.0,
                hesitation_multiplier=1.0,
                contributing_factors=["Benign action with standard low-risk operational profile."],
                rationale="Routine operational request without credential or fund diversion threat."
            )

        urgency_multiplier = 1.0
        authority_multiplier = 1.0
        hesitation_multiplier = 1.0

        tactics_list = tactics or []

        # 1. Evaluate Urgency Pressure
        if SocialEngineeringTactic.URGENCY_PRESSURE in tactics_list:
            urgency_multiplier = 1.15
            contributing_factors.append("Urgency pressure active (+15% risk modifier)")

        # 2. Evaluate Authority & Fear Pressure
        if any(t in tactics_list for t in [
            SocialEngineeringTactic.AUTHORITY_EXPLOITATION,
            SocialEngineeringTactic.FEAR_COERCION,
            SocialEngineeringTactic.DIGITAL_ARREST_THREAT
        ]):
            authority_multiplier = 1.20
            contributing_factors.append("Authority impersonation / coercive threat active (+20% risk modifier)")

        # 3. Evaluate Secrecy or Isolation
        if any(t in tactics_list for t in [
            SocialEngineeringTactic.SECRECY_DEMAND,
            SocialEngineeringTactic.ISOLATION_ATTEMPT
        ]):
            authority_multiplier = max(authority_multiplier, 1.15)
            contributing_factors.append("Secrecy demand or victim isolation detected (+15% risk modifier)")

        # 4. Multi-Turn Hesitation / Refusal Escalation
        escalation_factor = 1.0
        if context:
            if context.refusal_count > 0:
                hesitation_multiplier = 1.25
                contributing_factors.append(
                    f"Victim explicitly refused previous request (refusal count={context.refusal_count}, +25% modifier)"
                )
            elif context.hesitation_count > 0:
                hesitation_multiplier = 1.15
                contributing_factors.append(
                    f"Victim previously showed reluctance (hesitation count={context.hesitation_count}, +15% modifier)"
                )

            if context.escalation_level >= 3:
                escalation_factor = 1.10
                contributing_factors.append(
                    f"Attacker escalation sequence confirmed (escalation tier {context.escalation_level}, +10% modifier)"
                )
        elif recipient_hesitated:
            hesitation_multiplier = 1.15
            contributing_factors.append("Recipient resistance detected during action prompt (+15% modifier)")

        # Aggregate weighted score
        compound_multiplier = urgency_multiplier * authority_multiplier * hesitation_multiplier * escalation_factor
        raw_final_score = base_score * compound_multiplier
        final_score = round(min(100.0, max(0.0, raw_final_score)), 1)
        norm_score = round(final_score / 100.0, 3)

        # Severity classification
        if final_score >= 85.0:
            severity = RiskSeverity.CRITICAL
        elif final_score >= 70.0:
            severity = RiskSeverity.HIGH
        elif final_score >= 45.0:
            severity = RiskSeverity.MEDIUM
        else:
            severity = RiskSeverity.LOW

        rationale = (
            f"Action '{action_type.value}' evaluated with {final_score}/100.0 risk. "
            f"Base weight: {base_score:.0f}, Compound contextual multiplier: {compound_multiplier:.2f}x. "
            f"Primary factors: {'; '.join(contributing_factors[:3])}."
        )

        return ActionRiskEvaluation(
            action_type=action_type,
            risk_score=final_score,
            normalized_score=norm_score,
            severity=severity,
            is_high_risk=is_high_risk,
            financial_impact_weight=financial_impact,
            credential_sensitivity_weight=credential_sensitivity,
            urgency_multiplier=round(urgency_multiplier, 2),
            authority_multiplier=round(authority_multiplier, 2),
            hesitation_multiplier=round(hesitation_multiplier, 2),
            contributing_factors=contributing_factors,
            rationale=rationale
        )

    def score_action(
        self,
        action_type: str,
        action_details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Legacy/compatibility endpoint returning a dictionary with quantitative risk score.
        """
        # Map string to ActionType if possible
        act_enum = ActionType.BENIGN_ACTION
        try:
            act_enum = ActionType(action_type)
        except ValueError:
            # Fallback by keyword match
            upper = action_type.upper()
            for cand in ActionType:
                if cand.value in upper or upper in cand.value:
                    act_enum = cand
                    break

        tactics: List[SocialEngineeringTactic] = []
        if action_details and "tactics" in action_details:
            for t in action_details["tactics"]:
                try:
                    tactics.append(SocialEngineeringTactic(t))
                except ValueError:
                    pass

        recipient_hesitated = bool(action_details.get("recipient_hesitated", False)) if action_details else False

        evaluation = self.evaluate_action(
            action_type=act_enum,
            text=action_details.get("text", "") if action_details else "",
            tactics=tactics,
            recipient_hesitated=recipient_hesitated
        )

        return {
            "status": self.status.value,
            "model_version": self.model_version,
            "action_type": evaluation.action_type.value,
            "risk_score": evaluation.risk_score,
            "normalized_score": evaluation.normalized_score,
            "severity": evaluation.severity.value,
            "is_high_risk": evaluation.is_high_risk,
            "urgency_multiplier": evaluation.urgency_multiplier,
            "authority_multiplier": evaluation.authority_multiplier,
            "contributing_factors": evaluation.contributing_factors,
            "rationale": evaluation.rationale
        }
