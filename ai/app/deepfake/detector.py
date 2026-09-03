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
    AudioQualityRating
)
from ai.app.core.model_registry import ModelRegistry
from ai.app.deepfake.features import AcousticFeatureExtractor
from ai.app.deepfake.model import DeepfakeAcousticModel
from ai.app.deepfake.calibration import DeepfakeCalibrator


class DeepfakeDetector:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.model_id = "deepfake_aasist_spectral_v3"
        self.feature_extractor = AcousticFeatureExtractor(sample_rate=sample_rate)
        self.model = DeepfakeAcousticModel(model_version=self.model_id)
        self.calibrator = DeepfakeCalibrator(spoof_threshold=0.62, authentic_threshold=0.36)

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

        if self.status != PipelineStatus.AVAILABLE:
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
                inference_latency_ms=0.0
            )

        samples = self.decode_samples(chunk.audio_base64)
        duration_ms = (len(samples) / self.sample_rate) * 1000.0 if len(samples) > 0 else 0.0

        # Fallback quality if not provided
        if quality is None:
            quality = AudioQualityResult(
                rating=AudioQualityRating.GOOD,
                rms_dbfs=-26.0,
                peak_amplitude=0.5,
                clipping_ratio=0.0,
                silence_ratio=0.0,
                snr_estimate_db=20.0,
                dynamic_range_db=25.0,
                sample_rate=self.sample_rate,
                channels=1,
                duration_ms=duration_ms,
                uncertainty_penalty=0.0,
                notes="Default baseline quality."
            )

        # 1. Extract Acoustic & LFCC Features
        features = self.feature_extractor.extract_features(samples)

        # 2. Score via Model (Neural ONNX Primary + DSP Fallback)
        prediction = self.model.predict(features, raw_samples=samples)

        inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        # 3. Calibrate with Quality Uncertainty
        result = self.calibrator.calibrate(
            prediction=prediction,
            quality=quality,
            speech_duration_ms=duration_ms,
            inference_latency_ms=inference_latency_ms
        )

        return result
