"""
Canonical Signal Bus & Normalizer (Phase 5A)
Ingests and normalizes unstructured and structured signals from Phases 2, 3, and 4.
"""

import time
from typing import List, Optional
from ai.app.core.types import (
    CanonicalRiskSignal,
    SignalCategory,
    RiskSeverity,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ReplayStatus,
    IntentCategory,
    ActionType,
    SocialEngineeringTactic,
    AttackProgressionState
)
from ai.app.context.inconsistency import InconsistencyVerifier


class CanonicalSignalBus:
    def __init__(self):
        self.inconsistency_verifier = InconsistencyVerifier()
    def normalize_signals(
        self,
        call_id: str,
        acoustic: Optional[AcousticIntelligenceResult],
        conversational: Optional[ConversationalIntelligenceResult]
    ) -> List[CanonicalRiskSignal]:
        """
        Transforms heterogeneous upstream payloads into strongly typed CanonicalRiskSignal instances.
        """
        signals: List[CanonicalRiskSignal] = []
        now_ms = int(time.time() * 1000)

        # 1. Acoustic Signals (Phases 2 & 3)
        if acoustic:
            # VAD / Signal Quality
            q_penalty = acoustic.quality.uncertainty_penalty
            quality_score = max(0.0, 1.0 - q_penalty)

            # Deepfake Signal
            df_score = acoustic.deepfake.spoof_score if acoustic.deepfake.spoof_score is not None else 0.0
            df_conf = acoustic.deepfake.confidence if acoustic.deepfake.confidence is not None else 0.50
            signals.append(CanonicalRiskSignal(
                signal_id=f"sig_df_{call_id}_{now_ms}",
                call_id=call_id,
                source_phase="PHASE_3_ACOUSTIC",
                category=SignalCategory.ACOUSTIC,
                signal_type="DEEPFAKE_SPOOF_SCORE",
                raw_value=float(df_score),
                calibrated_confidence=float(df_conf),
                quality_score=quality_score,
                uncertainty_penalty=q_penalty,
                severity=RiskSeverity.HIGH if df_score > 0.60 else RiskSeverity.LOW,
                evidence_cues=acoustic.deepfake.explainability,
                model_id=acoustic.deepfake.model_version,
                timestamp_ms=now_ms
            ))

            # Speaker Biometrics (BUG E Fix: Calibration for Unenrolled Claimed Identity)
            claimed_id = acoustic.speaker.enrolled_speaker_id
            if not claimed_id and acoustic.speaker.explainability:
                for exp in acoustic.speaker.explainability:
                    if "Speaker identity '" in exp:
                        claimed_id = exp.split("Speaker identity '")[1].split("'")[0]
                        break
                    elif "claimed" in exp.lower() and "'" in exp:
                        parts = exp.split("'")
                        if len(parts) >= 2:
                            claimed_id = parts[1]
                            break
            if not claimed_id and conversational and conversational.caller_claims:
                claimed_id = getattr(conversational.caller_claims[0], "claimed_identity", None)

            has_claimed_id = bool(claimed_id)
            spk_cues = list(acoustic.speaker.explainability or [])

            if acoustic.speaker.status == SpeakerVerificationStatus.MISMATCH:
                spk_val = 0.85
                spk_conf = acoustic.speaker.confidence if (acoustic.speaker.confidence is not None and acoustic.speaker.confidence > 0.0) else 0.85
                spk_sev = RiskSeverity.HIGH
                spk_type = "SPEAKER_VERIFICATION_MISMATCH"
            elif acoustic.speaker.status == SpeakerVerificationStatus.MATCH:
                spk_val = 0.05
                spk_conf = acoustic.speaker.confidence if (acoustic.speaker.confidence is not None and acoustic.speaker.confidence > 0.0) else 0.85
                spk_sev = RiskSeverity.LOW
                spk_type = "SPEAKER_VERIFICATION_MATCH"
            elif acoustic.speaker.status == SpeakerVerificationStatus.NOT_ENROLLED:
                if has_claimed_id:
                    # An unenrolled speaker claiming a specific identity represents an unverified identity claim.
                    # Under zero-trust security, "cannot verify" must not be treated as "verified safe" (0.0).
                    # A moderate raw value (0.50) with lower confidence (0.55) reflects genuine uncertainty,
                    # ensuring the identity_impersonation dimension activates with an elevated warning
                    # rather than falsely reading as confirmed safe (0.0).
                    spk_val = 0.50
                    spk_conf = acoustic.speaker.confidence if (acoustic.speaker.confidence is not None and acoustic.speaker.confidence > 0.0) else 0.55
                    spk_sev = RiskSeverity.MEDIUM
                    spk_type = "SPEAKER_NOT_ENROLLED_CLAIMED_IDENTITY"
                    if not spk_cues:
                        spk_cues = [f"Claimed speaker identity '{claimed_id}' has no biometric enrollment; unverified identity claim."]
                else:
                    spk_val = 0.0
                    spk_conf = acoustic.speaker.confidence if (acoustic.speaker.confidence is not None and acoustic.speaker.confidence > 0.0) else 0.50
                    spk_sev = RiskSeverity.LOW
                    spk_type = "SPEAKER_NOT_ENROLLED_NO_CLAIM"
            else:
                if has_claimed_id:
                    spk_val = 0.40
                    spk_conf = acoustic.speaker.confidence if (acoustic.speaker.confidence is not None and acoustic.speaker.confidence > 0.0) else 0.50
                    spk_sev = RiskSeverity.MEDIUM
                    spk_type = f"SPEAKER_{acoustic.speaker.status.value}_CLAIMED_IDENTITY"
                else:
                    spk_val = 0.0
                    spk_conf = acoustic.speaker.confidence if (acoustic.speaker.confidence is not None and acoustic.speaker.confidence > 0.0) else 0.50
                    spk_sev = RiskSeverity.LOW
                    spk_type = f"SPEAKER_{acoustic.speaker.status.value}"

            signals.append(CanonicalRiskSignal(
                signal_id=f"sig_spk_{call_id}_{now_ms}",
                call_id=call_id,
                source_phase="PHASE_3_ACOUSTIC",
                category=SignalCategory.IDENTITY,
                signal_type=spk_type,
                raw_value=float(spk_val),
                calibrated_confidence=float(spk_conf),
                quality_score=quality_score,
                uncertainty_penalty=q_penalty,
                severity=spk_sev,
                evidence_cues=spk_cues,
                model_id=acoustic.speaker.model_version,
                timestamp_ms=now_ms
            ))

            # Replay Signal
            rp_val = acoustic.replay.replay_probability if acoustic.replay.replay_probability is not None else 0.0
            rp_conf = acoustic.replay.confidence if acoustic.replay.confidence is not None else 0.50
            signals.append(CanonicalRiskSignal(
                signal_id=f"sig_rp_{call_id}_{now_ms}",
                call_id=call_id,
                source_phase="PHASE_3_ACOUSTIC",
                category=SignalCategory.REPLAY,
                signal_type="REPLAY_ATTACK_PROBABILITY",
                raw_value=float(rp_val),
                calibrated_confidence=float(rp_conf),
                quality_score=quality_score,
                uncertainty_penalty=q_penalty,
                severity=RiskSeverity.HIGH if rp_val > 0.65 else RiskSeverity.LOW,
                evidence_cues=acoustic.replay.explainability,
                model_id=acoustic.replay.model_version,
                timestamp_ms=now_ms
            ))

        # 2. Conversational Signals (Phase 4)
        if conversational:
            asr_conf = conversational.asr.confidence
            asr_unc = conversational.asr.uncertainty

            # Intent Signal
            intent_val = 0.90 if conversational.intent.is_adversarial else 0.05
            signals.append(CanonicalRiskSignal(
                signal_id=f"sig_intent_{call_id}_{now_ms}",
                call_id=call_id,
                source_phase="PHASE_4_CONVERSATIONAL",
                category=SignalCategory.INTENT,
                signal_type=f"INTENT_{conversational.intent.primary_intent.value}",
                raw_value=intent_val,
                calibrated_confidence=conversational.intent.confidence * asr_conf,
                quality_score=asr_conf,
                uncertainty_penalty=asr_unc,
                severity=RiskSeverity.HIGH if conversational.intent.is_adversarial else RiskSeverity.LOW,
                evidence_cues=conversational.intent.evidence_cues,
                model_id="intent_classifier_contextual_v4",
                timestamp_ms=now_ms
            ))

            # Sensitive Data Signal
            if conversational.sensitive_data.contains_direct_request:
                signals.append(CanonicalRiskSignal(
                    signal_id=f"sig_secret_{call_id}_{now_ms}",
                    call_id=call_id,
                    source_phase="PHASE_4_CONVERSATIONAL",
                    category=SignalCategory.SENSITIVE_DATA,
                    signal_type="CREDENTIAL_DIRECT_REQUEST",
                    raw_value=0.95,
                    calibrated_confidence=0.92 * asr_conf,
                    quality_score=asr_conf,
                    uncertainty_penalty=asr_unc,
                    severity=RiskSeverity.CRITICAL,
                    evidence_cues=["Direct solicitation of one-time password or confidential PIN"],
                    model_id="sensitive_data_detector_v4",
                    timestamp_ms=now_ms
                ))

            # Social Engineering Progression Signal
            se = conversational.social_engineering
            se_score = se.attack_sequence_score
            signals.append(CanonicalRiskSignal(
                signal_id=f"sig_se_{call_id}_{now_ms}",
                call_id=call_id,
                source_phase="PHASE_4_CONVERSATIONAL",
                category=SignalCategory.SOCIAL_ENGINEERING,
                signal_type=f"ATTACK_PROGRESSION_{se.progression_state.value}",
                raw_value=float(se_score),
                calibrated_confidence=se.confidence * asr_conf,
                quality_score=asr_conf,
                uncertainty_penalty=asr_unc,
                severity=RiskSeverity.HIGH if se_score > 0.60 else RiskSeverity.LOW,
                evidence_cues=se.explainability,
                model_id=se.model_version,
                timestamp_ms=now_ms
            ))

            # BUG D Fix: Verification Bypass Signal from Social Engineering Detector
            # Surface boolean flag (verification_bypass_detected), tactic list, and state
            has_se_bypass = (
                bool(getattr(se, "verification_bypass_detected", False))
                or (
                    bool(getattr(se, "tactics_detected", None))
                    and any(
                        t == SocialEngineeringTactic.VERIFICATION_BYPASS
                        or getattr(t, "value", t) == "VERIFICATION_BYPASS"
                        for t in se.tactics_detected
                    )
                )
                or "BYPASS" in getattr(se.progression_state, "value", str(se.progression_state))
            )

            if has_se_bypass:
                bypass_score = max(0.85, float(se_score))
                bypass_cues = [
                    cue for cue in se.explainability
                    if any(w in cue.lower() for w in ["bypass", "verif", "authenticat", "skip", "override", "policy"])
                ] or ["Verification / authentication bypass tactic detected in conversational analysis"]

                signals.append(CanonicalRiskSignal(
                    signal_id=f"sig_se_bypass_{call_id}_{now_ms}",
                    call_id=call_id,
                    source_phase="PHASE_4_CONVERSATIONAL",
                    category=SignalCategory.SOCIAL_ENGINEERING,
                    signal_type="SOCIAL_ENGINEERING_VERIFICATION_BYPASS",
                    raw_value=float(bypass_score),
                    calibrated_confidence=float(se.confidence * asr_conf),
                    quality_score=asr_conf,
                    uncertainty_penalty=asr_unc,
                    severity=RiskSeverity.HIGH,
                    evidence_cues=bypass_cues,
                    model_id=se.model_version,
                    timestamp_ms=now_ms
                ))

            # Inconsistency Signal (BUG A Fix: Multi-turn identity/behavioral contradictions)
            inconsistencies = list(conversational.inconsistencies or [])
            if not inconsistencies and (conversational.caller_claims or (conversational.asr and conversational.asr.transcript)):
                claims = conversational.caller_claims or []
                transcript = conversational.asr.transcript if conversational.asr else ""
                detected = self.inconsistency_verifier.verify_inconsistencies(claims, transcript)
                inconsistencies.extend(detected)

            if inconsistencies:
                inconsist_score = self.inconsistency_verifier.compute_inconsistency_score(inconsistencies)
                signals.append(CanonicalRiskSignal(
                    signal_id=f"sig_inconsist_{call_id}_{now_ms}",
                    call_id=call_id,
                    source_phase="PHASE_4_CONVERSATIONAL",
                    category=SignalCategory.INCONSISTENCY,
                    signal_type="CONVERSATIONAL_INCONSISTENCY_DETECTED",
                    raw_value=float(inconsist_score),
                    calibrated_confidence=0.90 * asr_conf,
                    quality_score=asr_conf,
                    uncertainty_penalty=asr_unc,
                    severity=RiskSeverity.CRITICAL if len(inconsistencies) > 1 else RiskSeverity.HIGH,
                    evidence_cues=inconsistencies,
                    model_id="conversation_inconsistency_verifier_v4",
                    timestamp_ms=now_ms
                ))

            # Requested Action Signals (BUG B & C Fix: Financial Fraud, Account Takeover, Credential Theft, Policy Bypass)
            if conversational.requested_action and conversational.requested_action.action_type != ActionType.BENIGN_ACTION:
                act = conversational.requested_action
                act_val = 0.90 if act.is_high_risk else 0.75
                act_conf = act.confidence * asr_conf

                is_critical = act.action_type in [
                    ActionType.TRANSFER_FUNDS,
                    ActionType.CHANGE_BENEFICIARY,
                    ActionType.INSTALL_REMOTE_SOFTWARE,
                    ActionType.SHARE_SCREEN,
                    ActionType.DISCLOSE_CREDENTIAL,
                    ActionType.BYPASS_POLICY,
                ]

                signals.append(CanonicalRiskSignal(
                    signal_id=f"sig_act_{call_id}_{now_ms}",
                    call_id=call_id,
                    source_phase="PHASE_4_CONVERSATIONAL",
                    category=SignalCategory.ACTION,
                    signal_type=f"ACTION_{act.action_type.value}",
                    raw_value=float(act_val),
                    calibrated_confidence=float(act_conf),
                    quality_score=asr_conf,
                    uncertainty_penalty=asr_unc,
                    severity=RiskSeverity.CRITICAL if is_critical else RiskSeverity.HIGH,
                    evidence_cues=[
                        f"Action requested: {act.action_type.value} targeting '{act.target_object}'"
                        if act.target_object
                        else f"Action requested: {act.action_type.value}"
                    ],
                    model_id="action_extractor_v4",
                    timestamp_ms=now_ms
                ))

        return signals
