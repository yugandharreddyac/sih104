"""
Unified Multi-Modal Pipeline Orchestrator (Phase 6.6)
Coordinates Audio Validation, Multilingual Routing, Streaming Neural ASR,
Biometric Speaker Verification, Deepfake Detection, Replay Defense,
Conversational Intelligence, and 10-Dimensional Cross-Risk Fusion.

Guarantees:
- Strict failure isolation: A failure in one module never terminates active call sessions.
- Session memory bounding and multi-call isolation.
- Fully explainable telemetry with exact model status reporting.
"""

import base64
import time
import logging
from datetime import datetime, timezone
import numpy as np
from typing import Dict, List, Optional, Any, Tuple

from ai.app.core.types import (
    AudioChunkPayload,
    LanguageCode,
    RiskLevel,
    DeepfakeStatus,
    SpeakerVerificationStatus,
    ReplayStatus,
    AudioQualityRating,
    AudioQualityResult,
    VADState,
    PipelineStatus,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    UnifiedRiskFusionResult,
    DeepfakeAnalysisResult,
    SpeakerVerificationResult,
    ReplayAnalysisResult,
    ManipulationAnalysisResult,
    ASRResult,
    IntentResult,
    SensitiveDataResult,
    SocialEngineeringResult,
    RequestedActionResult,
    CallerClaim,
    ConversationPhase
)
from ai.app.audio.vad import VoiceActivityDetector
from ai.app.audio.quality import AudioQualityAnalyzer
from ai.app.deepfake.detector import DeepfakeDetector
from ai.app.speaker.verifier import SpeakerVerifier
from ai.app.replay.detector import ReplayDetector
from ai.app.audio.manipulation import AudioManipulationDetector
from ai.app.audio.temporal_aggregator import TemporalAggregator

from ai.app.asr.language import LanguageIdentifier
from ai.app.asr.transcriber import StreamingASRTranscriber
from ai.app.intent.classifier import ConversationalIntentClassifier
from ai.app.sensitive_data.detector import SensitiveDataDetector
from ai.app.social_engineering.detector import SocialEngineeringDetector
from ai.app.action.extractor import RequestedActionExtractor
from ai.app.claims.extractor import CallerClaimExtractor
from ai.app.claims.verifier import ConversationInconsistencyVerifier
from ai.app.conversation.context import ConversationContextEngine
from ai.app.conversation.memory import ConversationMemoryManager
from ai.app.fusion.engine import MultiModalRiskFusionEngine
from ai.app.pipeline.types import UnifiedPipelineResult

logger = logging.getLogger("voxshield.pipeline.orchestrator")


class UnifiedPipelineOrchestrator:
    def __init__(self, target_sample_rate: int = 16000):
        self.sample_rate = target_sample_rate

        # 1. Acoustic & Biometric Engines
        self.vad = VoiceActivityDetector(sample_rate=target_sample_rate)
        self.quality = AudioQualityAnalyzer(sample_rate=max(8000, min(48000, target_sample_rate)))
        self.deepfake = DeepfakeDetector(sample_rate=target_sample_rate)
        self.speaker = SpeakerVerifier(sample_rate=target_sample_rate)
        self.replay = ReplayDetector(sample_rate=target_sample_rate)
        self.manipulation = AudioManipulationDetector(sample_rate=target_sample_rate)
        self.temporal_aggregator = TemporalAggregator()

        # 2. Multilingual & Conversational Engines
        self.language_router = LanguageIdentifier()
        self.asr = StreamingASRTranscriber(sample_rate=target_sample_rate)
        self.intent_classifier = ConversationalIntentClassifier()
        self.sensitive_data_detector = SensitiveDataDetector()
        self.social_eng_detector = SocialEngineeringDetector()
        self.action_extractor = RequestedActionExtractor()
        self.claims_extractor = CallerClaimExtractor()
        self.inconsistency_verifier = ConversationInconsistencyVerifier()
        self.conversation_context = ConversationContextEngine()

        # 3. Decision Intelligence
        self.risk_fusion = MultiModalRiskFusionEngine()

    def decode_and_validate_audio(self, audio_base64: Optional[str]) -> Tuple[np.ndarray, Optional[str]]:
        """
        Safely decodes and validates linear PCM payload into float32 array [-1.0, 1.0].
        Protects against NaN, Inf, empty, or malformed data.
        """
        if not audio_base64:
            return np.zeros(0, dtype=np.float32), "Empty audio payload"

        try:
            raw_bytes = base64.b64decode(audio_base64)
            if len(raw_bytes) < 2:
                return np.zeros(0, dtype=np.float32), "Audio payload too short (< 2 bytes)"

            # Ensure even length for int16 buffer
            if len(raw_bytes) % 2 != 0:
                raw_bytes = raw_bytes[:len(raw_bytes) - 1]

            int16_samples = np.frombuffer(raw_bytes, dtype=np.int16)
            float_samples = int16_samples.astype(np.float32) / 32768.0

            # Finite value sanity check
            if not np.all(np.isfinite(float_samples)):
                float_samples = np.nan_to_num(float_samples, nan=0.0, posinf=1.0, neginf=-1.0)

            return float_samples.copy(), None
        except Exception as exc:
            return np.zeros(0, dtype=np.float32), f"Malformed audio decoding fault: {exc}"

    def process_chunk(
        self,
        chunk: AudioChunkPayload,
        language_hint: Optional[str] = None
    ) -> UnifiedPipelineResult:
        """
        Executes end-to-end multi-modal pipeline on an incoming audio chunk with complete failure isolation.
        """
        start_time = time.perf_counter()
        now_iso = datetime.now(timezone.utc).isoformat()
        component_statuses: Dict[str, str] = {}
        component_errors: Dict[str, str] = {}
        explainability: List[str] = []

        call_id = chunk.call_id or "default-call"
        stream_id = chunk.stream_id or call_id
        chunk_idx = chunk.chunk_index

        # =====================================================================
        # Step 1: Audio Validation & Preprocessing
        # =====================================================================
        samples, val_err = self.decode_and_validate_audio(chunk.audio_base64)
        if val_err:
            component_errors["audio_validation"] = val_err
            explainability.append(f"Audio validation note: {val_err}")

        duration_ms = (len(samples) / self.sample_rate) * 1000.0 if len(samples) > 0 else 0.0

        # VAD & Audio Quality
        try:
            vad_res = self.vad.process_samples(samples)
            component_statuses["vad"] = "AVAILABLE"
        except Exception as exc:
            component_errors["vad"] = str(exc)
            component_statuses["vad"] = "ERROR"
            vad_res = None

        try:
            quality_res = self.quality.analyze_samples(samples, duration_ms=duration_ms)
            component_statuses["audio_quality"] = "AVAILABLE"
        except Exception as exc:
            component_errors["audio_quality"] = str(exc)
            component_statuses["audio_quality"] = "ERROR"
            quality_res = AudioQualityResult(
                rating=AudioQualityRating.DEGRADED,
                rms_dbfs=-40.0,
                peak_amplitude=0.5,
                clipping_ratio=0.0,
                silence_ratio=0.0,
                snr_estimate_db=15.0,
                dynamic_range_db=15.0,
                sample_rate=self.sample_rate,
                channels=1,
                duration_ms=duration_ms,
                uncertainty_penalty=0.20,
                notes="Fallback quality assessment."
            )

        # =====================================================================
        # Step 2 & 3: Language Routing & Streaming Neural ASR
        # =====================================================================
        try:
            asr_res = self.asr.transcribe(chunk, quality=quality_res, language_hint=language_hint)
            component_statuses["asr"] = "AVAILABLE"
            transcript = asr_res.transcript or ""
            redacted_transcript = asr_res.redacted_transcript or transcript
            asr_conf = asr_res.confidence if asr_res.confidence is not None else 0.85
            asr_unc = asr_res.uncertainty if asr_res.uncertainty is not None else 0.15
        except Exception as exc:
            component_errors["asr"] = str(exc)
            component_statuses["asr"] = "ERROR"
            transcript = ""
            redacted_transcript = ""
            asr_conf = 0.0
            asr_unc = 1.0
            # Use module-level imports (ASRResult, PipelineStatus already imported at top)
            asr_res = ASRResult(
                status=PipelineStatus.MODEL_UNAVAILABLE,
                model_version="whisper_base_int8",
                transcript="",
                redacted_transcript="",
                language=LanguageCode.EN,
                language_confidence=0.0,
                word_count=0,
                confidence=0.0,
                uncertainty=1.0,
                is_final=False
            )

        # Multilingual Language Routing Decision
        try:
            lang_decision = self.language_router.route_language(
                explicit_hint=language_hint,
                text_content=transcript,
                session_id=call_id
            )
            component_statuses["language_router"] = "AVAILABLE"
        except Exception as exc:
            component_errors["language_router"] = str(exc)
            component_statuses["language_router"] = "ERROR"
            meta = self.language_router.LANGUAGE_METADATA[LanguageCode.EN_IN]
            from ai.app.asr.language import LanguageRoutingDecision
            lang_decision = LanguageRoutingDecision(
                language_code=LanguageCode.EN_IN,
                display_name=meta["display_name"],
                asr_language_hint=meta["asr_hint"],
                confidence=0.50,
                detection_source="fallback",
                primary_language=LanguageCode.EN_IN,
                is_fallback=True
            )

        # =====================================================================
        # Step 4: NLP Conversational Intelligence
        # =====================================================================
        try:
            intent_res = self.intent_classifier.classify(transcript)
            sensitive_res = self.sensitive_data_detector.detect_situations(transcript)
            redacted_transcript = sensitive_res.redacted_preview
            social_eng_res = self.social_eng_detector.analyze_tactics(
                text_transcript=transcript,
                current_intent=intent_res.primary_intent,
                contains_secret_request=sensitive_res.contains_direct_request,
                asr_confidence=asr_conf
            )
            actions_res = self.action_extractor.extract_action(transcript)
            claims = self.claims_extractor.extract_claims(transcript, turn_index=chunk_idx)

            conv_phase = self.conversation_context.process_turn(
                call_id=call_id,
                turn_index=chunk_idx,
                speaker_channel=chunk.speaker_channel,
                transcript=transcript,
                redacted_transcript=redacted_transcript,
                timestamp_ms=chunk.timestamp_ms or 0,
                intent=intent_res.primary_intent,
                tactics=social_eng_res.tactics_detected,
                sensitive_findings=sensitive_res.findings,
                requested_action_type=actions_res.action_type.value
            )

            memory = ConversationMemoryManager.get(call_id)
            all_turns_text = memory.get_full_transcript_text(redacted=False) if memory else transcript
            inconsistencies = self.inconsistency_verifier.verify_inconsistencies(claims, all_turns_text)

            conv_result = ConversationalIntelligenceResult(
                call_id=call_id,
                stream_id=stream_id,
                turn_index=chunk_idx,
                timestamp=now_iso,
                asr=asr_res or ASRResult(
                    status=PipelineStatus.AVAILABLE,
                    model_version="whisper_streaming_conformer_v4",
                    transcript=transcript,
                    redacted_transcript=redacted_transcript,
                    language=lang_decision.language_code,
                    confidence=asr_conf,
                    uncertainty=asr_unc,
                    inference_latency_ms=0.0
                ),
                intent=intent_res,
                sensitive_data=sensitive_res,
                social_engineering=social_eng_res,
                requested_action=actions_res,
                caller_claims=claims,
                inconsistencies=inconsistencies,
                current_phase=conv_phase,
                total_nlp_latency_ms=0.0,
                evidence_summary=[]
            )
            component_statuses["conversational_intelligence"] = "AVAILABLE"
        except Exception as exc:
            component_errors["conversational_intelligence"] = str(exc)
            component_statuses["conversational_intelligence"] = "ERROR"
            conv_result = None

        # =====================================================================
        # Step 5: Acoustic & Biometric Verification
        # =====================================================================
        # Deepfake / Anti-Spoof
        try:
            deepfake_res = self.deepfake.analyze(chunk, quality=quality_res)
            component_statuses["deepfake_detector"] = "AVAILABLE"
            if deepfake_res.explainability:
                explainability.extend(deepfake_res.explainability)
        except Exception as exc:
            component_errors["deepfake_detector"] = str(exc)
            component_statuses["deepfake_detector"] = "ERROR"
            deepfake_res = DeepfakeAnalysisResult(
                status=DeepfakeStatus.MODEL_UNAVAILABLE,
                spoof_score=None,
                confidence=0.0,
                uncertainty=1.0,
                spectral_flatness_anomaly=False,
                vocoder_distortion_score=0.0,
                lfcc_anomaly_score=0.0,
                artifacts_detected=[],
                model_version=self.deepfake.model_id,
                explainability=[f"Deepfake detector fault: {exc}"],
                inference_latency_ms=0.0
            )

        # Speaker Verification
        try:
            speaker_res = self.speaker.verify_speaker(chunk, claimed_speaker_id=chunk.claimed_speaker_id, quality=quality_res)
            component_statuses["speaker_verifier"] = "AVAILABLE"
            if speaker_res.explainability:
                explainability.extend(speaker_res.explainability)
        except Exception as exc:
            component_errors["speaker_verifier"] = str(exc)
            component_statuses["speaker_verifier"] = "ERROR"
            speaker_res = SpeakerVerificationResult(
                status=SpeakerVerificationStatus.MODEL_UNAVAILABLE,
                similarity_score=None,
                confidence=0.0,
                is_enrolled=False,
                enrolled_speaker_id=chunk.claimed_speaker_id,
                threshold_applied=0.88,
                model_version=self.speaker.model_id,
                explainability=[f"Speaker verification fault: {exc}"],
                inference_latency_ms=0.0
            )

        # Replay Detector
        try:
            replay_res = self.replay.detect_replay(chunk, quality=quality_res)
            component_statuses["replay_detector"] = "AVAILABLE"
        except Exception as exc:
            component_errors["replay_detector"] = str(exc)
            component_statuses["replay_detector"] = "ERROR"
            replay_res = ReplayAnalysisResult(
                status=ReplayStatus.MODEL_UNAVAILABLE,
                replay_probability=None,
                confidence=0.0,
                high_frequency_loss=False,
                reverberation_decay_anomaly=False,
                model_version=self.replay.model_id,
                explainability=[f"Replay detector fault: {exc}"],
                inference_latency_ms=0.0
            )

        # Transport / Manipulation
        try:
            manipulation_res = self.manipulation.analyze(samples)
            component_statuses["manipulation_detector"] = "AVAILABLE"
        except Exception as exc:
            component_errors["manipulation_detector"] = str(exc)
            component_statuses["manipulation_detector"] = "ERROR"
            manipulation_res = ManipulationAnalysisResult(
                level="NO_INDICATOR",
                confidence=0.50,
                indicators=[]
            )

        # Temporal Aggregation
        session = self.temporal_aggregator.get_or_create_session(stream_id)
        is_speech = (vad_res.state == VADState.SPEECH) if vad_res else True
        session.push_chunk(duration_sec=duration_ms / 1000.0, is_speech=is_speech, spoof_score=deepfake_res.spoof_score)
        temporal_metrics = session.get_metrics()

        overall_acoustic_assessment = self.temporal_aggregator.aggregate_overall_assessment(
            deepfake=deepfake_res,
            speaker_status=speaker_res.status,
            replay_status=replay_res.status,
            manipulation_level=manipulation_res.level,
            is_warmed_up=temporal_metrics.is_warmed_up
        )

        fallback_vad = vad_res or VADResult(
            state=VADState.SPEECH,
            speech_probability=0.90,
            energy_rms=0.05,
            zero_crossing_rate=0.1,
            spectral_centroid=1500.0,
            confidence=0.85,
            processing_latency_ms=0.0
        )

        acoustic_result = AcousticIntelligenceResult(
            call_id=call_id,
            stream_id=stream_id,
            chunk_index=chunk_idx,
            timestamp=now_iso,
            overall_assessment=overall_acoustic_assessment,
            deepfake=deepfake_res,
            speaker=speaker_res,
            replay=replay_res,
            manipulation=manipulation_res,
            vad=fallback_vad,
            quality=quality_res,
            temporal_metrics=temporal_metrics,
            evidence_summary=explainability,
            total_ai_latency_ms=0.0
        )

        # =====================================================================
        # Step 6: 10-Dimensional Multi-Modal Risk Fusion & Policy Evaluation
        # =====================================================================
        try:
            fusion_result: UnifiedRiskFusionResult = self.risk_fusion.evaluate_risk(
                call_id=call_id,
                acoustic=acoustic_result,
                conversational=conv_result,
                stream_id=stream_id,
                turn_index=chunk_idx
            )
            component_statuses["risk_fusion"] = "AVAILABLE"
        except Exception as exc:
            component_errors["risk_fusion"] = str(exc)
            component_statuses["risk_fusion"] = "ERROR"
            from ai.app.core.types import RiskDimensions, EvidenceGraph, HumanDecisionState  # noqa: PLC0415
            fusion_result = UnifiedRiskFusionResult(
                status=PipelineStatus.ERROR,
                call_id=call_id,
                stream_id=stream_id,
                turn_index=chunk_idx,
                overall_risk_score=50.0,
                risk_level=RiskLevel.INCONCLUSIVE,
                confidence=0.20,
                uncertainty=0.80,
                dimensions=RiskDimensions(),
                risk_velocity=0.0,
                risk_trajectory_trend="STABLE",
                primary_drivers=[f"Risk fusion operational fault: {exc}"],
                evidence_graph=EvidenceGraph(nodes=[], edges=[]),
                policy_recommendation=None,
                human_workflow_state=HumanDecisionState.AI_RECOMMENDED,
                fusion_latency_ms=0.0,
                timestamp=now_iso
            )

        total_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        # Build risk dimensions dictionary
        dim_dict = {}
        if fusion_result.dimensions:
            for k in [
                "acoustic_spectral", "biometric_speaker", "replay_channel",
                "transport_manipulation", "linguistic_language", "intent_adversarial",
                "sensitive_data_request", "social_engineering_tactic", "requested_action",
                "situational_inconsistency"
            ]:
                dim_dict[k] = getattr(fusion_result.dimensions, k, 0.0)

        # Recommendation
        policy_rec = fusion_result.policy_recommendation
        if hasattr(policy_rec, "action"):
            rec_str = str(policy_rec.action.value)
        elif isinstance(policy_rec, str):
            rec_str = policy_rec
        else:
            rec_str = None

        return UnifiedPipelineResult(
            call_id=call_id,
            stream_id=stream_id,
            chunk_index=chunk_idx,
            timestamp=now_iso,
            language_code=lang_decision.language_code,
            language_display=lang_decision.display_name,
            language_confidence=lang_decision.confidence,
            language_source=lang_decision.detection_source,
            mixed_language_detected=lang_decision.mixed_language_detected,
            transcript=transcript,
            redacted_transcript=redacted_transcript,
            asr_confidence=asr_conf,
            asr_uncertainty=asr_unc,
            asr_engine_status=component_statuses.get("asr", "AVAILABLE"),
            speaker_status=speaker_res.status,
            speaker_similarity_score=speaker_res.similarity_score,
            speaker_confidence=speaker_res.confidence,
            speaker_claimed_id=chunk.claimed_speaker_id,
            speaker_engine_status=component_statuses.get("speaker_verifier", "AVAILABLE"),
            deepfake_status=deepfake_res.status,
            deepfake_spoof_score=deepfake_res.spoof_score,
            deepfake_confidence=deepfake_res.confidence,
            deepfake_artifacts=deepfake_res.artifacts_detected or [],
            deepfake_engine_status=component_statuses.get("deepfake_detector", "AVAILABLE"),
            replay_status=replay_res.status,
            replay_score=replay_res.replay_probability,
            audio_quality_rating=quality_res.rating if quality_res else AudioQualityRating.GOOD,
            vad_state=vad_res.state if vad_res else VADState.SPEECH,
            overall_risk_score=fusion_result.overall_risk_score,
            risk_level=fusion_result.risk_level,
            risk_confidence=fusion_result.confidence,
            risk_uncertainty=fusion_result.uncertainty,
            risk_dimensions=dim_dict,
            risk_velocity=fusion_result.risk_velocity,
            risk_trajectory_trend=fusion_result.risk_trajectory_trend,
            policy_recommendation=rec_str,
            component_statuses=component_statuses,
            component_errors=component_errors,
            pipeline_latency_ms=total_latency_ms,
            explainability=explainability
        )

    def clear_call_session(self, call_id: str) -> None:
        """Cleans up memory state associated with a finished call session."""
        self.language_router.context_tracker.clear_session(call_id)
        self.temporal_aggregator.remove_session(call_id)
        ConversationMemoryManager.remove(call_id)
