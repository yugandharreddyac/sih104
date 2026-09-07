"""
10-Dimensional Multi-Modal Risk Fusion Matrix (Phase 5B)
Computes quality-aware weighted scores, corroboration multipliers, and contradiction penalties.
"""

from datetime import datetime, timezone
from typing import List, Tuple, Optional, Dict
from ai.app.core.types import (
    CanonicalRiskSignal,
    RiskDimensions,
    RiskLevel,
    SignalCategory,
    ActionType,
    DimensionProvenance
)

DETECTOR_PROVENANCE_DEFAULTS = {
    "deepfake_synthetic": ("DeepfakeDetector", "deepfake_aasist_spectral_v3"),
    "identity_impersonation": ("SpeakerVerifier", "speaker_xvector_biometric_v3"),
    "replay_injection": ("ReplayDetector", "replay_spectral_decay_v3"),
    "inconsistency": ("ConversationInconsistencyVerifier", "conversation_inconsistency_verifier_v4"),
    "social_engineering": ("SocialEngineeringDetector", "social_eng_multi_turn_v4"),
    "credential_theft": ("SensitiveDataDetector", "sensitive_data_detector_v4"),
    "financial_fraud": ("RequestedActionExtractor", "action_extractor_v4"),
    "account_takeover": ("RequestedActionExtractor", "action_extractor_v4"),
    "verification_bypass": ("SocialEngineeringDetector", "social_eng_multi_turn_v4"),
    "overall": ("MultiModalRiskFusionEngine", "fusion_matrix_10d_v4"),
}


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
            SignalCategory.INCONSISTENCY: 0.20,
        }
        self.last_provenance: Dict[str, DimensionProvenance] = {}

    def compute_dimensions(
        self,
        signals: List[CanonicalRiskSignal]
    ) -> Tuple[RiskDimensions, Optional[float], float, float, Dict[str, DimensionProvenance]]:
        """
        Computes 10 risk dimensions, overall score, combined confidence, uncertainty,
        and fine-grained per-dimension provenance.
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

        dim_signals: Dict[str, List[CanonicalRiskSignal]] = {
            "identity_impersonation": [],
            "deepfake_synthetic": [],
            "replay_injection": [],
            "social_engineering": [],
            "credential_theft": [],
            "financial_fraud": [],
            "account_takeover": [],
            "verification_bypass": [],
            "inconsistency": [],
        }

        # Track active signal severities for corroboration
        active_threat_signals = 0
        total_weight = 0.0
        weighted_sum = 0.0
        confidence_sum = 0.0
        now_iso = datetime.now(timezone.utc).isoformat()

        for s in signals:
            eff_conf = s.calibrated_confidence * max(0.2, (1.0 - s.uncertainty_penalty))
            w = self.weights.get(s.category, 0.15)

            # Route to specific dimensions and track contributing signals
            if s.category == SignalCategory.ACOUSTIC:
                dim_scores["deepfake_synthetic"] = max(dim_scores["deepfake_synthetic"], s.raw_value * 100.0 * eff_conf)
                dim_signals["deepfake_synthetic"].append(s)
            elif s.category == SignalCategory.IDENTITY:
                dim_scores["identity_impersonation"] = max(dim_scores["identity_impersonation"], s.raw_value * 100.0 * eff_conf)
                dim_signals["identity_impersonation"].append(s)
            elif s.category == SignalCategory.REPLAY:
                dim_scores["replay_injection"] = max(dim_scores["replay_injection"], s.raw_value * 100.0 * eff_conf)
                dim_signals["replay_injection"].append(s)
            elif s.category == SignalCategory.INCONSISTENCY:
                dim_scores["inconsistency"] = max(dim_scores["inconsistency"], s.raw_value * 100.0 * eff_conf)
                dim_signals["inconsistency"].append(s)
            elif s.category == SignalCategory.SOCIAL_ENGINEERING:
                dim_scores["social_engineering"] = max(dim_scores["social_engineering"], s.raw_value * 100.0 * eff_conf)
                dim_signals["social_engineering"].append(s)
                if "BYPASS" in s.signal_type or "VERIFICATION" in s.signal_type:
                    dim_scores["verification_bypass"] = max(dim_scores["verification_bypass"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["verification_bypass"].append(s)
            elif s.category == SignalCategory.SENSITIVE_DATA:
                dim_scores["credential_theft"] = max(dim_scores["credential_theft"], s.raw_value * 100.0 * eff_conf)
                dim_signals["credential_theft"].append(s)
            elif s.category == SignalCategory.ACTION:
                # Financial Fraud: TRANSFER_FUNDS, CHANGE_BENEFICIARY, APPROVE_TRANSACTION
                if (
                    s.signal_type in [
                        f"ACTION_{ActionType.TRANSFER_FUNDS.value}",
                        f"ACTION_{ActionType.CHANGE_BENEFICIARY.value}",
                        f"ACTION_{ActionType.APPROVE_TRANSACTION.value}",
                    ]
                    or "TRANSFER" in s.signal_type
                    or "BENEFICIARY" in s.signal_type
                    or "TRANSACTION" in s.signal_type
                    or "MONEY" in s.signal_type
                    or "PAYMENT" in s.signal_type
                ):
                    dim_scores["financial_fraud"] = max(dim_scores["financial_fraud"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["financial_fraud"].append(s)

                # Account Takeover: INSTALL_REMOTE_SOFTWARE, SHARE_SCREEN
                if (
                    s.signal_type in [
                        f"ACTION_{ActionType.INSTALL_REMOTE_SOFTWARE.value}",
                        f"ACTION_{ActionType.SHARE_SCREEN.value}",
                    ]
                    or "REMOTE" in s.signal_type
                    or "SCREEN" in s.signal_type
                    or "SOFTWARE" in s.signal_type
                    or "PASSWORD" in s.signal_type
                ):
                    dim_scores["account_takeover"] = max(dim_scores["account_takeover"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["account_takeover"].append(s)

                # Credential Theft: DISCLOSE_CREDENTIAL
                if (
                    s.signal_type == f"ACTION_{ActionType.DISCLOSE_CREDENTIAL.value}"
                    or "CREDENTIAL" in s.signal_type
                    or "OTP" in s.signal_type
                ):
                    dim_scores["credential_theft"] = max(dim_scores["credential_theft"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["credential_theft"].append(s)

                # Verification Bypass: BYPASS_POLICY
                if (
                    s.signal_type == f"ACTION_{ActionType.BYPASS_POLICY.value}"
                    or "BYPASS" in s.signal_type
                ):
                    dim_scores["verification_bypass"] = max(dim_scores["verification_bypass"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["verification_bypass"].append(s)
            elif s.category == SignalCategory.INTENT:
                if "OTP" in s.signal_type or "CREDENTIAL" in s.signal_type:
                    dim_scores["credential_theft"] = max(dim_scores["credential_theft"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["credential_theft"].append(s)
                elif "MONEY" in s.signal_type or "PAYMENT" in s.signal_type or "BANK" in s.signal_type:
                    dim_scores["financial_fraud"] = max(dim_scores["financial_fraud"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["financial_fraud"].append(s)
                elif "REMOTE" in s.signal_type or "PASSWORD" in s.signal_type or "SOFTWARE" in s.signal_type:
                    dim_scores["account_takeover"] = max(dim_scores["account_takeover"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["account_takeover"].append(s)
                elif "BYPASS" in s.signal_type:
                    dim_scores["verification_bypass"] = max(dim_scores["verification_bypass"], s.raw_value * 100.0 * eff_conf)
                    dim_signals["verification_bypass"].append(s)

            if s.raw_value > 0.60 and eff_conf > 0.60:
                active_threat_signals += 1

            weighted_sum += (s.raw_value * 100.0) * eff_conf * w
            total_weight += eff_conf * w
            confidence_sum += eff_conf

        corrob_multiplier = 1.0
        if total_weight == 0.0:
            overall_score = None
            dim_scores["overall"] = None
            avg_confidence = 0.0
            uncertainty = 1.0
        else:
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

            base_overall = weighted_sum / total_weight
            overall_score = round(min(100.0, max(0.0, base_overall * corrob_multiplier)), 1)
            dim_scores["overall"] = overall_score
            avg_confidence = round(confidence_sum / max(1, len(signals)), 3) if signals else 0.0
            uncertainty = round(1.0 - avg_confidence, 3)

        for k in dim_scores:
            if dim_scores[k] is not None:
                dim_scores[k] = round(min(100.0, max(0.0, dim_scores[k])), 1)

        dimensions = RiskDimensions(**dim_scores)

        # Build fine-grained provenance for each of the 10 dimensions
        provenance: Dict[str, DimensionProvenance] = {}
        for dim_name, default_meta in DETECTOR_PROVENANCE_DEFAULTS.items():
            if dim_name == "overall":
                if overall_score is not None:
                    evidence = [
                        f"{active_threat_signals} active threat signals cross-correlated with corroboration multiplier {corrob_multiplier:.2f}x"
                    ]
                    provenance["overall"] = DimensionProvenance(
                        dimension="overall",
                        score=overall_score,
                        confidence=avg_confidence,
                        status="AVAILABLE",
                        source_detector=default_meta[0],
                        model_version=default_meta[1],
                        evidence=evidence,
                        timestamp=now_iso
                    )
                else:
                    provenance["overall"] = DimensionProvenance(
                        dimension="overall",
                        score=None,
                        confidence=0.0,
                        status="INSUFFICIENT_DATA",
                        source_detector=default_meta[0],
                        model_version=default_meta[1],
                        evidence=["Insufficient or uncalibrated multi-modal signals to compute overall risk"],
                        timestamp=now_iso
                    )
            else:
                sigs = dim_signals.get(dim_name, [])
                score_val = dim_scores.get(dim_name, 0.0)
                if sigs:
                    conf_val = round(max((s.calibrated_confidence for s in sigs), default=0.0), 3)
                    ev: List[str] = []
                    for s in sigs:
                        if s.evidence_cues:
                            ev.extend(s.evidence_cues)
                        else:
                            ev.append(f"{s.signal_type} (raw={s.raw_value:.2f}, conf={s.calibrated_confidence:.2f})")
                    model_ver = sigs[0].model_id if (sigs and sigs[0].model_id) else default_meta[1]
                    avg_pen = sum(s.uncertainty_penalty for s in sigs) / len(sigs)
                    status_str = "DEGRADED" if avg_pen > 0.50 else "AVAILABLE"
                    provenance[dim_name] = DimensionProvenance(
                        dimension=dim_name,
                        score=score_val,
                        confidence=conf_val,
                        status=status_str,
                        source_detector=default_meta[0],
                        model_version=model_ver,
                        evidence=ev[:5],
                        timestamp=now_iso
                    )
                else:
                    provenance[dim_name] = DimensionProvenance(
                        dimension=dim_name,
                        score=0.0,
                        confidence=0.0,
                        status="NOT_EVALUATED",
                        source_detector=default_meta[0],
                        model_version=default_meta[1],
                        evidence=["No active detector signals routed to this dimension."],
                        timestamp=now_iso
                    )

        self.last_provenance = provenance
        return dimensions, overall_score, avg_confidence, uncertainty, provenance

    @staticmethod
    def classify_risk_level(score: Optional[float], confidence: float) -> RiskLevel:
        """
        Classifies risk level based on score and confidence thresholding.
        """
        if score is None or confidence < 0.35:
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
