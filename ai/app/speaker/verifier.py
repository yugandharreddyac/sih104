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
        Applies canonical 16 kHz resampling, NaN/Inf sanitization, dimension validation,
        and explicit NEURAL vs FALLBACK provenance reporting.
        """
        start_time = time.perf_counter()

        model_active = self.embedding_extractor.is_neural_active
        default_backend = "NEURAL" if model_active else "FALLBACK"
        default_method = "ECAPA_TDNN_COSINE" if model_active else "DSP_FILTERBANK_PROJECTION_COSINE"

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
                inference_latency_ms=0.0,
                speaker_backend=default_backend,
                speaker_model_loaded=model_active,
                verification_method=default_method,
                verification_score=None
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
                inference_latency_ms=0.0,
                speaker_backend=default_backend,
                speaker_model_loaded=model_active,
                verification_method=default_method,
                verification_score=None
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
                inference_latency_ms=0.0,
                speaker_backend=default_backend,
                speaker_model_loaded=model_active,
                verification_method=default_method,
                verification_score=None
            )

        samples = self.decode_samples(chunk.audio_base64)
        effective_sr = chunk.sample_rate if (chunk.sample_rate and chunk.sample_rate > 0) else self.sample_rate
        duration_ms = (len(samples) / effective_sr) * 1000.0 if len(samples) > 0 else 0.0

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
                inference_latency_ms=0.0,
                speaker_backend=default_backend,
                speaker_model_loaded=model_active,
                verification_method=default_method,
                verification_score=None
            )

        # Sanitize audio samples (NaN / Inf protection)
        if not np.all(np.isfinite(samples)):
            samples = np.nan_to_num(samples, nan=0.0, posinf=0.0, neginf=0.0)

        # Standardize samples to canonical model sample rate (16 kHz) if input is narrowband (e.g. 8 kHz telephony)
        if effective_sr != self.sample_rate and len(samples) > 0:
            try:
                import torch
                import torchaudio
                t_in = torch.from_numpy(samples).float()
                t_resampled = torchaudio.transforms.Resample(orig_freq=effective_sr, new_freq=self.sample_rate)(t_in)
                samples = t_resampled.numpy().copy()
            except Exception:
                old_indices = np.linspace(0, len(samples) - 1, len(samples))
                new_len = int(round(len(samples) * (self.sample_rate / effective_sr)))
                new_indices = np.linspace(0, len(samples) - 1, new_len)
                samples = np.interp(new_indices, old_indices, samples).astype(np.float32)

        # 4. Extract incoming embedding
        incoming_emb = self.embedding_extractor.extract_embedding(samples, speaker_id)

        # 5. Check for embedding dimension mismatch between incoming and enrolled profile
        if incoming_emb.dimension != len(enrolled_embedding):
            inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)
            return SpeakerVerificationResult(
                status=SpeakerVerificationStatus.MISMATCH,
                similarity_score=0.0,
                confidence=0.50,
                is_enrolled=True,
                enrolled_speaker_id=speaker_id,
                threshold_applied=0.70,
                model_version=self.model_id,
                engine_type=incoming_emb.engine_type,
                explainability=[
                    f"Biometric representation dimension mismatch ({incoming_emb.dimension} vs enrolled {len(enrolled_embedding)}). "
                    "Cannot compare embeddings across different feature representations."
                ],
                inference_latency_ms=inference_latency_ms,
                speaker_backend="FALLBACK",
                speaker_model_loaded=model_active,
                verification_method="DIMENSION_MISMATCH_REJECT",
                verification_score=0.0
            )

        # 6. Compute Cosine Similarity
        sim_score = self.similarity_matcher.compute_similarity(incoming_emb.embedding, enrolled_embedding)
        is_neural = (
            incoming_emb.dimension == 192 and
            len(enrolled_embedding) == 192 and
            incoming_emb.engine_type == "NEURAL"
        )
        applied_threshold = 0.88 if is_neural else 0.70
        is_match, confidence = self.similarity_matcher.evaluate_match(
            sim_score,
            threshold=applied_threshold,
            is_neural=is_neural
        )

        clamped_sim = max(0.0, min(1.0, float(sim_score)))
        inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        explainability: List[str] = []
        mode_label = "NEURAL_ECAPA_TDNN" if is_neural else "DSP_RANDOM_PROJECTION"
        backend_name = "NEURAL" if is_neural else "FALLBACK"
        method_name = "ECAPA_TDNN_COSINE" if is_neural else "DSP_FILTERBANK_PROJECTION_COSINE"

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
            similarity_score=round(clamped_sim, 4),
            confidence=round(confidence, 3),
            is_enrolled=True,
            enrolled_speaker_id=speaker_id,
            threshold_applied=applied_threshold,
            model_version=self.model_id,
            engine_type=incoming_emb.engine_type,
            explainability=explainability,
            inference_latency_ms=inference_latency_ms,
            speaker_backend=backend_name,
            speaker_model_loaded=model_active,
            verification_method=method_name,
            verification_score=round(clamped_sim, 4)
        )
