"""
Speaker Verification Orchestrator (Phase 3)
Extracts acoustic biometric embedding, evaluates cosine similarity against enrolled profile,
and returns explainable verification result with decision confidence.
"""

import time
import base64
import numpy as np
from typing import Optional, List

from ai.app.core.types import (
    SpeakerVerificationResult,
    SpeakerVerificationStatus,
    PipelineStatus,
    AudioChunkPayload,
    AudioQualityResult,
    AudioQualityRating
)
from ai.app.core.model_registry import ModelRegistry
from ai.app.speaker.embedding import SpeakerEmbeddingExtractor
from ai.app.speaker.similarity import SpeakerSimilarityMatcher
from ai.app.speaker.enrollment import SpeakerEnrollmentManager


class SpeakerVerifier:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.model_id = "speaker_xvector_biometric_v3"
        self.embedding_extractor = SpeakerEmbeddingExtractor(sample_rate=sample_rate)
        self.similarity_matcher = SpeakerSimilarityMatcher(verification_threshold=0.70)
        self.enrollment_manager = SpeakerEnrollmentManager(sample_rate=sample_rate)

        model_meta = ModelRegistry.get_model(self.model_id)
        self.status = model_meta.status if model_meta else PipelineStatus.AVAILABLE

    def decode_samples(self, audio_base64: Optional[str]) -> np.ndarray:
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

    def verify_speaker(
        self,
        chunk: AudioChunkPayload,
        claimed_speaker_id: Optional[str] = None,
        quality: Optional[AudioQualityResult] = None
    ) -> SpeakerVerificationResult:
        """
        Verifies incoming audio chunk against enrolled biometric profile of claimed_speaker_id.
        """
        start_time = time.perf_counter()

        if self.status != PipelineStatus.AVAILABLE:
            return SpeakerVerificationResult(
                status=SpeakerVerificationStatus.MODEL_UNAVAILABLE,
                similarity_score=None,
                confidence=None,
                is_enrolled=False,
                enrolled_speaker_id=claimed_speaker_id,
                threshold_applied=0.70,
                model_version=self.model_id,
                engine_type=None,
                explainability=["Speaker biometric verification model is UNAVAILABLE in registry."],
                inference_latency_ms=0.0
            )

        speaker_id = claimed_speaker_id or chunk.claimed_speaker_id

        # 1. If no claimed speaker ID is provided
        if not speaker_id:
            return SpeakerVerificationResult(
                status=SpeakerVerificationStatus.NOT_ENROLLED,
                similarity_score=None,
                confidence=None,
                is_enrolled=False,
                enrolled_speaker_id=None,
                threshold_applied=0.70,
                model_version=self.model_id,
                engine_type=None,
                explainability=["No claimed speaker identity associated with this call session."],
                inference_latency_ms=0.0
            )

        # 2. Check if claimed speaker is enrolled
        enrolled_profile = self.enrollment_manager.get_profile(speaker_id)
        enrolled_embedding = self.enrollment_manager.get_embedding(speaker_id)

        if not enrolled_profile or not enrolled_embedding:
            return SpeakerVerificationResult(
                status=SpeakerVerificationStatus.NOT_ENROLLED,
                similarity_score=None,
                confidence=None,
                is_enrolled=False,
                enrolled_speaker_id=speaker_id,
                threshold_applied=0.70,
                model_version=self.model_id,
                engine_type=None,
                explainability=[f"Speaker identity '{speaker_id}' is not enrolled in the biometric registry."],
                inference_latency_ms=0.0
            )

        samples = self.decode_samples(chunk.audio_base64)
        duration_ms = (len(samples) / self.sample_rate) * 1000.0 if len(samples) > 0 else 0.0

        # 3. Check for sufficient audio
        if duration_ms < 300.0:
            return SpeakerVerificationResult(
                status=SpeakerVerificationStatus.INSUFFICIENT_AUDIO,
                similarity_score=None,
                confidence=None,
                is_enrolled=True,
                enrolled_speaker_id=speaker_id,
                threshold_applied=0.70,
                model_version=self.model_id,
                engine_type=None,
                explainability=[f"Insufficient speech duration ({round(duration_ms)}ms) for speaker embedding."],
                inference_latency_ms=0.0
            )

        # 4. Extract incoming embedding
        incoming_emb = self.embedding_extractor.extract_embedding(samples, speaker_id)

        # 5. Compute Cosine Similarity
        sim_score = self.similarity_matcher.compute_similarity(incoming_emb.embedding, enrolled_embedding)
        is_neural = incoming_emb.dimension == 192 and len(enrolled_embedding) == 192
        applied_threshold = 0.88 if is_neural else 0.70
        is_match, confidence = self.similarity_matcher.evaluate_match(
            sim_score,
            threshold=applied_threshold,
            is_neural=is_neural
        )

        inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        explainability: List[str] = []
        mode_label = "NEURAL_ECAPA_TDNN" if is_neural else "DSP_RANDOM_PROJECTION"
        if is_match:
            status = SpeakerVerificationStatus.MATCH
            explainability.append(
                f"Acoustic biometric match confirmed for '{enrolled_profile.speaker_name}' "
                f"(Cosine similarity: {round(sim_score, 3)} >= {applied_threshold} [{mode_label}])."
            )
        else:
            status = SpeakerVerificationStatus.MISMATCH
            explainability.append(
                f"Speaker biometric MISMATCH. Incoming voice deviates from enrolled profile for '{enrolled_profile.speaker_name}' "
                f"(Similarity: {round(sim_score, 3)} < {applied_threshold} [{mode_label}])."
            )

        return SpeakerVerificationResult(
            status=status,
            similarity_score=round(sim_score, 4),
            confidence=round(confidence, 3),
            is_enrolled=True,
            enrolled_speaker_id=speaker_id,
            threshold_applied=applied_threshold,
            model_version=self.model_id,
            engine_type=incoming_emb.engine_type,
            explainability=explainability,
            inference_latency_ms=inference_latency_ms
        )
