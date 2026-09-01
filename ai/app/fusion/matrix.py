"""
10-Dimensional Multi-Modal Risk Fusion Matrix (Phase 5B)
Computes quality-aware weighted scores, corroboration multipliers, and contradiction penalties.
"""

from typing import List, Tuple
from ai.app.core.types import (
    CanonicalRiskSignal,
    RiskDimensions,
    RiskLevel,
    SignalCategory
)


class RiskMatrixCalculator:
    def __init__(self):
        # Base category dimension weights
        self.weights = {
            SignalCategory.ACOUSTIC: 0.15,
            SignalCategory.IDENTITY: 0.20,
            SignalCategory.REPLAY: 0.10,
            SignalCategory.INTENT: 0.25,
            SignalCategory.SENSITIVE_DATA: 0.30,
            SignalCategory.SOCIAL_ENGINEERING: 0.25,
            SignalCategory.ACTION: 0.20,
            SignalCategory.CLAIMS: 0.10,
        }

    def compute_dimensions(
        self,
        signals: List[CanonicalRiskSignal]
    ) -> Tuple[RiskDimensions, float, float, float]:
        """
        Computes 10 risk dimensions, overall score, combined confidence, and uncertainty.
        """
        dim_scores = {
            "overall": 0.0,
            "identity_impersonation": 0.0,
            "deepfake_synthetic": 0.0,
            "replay_injection": 0.0,
            "social_engineering": 0.0,
            "credential_theft": 0.0,
            "financial_fraud": 0.0,
            "account_takeover": 0.0,
            "verification_bypass": 0.0,
            "inconsistency": 0.0,
        }

        # Track active signal severities for corroboration
        active_threat_signals = 0
        total_weight = 0.0
        weighted_sum = 0.0
        confidence_sum = 0.0

        for s in signals:
            eff_conf = s.calibrated_confidence * max(0.2, (1.0 - s.uncertainty_penalty))
            w = self.weights.get(s.category, 0.15)

            # Route to specific dimensions
            if s.category == SignalCategory.ACOUSTIC:
                dim_scores["deepfake_synthetic"] = max(dim_scores["deepfake_synthetic"], s.raw_value * 100.0 * eff_conf)
            elif s.category == SignalCategory.IDENTITY:
                dim_scores["identity_impersonation"] = max(dim_scores["identity_impersonation"], s.raw_value * 100.0 * eff_conf)
            elif s.category == SignalCategory.REPLAY:
                dim_scores["replay_injection"] = max(dim_scores["replay_injection"], s.raw_value * 100.0 * eff_conf)
            elif s.category == SignalCategory.SOCIAL_ENGINEERING:
                dim_scores["social_engineering"] = max(dim_scores["social_engineering"], s.raw_value * 100.0 * eff_conf)
                if "BYPASS" in s.signal_type:
                    dim_scores["verification_bypass"] = max(dim_scores["verification_bypass"], s.raw_value * 100.0 * eff_conf)
            elif s.category == SignalCategory.SENSITIVE_DATA:
                dim_scores["credential_theft"] = max(dim_scores["credential_theft"], s.raw_value * 100.0 * eff_conf)
            elif s.category == SignalCategory.INTENT:
                if "OTP" in s.signal_type or "CREDENTIAL" in s.signal_type:
                    dim_scores["credential_theft"] = max(dim_scores["credential_theft"], s.raw_value * 100.0 * eff_conf)
                elif "MONEY" in s.signal_type or "PAYMENT" in s.signal_type:
                    dim_scores["financial_fraud"] = max(dim_scores["financial_fraud"], s.raw_value * 100.0 * eff_conf)
                elif "REMOTE" in s.signal_type or "PASSWORD" in s.signal_type:
                    dim_scores["account_takeover"] = max(dim_scores["account_takeover"], s.raw_value * 100.0 * eff_conf)

            if s.raw_value > 0.60 and eff_conf > 0.60:
                active_threat_signals += 1

            weighted_sum += (s.raw_value * 100.0) * eff_conf * w
            total_weight += eff_conf * w
            confidence_sum += eff_conf

        # Calculate cross-modal corroboration multiplier
        # 1 signal = 1.0x, 2 signals = 1.25x, 3 signals = 1.50x, 4+ signals = 1.80x
        if active_threat_signals >= 4:
            corrob_multiplier = 1.80
        elif active_threat_signals == 3:
            corrob_multiplier = 1.50
        elif active_threat_signals == 2:
            corrob_multiplier = 1.25
        else:
            corrob_multiplier = 1.0

        base_overall = (weighted_sum / total_weight) if total_weight > 0 else 0.0
        overall_score = min(100.0, max(0.0, base_overall * corrob_multiplier))
        dim_scores["overall"] = round(overall_score, 1)

        for k in dim_scores:
            dim_scores[k] = round(min(100.0, max(0.0, dim_scores[k])), 1)

        avg_confidence = round(confidence_sum / max(1, len(signals)), 3) if signals else 0.50
        uncertainty = round(1.0 - avg_confidence, 3)

        dimensions = RiskDimensions(**dim_scores)
        return dimensions, round(overall_score, 1), avg_confidence, uncertainty

    @staticmethod
    def classify_risk_level(score: float, confidence: float) -> RiskLevel:
        """
        Classifies risk level based on score and confidence thresholding.
        """
        if confidence < 0.35:
            return RiskLevel.INCONCLUSIVE

        if score >= 80.0:
            return RiskLevel.CRITICAL
        elif score >= 60.0:
            return RiskLevel.HIGH
        elif score >= 45.0:
            return RiskLevel.ELEVATED
        elif score >= 30.0:
            return RiskLevel.GUARDED
        elif score >= 15.0:
            return RiskLevel.LOW
        else:
            return RiskLevel.SAFE
