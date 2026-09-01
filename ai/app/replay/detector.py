"""
Replay Attack Detector Orchestrator (Phase 3)
Evaluates physical loudspeaker playback, double-room reverberation, and transducer distortion.
"""

import time
import base64
import numpy as np
from typing import Optional, List

from ai.app.core.types import (
    ReplayAnalysisResult,
    ReplayStatus,
    PipelineStatus,
    AudioChunkPayload,
    AudioQualityResult,
    AudioQualityRating
)
from ai.app.core.model_registry import ModelRegistry
from ai.app.replay.features import ReplayFeatureExtractor


class ReplayDetector:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.model_id = "replay_spectral_decay_v3"
        self.feature_extractor = ReplayFeatureExtractor(sample_rate=sample_rate)

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

    def detect_replay(
        self,
        chunk: AudioChunkPayload,
        quality: Optional[AudioQualityResult] = None
    ) -> ReplayAnalysisResult:
        """
        Analyzes audio chunk for physical loudspeaker acoustic replay cues.
        """
        start_time = time.perf_counter()

        if self.status != PipelineStatus.AVAILABLE:
            return ReplayAnalysisResult(
                status=ReplayStatus.MODEL_UNAVAILABLE,
                replay_probability=None,
                confidence=None,
                high_frequency_loss=False,
                reverberation_decay_anomaly=False,
                model_version=self.model_id,
                explainability=["Replay detection model is currently UNAVAILABLE in registry."],
                inference_latency_ms=0.0
            )

        samples = self.decode_samples(chunk.audio_base64)
        duration_ms = (len(samples) / self.sample_rate) * 1000.0 if len(samples) > 0 else 0.0

        if duration_ms < 250.0:
            return ReplayAnalysisResult(
                status=ReplayStatus.UNCERTAIN,
                replay_probability=None,
                confidence=0.0,
                high_frequency_loss=False,
                reverberation_decay_anomaly=False,
                model_version=self.model_id,
                explainability=["Insufficient audio duration for replay impulse response estimation."],
                inference_latency_ms=0.0
            )

        # Quality check: POOR quality increases uncertainty
        if quality and quality.rating == AudioQualityRating.POOR:
            return ReplayAnalysisResult(
                status=ReplayStatus.UNCERTAIN,
                replay_probability=0.50,
                confidence=0.20,
                high_frequency_loss=False,
                reverberation_decay_anomaly=False,
                model_version=self.model_id,
                explainability=["Audio quality POOR; replay analysis reliability compromised."],
                inference_latency_ms=round((time.perf_counter() - start_time) * 1000.0, 3)
            )

        features = self.feature_extractor.extract_features(samples)

        explainability: List[str] = []
        replay_cues = 0

        # Cue 1: Severe high-frequency roll-off typical of budget transducer playback
        has_hf_loss = features.high_freq_cutoff_ratio < 0.04 and features.spectral_decay_slope < -2.8
        if has_hf_loss:
            replay_cues += 1
            explainability.append(f"Severe high-frequency attenuation slope ({features.spectral_decay_slope}) consistent with loudspeaker playback.")

        # Cue 2: Extended double reverberation decay time
        has_reverb_anomaly = features.reverberation_decay_time_ms > 120.0
        if has_reverb_anomaly:
            replay_cues += 1
            explainability.append(f"Elevated secondary room acoustic reverberation ({features.reverberation_decay_time_ms}ms).")

        # Cue 3: High transducer harmonic distortion
        if features.channel_impulse_distortion > 8.0:
            replay_cues += 1
            explainability.append("Non-linear transducer harmonic impulse distortion detected.")

        inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        if replay_cues >= 2:
            status = ReplayStatus.REPLAY
            replay_prob = 0.88
            confidence = 0.85
            explainability.append("Multiple acoustic playback cues confirmed physical or digital replay.")
        elif replay_cues == 1:
            status = ReplayStatus.LIKELY_REPLAY
            replay_prob = 0.65
            confidence = 0.60
            explainability.append("Isolated playback indicator observed; moderate replay probability.")
        else:
            status = ReplayStatus.NOT_REPLAY
            replay_prob = 0.12
            confidence = 0.82
            explainability.append("Acoustic impulse response and frequency spectrum consistent with live direct microphone voice.")

        return ReplayAnalysisResult(
            status=status,
            replay_probability=round(replay_prob, 4),
            confidence=round(confidence, 3),
            high_frequency_loss=has_hf_loss,
            reverberation_decay_anomaly=has_reverb_anomaly,
            model_version=self.model_id,
            explainability=explainability,
            inference_latency_ms=inference_latency_ms
        )
