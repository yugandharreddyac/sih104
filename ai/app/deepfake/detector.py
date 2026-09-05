"""
Acoustic Deepfake & Synthetic Speech Detector Orchestrator
Extracts LFCC/spectral features, runs acoustic neural model, applies calibration and quality-aware uncertainty.
"""

import time
import base64
import numpy as np
from typing import Optional

from ai.app.core.types import (
    DeepfakeAnalysisResult,
    DeepfakeStatus,
    PipelineStatus,
    AudioChunkPayload,
    AudioQualityResult,
    AudioQualityRating,
    ChannelType
)
from ai.app.core.model_registry import ModelRegistry
from ai.app.audio.quality import AudioQualityAnalyzer
from ai.app.deepfake.features import AcousticFeatureExtractor
from ai.app.deepfake.model import DeepfakeAcousticModel
from ai.app.deepfake.calibration import (
    DeepfakeCalibrator,
    WIDEBAND_THRESHOLD,
    TELEPHONY_THRESHOLD
)


class DeepfakeDetector:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.model_id = "robust_mini_acoustic_cnn_v1"
        self.feature_extractor = AcousticFeatureExtractor(sample_rate=sample_rate)
        self.quality_analyzer = AudioQualityAnalyzer(sample_rate=sample_rate)
        self.model = DeepfakeAcousticModel(model_version=self.model_id)
        # Policy C validated thresholds: 0.685 (Wideband), 0.525 (Telephony)
        self.calibrator = DeepfakeCalibrator(
            spoof_threshold=WIDEBAND_THRESHOLD,
            authentic_threshold=0.50,
            wideband_threshold=WIDEBAND_THRESHOLD,
            telephony_threshold=TELEPHONY_THRESHOLD
        )

        model_meta = ModelRegistry.get_model(self.model_id)
        self.status = model_meta.status if model_meta else PipelineStatus.AVAILABLE

    def decode_samples(self, audio_base64: Optional[str]) -> np.ndarray:
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

    def analyze(
        self,
        chunk: AudioChunkPayload,
        quality: Optional[AudioQualityResult] = None
    ) -> DeepfakeAnalysisResult:
        """
        Analyzes audio chunk for synthetic speech / deepfake vocoder artifacts.
        """
        start_time = time.perf_counter()

        samples = self.decode_samples(chunk.audio_base64)
        duration_ms = (len(samples) / self.sample_rate) * 1000.0 if len(samples) > 0 else 0.0

        # Dynamic quality analysis if not provided explicitly
        if quality is None:
            quality = self.quality_analyzer.analyze_samples(samples, duration_ms=duration_ms)

        if self.status != PipelineStatus.AVAILABLE:
            applied_channel, applied_thresh, _ = self.calibrator.resolve_threshold(
                channel_type=chunk.channel_type,
                codec=chunk.codec,
                quality=quality
            )
            return DeepfakeAnalysisResult(
                status=DeepfakeStatus.MODEL_UNAVAILABLE,
                spoof_score=None,
                confidence=None,
                uncertainty=1.0,
                spectral_flatness_anomaly=False,
                vocoder_distortion_score=0.0,
                lfcc_anomaly_score=0.0,
                artifacts_detected=[],
                model_version=self.model_id,
                engine_type=None,
                explainability=["Deepfake detection model is currently UNAVAILABLE or NOT_LOADED in registry."],
                inference_latency_ms=0.0,
                channel_type_applied=applied_channel,
                threshold_applied=applied_thresh
            )

        # 1. Extract Acoustic & LFCC Features
        features = self.feature_extractor.extract_features(samples)

        # 2. Score via Model (Neural ONNX Primary + DSP Fallback)
        prediction = self.model.predict(features, raw_samples=samples)

        inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        # 3. Calibrate with Channel-Aware Threshold & Quality Uncertainty
        result = self.calibrator.calibrate(
            prediction=prediction,
            quality=quality,
            speech_duration_ms=duration_ms,
            inference_latency_ms=inference_latency_ms,
            channel_type=chunk.channel_type,
            codec=chunk.codec,
        )

        return result
