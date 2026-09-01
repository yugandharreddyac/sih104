"""
Secure Speaker Biometric Enrollment Engine
Enforces multi-utterance validation, acoustic quality pre-screening, and anti-spoof gating.
Stores only the aggregated 128-dim biometric embedding without raw audio persistence.
"""

import time
import base64
import numpy as np
from typing import Dict, List, Optional, Tuple

from ai.app.core.types import SpeakerProfile, SpeakerEnrollmentRequest
from ai.app.speaker.embedding import SpeakerEmbeddingExtractor
from ai.app.speaker.types import EnrollmentValidationResult
from ai.app.audio.quality import AudioQualityAnalyzer
from ai.app.deepfake.detector import DeepfakeDetector
from ai.app.core.types import AudioChunkPayload, DeepfakeStatus, AudioQualityRating


class SpeakerEnrollmentManager:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.embedding_extractor = SpeakerEmbeddingExtractor(sample_rate=sample_rate)
        self.quality_analyzer = AudioQualityAnalyzer(sample_rate=sample_rate)
        self.deepfake_detector = DeepfakeDetector(sample_rate=sample_rate)

        # In-memory speaker profile store (speaker_id -> { profile: SpeakerProfile, embedding: List[float] })
        self._profiles: Dict[str, Dict[str, Any]] = {}
        self._seed_default_executive_profiles()

    def _decode_utterance(self, b64_str: str) -> np.ndarray:
        try:
            raw_bytes = base64.b64decode(b64_str)
            if len(raw_bytes) < 2:
                return np.zeros(0, dtype=np.float32)
            int16_samples = np.frombuffer(raw_bytes, dtype=np.int16)
            return (int16_samples.astype(np.float32) / 32768.0).copy()
        except Exception:
            return np.zeros(0, dtype=np.float32)

    def _seed_default_executive_profiles(self):
        """Seeds default test enrolled executive profiles for SOC demonstrations."""
        # Generate synthetic reference embeddings for Executive CFO and CEO
        t = np.linspace(0, 2.0, int(16000 * 2.0), endpoint=False)
        # CFO reference: 450Hz fundamental + formants
        cfo_samples = (0.4 * np.sin(2 * np.pi * 450 * t) + 0.2 * np.sin(2 * np.pi * 900 * t)).astype(np.float32)
        cfo_emb = self.embedding_extractor.extract_embedding(cfo_samples, "speaker-cfo-001")

        self._profiles["speaker-cfo-001"] = {
            "profile": SpeakerProfile(
                speaker_id="speaker-cfo-001",
                speaker_name="Eleanor Vance (Chief Financial Officer)",
                embedding_dimension=cfo_emb.dimension,
                utterances_count=3,
                enrolled_at="2026-08-30T10:00:00Z",
                anti_spoof_verified=True,
                audio_quality_rating="GOOD",
                is_active=True,
                metadata={"department": "Executive Treasury", "clearance": "TIER_1"}
            ),
            "embedding": cfo_emb.embedding
        }

    def enroll_speaker(self, req: SpeakerEnrollmentRequest) -> Tuple[bool, Optional[SpeakerProfile], str]:
        """
        Enrolls a new speaker profile from multiple audio utterances with quality & anti-spoof checks.
        """
        if len(req.audio_utterances_base64) < 2:
            return False, None, "Speaker enrollment requires a minimum of 2 reference utterances for biometric stability."

        embeddings: List[List[float]] = []
        total_duration_sec = 0.0

        for i, utt_b64 in enumerate(req.audio_utterances_base64):
            samples = self._decode_utterance(utt_b64)
            duration_sec = len(samples) / self.sample_rate
            total_duration_sec += duration_sec

            if duration_sec < 0.5:
                return False, None, f"Utterance #{i+1} is too short ({round(duration_sec, 2)}s). Minimum 0.5s required."

            # 1. Quality Pre-Screening
            quality = self.quality_analyzer.analyze_samples(samples, duration_ms=duration_sec * 1000)
            if quality.rating == AudioQualityRating.POOR:
                return False, None, f"Utterance #{i+1} failed acoustic quality screening: {quality.notes}"

            # 2. Anti-Spoof Pre-Screening (Protect against enrollment poisoning)
            chunk_payload = AudioChunkPayload(
                call_id="enrollment-screening",
                chunk_index=i,
                audio_base64=utt_b64,
                sample_rate=self.sample_rate
            )
            df_result = self.deepfake_detector.analyze(chunk_payload, quality=quality)
            if df_result.status == DeepfakeStatus.SUSPICIOUS:
                return False, None, f"Utterance #{i+1} rejected by anti-spoof screening. Synthetic voice detected during enrollment."

            # Extract embedding
            emb = self.embedding_extractor.extract_embedding(samples, req.speaker_id)
            embeddings.append(emb.embedding)

        # 3. Aggregate centroid embedding across utterances
        emb_matrix = np.array(embeddings, dtype=np.float32)
        centroid = np.mean(emb_matrix, axis=0)
        norm = float(np.linalg.norm(centroid))
        if norm > 1e-6:
            normalized_centroid = (centroid / norm).tolist()
        else:
            normalized_centroid = centroid.tolist()

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        profile = SpeakerProfile(
            speaker_id=req.speaker_id,
            speaker_name=req.speaker_name,
            embedding_dimension=len(normalized_centroid),
            utterances_count=len(req.audio_utterances_base64),
            enrolled_at=now_iso,
            anti_spoof_verified=True,
            audio_quality_rating="GOOD",
            is_active=True,
            metadata=req.metadata
        )

        # Store profile and embedding (Zero raw audio stored)
        self._profiles[req.speaker_id] = {
            "profile": profile,
            "embedding": [round(x, 5) for x in normalized_centroid]
        }

        return True, profile, "Speaker enrolled successfully with verified anti-spoof screening."

    def get_profile(self, speaker_id: str) -> Optional[SpeakerProfile]:
        data = self._profiles.get(speaker_id)
        return data["profile"] if data else None

    def get_embedding(self, speaker_id: str) -> Optional[List[float]]:
        data = self._profiles.get(speaker_id)
        return data["embedding"] if data else None

    def list_profiles(self) -> List[SpeakerProfile]:
        return [d["profile"] for d in self._profiles.values()]

    def delete_profile(self, speaker_id: str) -> bool:
        if speaker_id in self._profiles:
            del self._profiles[speaker_id]
            return True
        return False
