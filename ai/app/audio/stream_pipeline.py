"""
Streaming Audio Pipeline & Conversational Intelligence Coordinator (Phase 4)
Integrates Acoustic Intelligence, Streaming ASR, Intent Classification,
Sensitive Data Gating, Social Engineering Detection, and Multi-Turn Conversation Memory.
"""

import base64
import time
from datetime import datetime, timezone
import numpy as np
from typing import Dict, Any, Optional, List

from ai.app.core.types import (
    AudioChunkPayload,
    AudioAnalysisEvent,
    AcousticIntelligenceResult,
    ConversationalIntelligenceResult,
    PipelineStatus,
    VADResult,
    VADState,
    AudioQualityResult,
    DeepfakeAnalysisResult,
    SpeakerVerificationResult,
    ReplayAnalysisResult,
    ManipulationAnalysisResult,
    TemporalAggregationMetrics,
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

# Phase 4 Conversational Intelligence Modules
from ai.app.asr.transcriber import StreamingASRTranscriber
from ai.app.intent.classifier import ConversationalIntentClassifier
from ai.app.sensitive_data.detector import SensitiveDataDetector
from ai.app.social_engineering.detector import SocialEngineeringDetector
from ai.app.action.extractor import RequestedActionExtractor
from ai.app.claims.extractor import CallerClaimExtractor
from ai.app.claims.verifier import ConversationInconsistencyVerifier
from ai.app.conversation.context import ConversationContextEngine
from ai.app.conversation.memory import ConversationMemoryManager


class AudioStreamPipeline:
    def __init__(self, target_sample_rate: int = 16000):
        self.sample_rate = target_sample_rate
        self.status = PipelineStatus.AVAILABLE

        # Phase 2/3 Acoustic Intelligence Engines
        self.vad = VoiceActivityDetector(sample_rate=target_sample_rate)
        self.quality = AudioQualityAnalyzer(sample_rate=target_rate_safe(target_sample_rate))
        self.deepfake = DeepfakeDetector(sample_rate=target_sample_rate)
        self.speaker = SpeakerVerifier(sample_rate=target_sample_rate)
        self.replay = ReplayDetector(sample_rate=target_sample_rate)
        self.manipulation = AudioManipulationDetector(sample_rate=target_sample_rate)
        self.temporal_aggregator = TemporalAggregator()

        # Phase 4 Conversational Intelligence Engines
        self.asr = StreamingASRTranscriber(sample_rate=target_sample_rate)
        self.intent_classifier = ConversationalIntentClassifier()
        self.sensitive_data_detector = SensitiveDataDetector()
        self.social_eng_detector = SocialEngineeringDetector()
        self.action_extractor = RequestedActionExtractor()
        self.claims_extractor = CallerClaimExtractor()
        self.inconsistency_verifier = ConversationInconsistencyVerifier()
        self.conversation_context = ConversationContextEngine()

    def decode_pcm_payload(self, audio_base64: Optional[str]) -> np.ndarray:
        """Decodes base64-encoded 16-bit linear PCM into float32 array [-1.0, 1.0]."""
        if not audio_base64:
            return np.zeros(0, dtype=np.float32)
        try:
            raw_bytes = base64.b64decode(audio_base64)
            if len(raw_bytes) < 2:
                return np.zeros(0, dtype=np.float32)
            int16_samples = np.frombuffer(raw_bytes, dtype=np.int16)
            return (int16_samples.astype(np.float32) / 32768.0).copy()
        except Exception:
            return np.zeros(0, dtype=np.float32)

    def process_acoustic_intelligence(self, chunk: AudioChunkPayload) -> AcousticIntelligenceResult:
        """Executes full Phase 3 acoustic and biometric intelligence pipeline."""
        pipeline_start_time = time.perf_counter()

        samples = self.decode_pcm_payload(chunk.audio_base64)
        duration_ms = (len(samples) / self.sample_rate) * 1000.0 if len(samples) > 0 else 0.0

        vad_result = self.vad.process_samples(samples)
        quality_result = self.quality.analyze_samples(samples, duration_ms=duration_ms)
        deepfake_result = self.deepfake.analyze(chunk, quality=quality_result)
        speaker_result = self.speaker.verify_speaker(chunk=chunk, claimed_speaker_id=chunk.claimed_speaker_id, quality=quality_result)
        replay_result = self.replay.detect_replay(chunk, quality=quality_result)
        has_gap = None
        if chunk.metadata:
            if "sequenceGap" in chunk.metadata:
                has_gap = bool(chunk.metadata["sequenceGap"])
            elif "sequence_gap" in chunk.metadata:
                has_gap = bool(chunk.metadata["sequence_gap"])

        manipulation_result = self.manipulation.analyze(
            samples,
            sequence_number=chunk.chunk_index,
            has_sequence_gap=has_gap,
            session_id=chunk.stream_id or chunk.call_id
        )

        stream_id = chunk.stream_id or chunk.call_id
        session = self.temporal_aggregator.get_or_create_session(stream_id)
        is_speech = vad_result.state == VADState.SPEECH
        session.push_chunk(duration_sec=duration_ms / 1000.0, is_speech=is_speech, spoof_score=deepfake_result.spoof_score)
        temporal_metrics = session.get_metrics()

        overall_assessment = self.temporal_aggregator.aggregate_overall_assessment(
            deepfake=deepfake_result,
            speaker_status=speaker_result.status,
            replay_status=replay_result.status,
            manipulation_level=manipulation_result.level,
            is_warmed_up=temporal_metrics.is_warmed_up
        )

        evidence_summary: List[str] = []
        if deepfake_result.explainability:
            evidence_summary.extend(deepfake_result.explainability)
        if speaker_result.explainability:
            evidence_summary.extend(speaker_result.explainability)
        if replay_result.explainability:
            evidence_summary.extend(replay_result.explainability)
        if manipulation_result.indicators:
            evidence_summary.extend([f"Transport/Injection: {i}" for i in manipulation_result.indicators])

        total_latency_ms = round((time.perf_counter() - pipeline_start_time) * 1000.0, 3)

        return AcousticIntelligenceResult(
            call_id=chunk.call_id,
            stream_id=chunk.stream_id,
            chunk_index=chunk.chunk_index,
            timestamp=datetime.now(timezone.utc).isoformat(),
            overall_assessment=overall_assessment,
            deepfake=deepfake_result,
            speaker=speaker_result,
            replay=replay_result,
            manipulation=manipulation_result,
            vad=vad_result,
            quality=quality_result,
            temporal_metrics=temporal_metrics,
            total_ai_latency_ms=total_latency_ms,
            evidence_summary=evidence_summary
        )

    def process_conversational_intelligence(self, chunk: AudioChunkPayload) -> ConversationalIntelligenceResult:
        """
        Executes full Phase 4 conversational intelligence pipeline on an incoming dialogue turn.
        """
        nlp_start_time = time.perf_counter()

        # 1. Streaming ASR Transcription
        asr_result = self.asr.transcribe(chunk)

        # 2. Sensitive Data & Situation Gating (With immediate redaction)
        sensitive_result = self.sensitive_data_detector.detect_situations(asr_result.transcript)
        redacted_transcript = sensitive_result.redacted_preview or asr_result.transcript
        asr_result.redacted_transcript = redacted_transcript

        # 3. Contextual Intent Classification (Modulated by ASR confidence)
        intent_result = self.intent_classifier.classify(
            text=asr_result.transcript,
            asr_confidence=asr_result.confidence
        )

        # 4. Requested Action Extraction
        action_result = self.action_extractor.extract_action(asr_result.transcript)

        # 5. Caller Claims & Contradiction Verification
        claims = self.claims_extractor.extract_claims(asr_result.transcript, turn_index=chunk.chunk_index)

        # 6. Retrieve Bounded Turn Memory History
        memory = ConversationMemoryManager.get_or_create(chunk.call_id)
        all_turns_text = memory.get_full_transcript_text(redacted=False) + " " + asr_result.transcript
        inconsistencies = self.inconsistency_verifier.verify_inconsistencies(claims, all_turns_text)

        # Gather previous turn tactics
        accumulated_tactics = []
        for t in memory.get_recent_turns(count=10):
            accumulated_tactics.extend(t.tactics)

        # 7. Social Engineering & Multi-Turn Attack Progression
        social_result = self.social_eng_detector.analyze_tactics(
            text_transcript=asr_result.transcript,
            current_intent=intent_result.primary_intent,
            accumulated_tactics=accumulated_tactics,
            contains_secret_request=sensitive_result.contains_direct_request,
            asr_confidence=asr_result.confidence
        )

        # 8. Record Turn in Context Engine & Update Phase State
        current_phase = self.conversation_context.process_turn(
            call_id=chunk.call_id,
            turn_index=chunk.chunk_index,
            speaker_channel=chunk.speaker_channel,
            transcript=asr_result.transcript,
            redacted_transcript=redacted_transcript,
            timestamp_ms=chunk.timestamp_ms or int(time.time() * 1000),
            intent=intent_result.primary_intent,
            tactics=social_result.tactics_detected,
            sensitive_findings=sensitive_result.findings,
            requested_action_type=action_result.action_type.value
        )

        # 9. Evidence Compilation
        evidence_summary: List[str] = []
        if intent_result.evidence_cues:
            evidence_summary.extend([f"Intent: {c}" for c in intent_result.evidence_cues])
        if social_result.explainability:
            evidence_summary.extend([f"Behavioral: {e}" for e in social_result.explainability])
        if action_result.is_high_risk:
            evidence_summary.append(f"High-Risk Action Requested: {action_result.target_object}")
        if inconsistencies:
            evidence_summary.extend([f"Contradiction: {inc}" for inc in inconsistencies])

        total_nlp_latency_ms = round((time.perf_counter() - nlp_start_time) * 1000.0, 3)

        return ConversationalIntelligenceResult(
            call_id=chunk.call_id,
            stream_id=chunk.stream_id,
            turn_index=chunk.chunk_index,
            timestamp=datetime.now(timezone.utc).isoformat(),
            asr=asr_result,
            intent=intent_result,
            sensitive_data=sensitive_result,
            social_engineering=social_result,
            requested_action=action_result,
            caller_claims=claims,
            inconsistencies=inconsistencies,
            current_phase=current_phase,
            total_nlp_latency_ms=total_nlp_latency_ms,
            evidence_summary=evidence_summary
        )

    def process_chunk(self, chunk: AudioChunkPayload) -> AudioAnalysisEvent:
        """Lightweight Phase 2 compatibility method."""
        start_time = time.perf_counter()
        samples = self.decode_pcm_payload(chunk.audio_base64)
        duration_ms = (len(samples) / self.sample_rate) * 1000.0 if len(samples) > 0 else 0.0

        vad_result = self.vad.process_samples(samples)
        quality_result = self.quality.analyze_samples(samples, duration_ms=duration_ms)
        pipeline_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        return AudioAnalysisEvent(
            call_id=chunk.call_id,
            stream_id=chunk.stream_id,
            chunk_index=chunk.chunk_index,
            timestamp=datetime.now(timezone.utc).isoformat(),
            status=PipelineStatus.AVAILABLE,
            vad=vad_result,
            quality=quality_result,
            pipeline_latency_ms=pipeline_latency_ms,
            metadata={
                "sample_rate": chunk.sample_rate,
                "channels": chunk.channels,
                "duration_ms": round(duration_ms, 2),
                "phase": "PHASE_4_CONVERSATIONAL_INTELLIGENCE",
                "channel_type": chunk.channel_type.value if chunk.channel_type else None,
                "codec": chunk.codec
            }
        )


def target_rate_safe(sr: int) -> int:
    return sr if sr > 0 else 16000
