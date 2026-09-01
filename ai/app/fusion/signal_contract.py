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
    IntentCategory
)


class CanonicalSignalBus:
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

            # Speaker Biometrics
            if acoustic.speaker.status == SpeakerVerificationStatus.MISMATCH:
                spk_val = 0.85
                spk_sev = RiskSeverity.HIGH
            elif acoustic.speaker.status == SpeakerVerificationStatus.MATCH:
                spk_val = 0.05
                spk_sev = RiskSeverity.LOW
            else:
                spk_val = 0.30
                spk_sev = RiskSeverity.MEDIUM

            spk_conf = acoustic.speaker.confidence if acoustic.speaker.confidence is not None else 0.50
            signals.append(CanonicalRiskSignal(
                signal_id=f"sig_spk_{call_id}_{now_ms}",
                call_id=call_id,
                source_phase="PHASE_3_ACOUSTIC",
                category=SignalCategory.IDENTITY,
                signal_type="SPEAKER_VERIFICATION_MISMATCH",
                raw_value=spk_val,
                calibrated_confidence=float(spk_conf),
                quality_score=quality_score,
                uncertainty_penalty=q_penalty,
                severity=spk_sev,
                evidence_cues=acoustic.speaker.explainability,
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
            se_score = conversational.social_engineering.attack_sequence_score
            signals.append(CanonicalRiskSignal(
                signal_id=f"sig_se_{call_id}_{now_ms}",
                call_id=call_id,
                source_phase="PHASE_4_CONVERSATIONAL",
                category=SignalCategory.SOCIAL_ENGINEERING,
                signal_type=f"ATTACK_PROGRESSION_{conversational.social_engineering.progression_state.value}",
                raw_value=float(se_score),
                calibrated_confidence=conversational.social_engineering.confidence * asr_conf,
                quality_score=asr_conf,
                uncertainty_penalty=asr_unc,
                severity=RiskSeverity.HIGH if se_score > 0.60 else RiskSeverity.LOW,
                evidence_cues=conversational.social_engineering.explainability,
                model_id=conversational.social_engineering.model_version,
                timestamp_ms=now_ms
            ))

        return signals
