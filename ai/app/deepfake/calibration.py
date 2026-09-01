"""
Deepfake Score Calibration & Quality-Aware Uncertainty Scaling
Applies decision boundaries and quality degradation penalties.
Principle: Poor audio quality increases uncertainty; it NEVER generates a fake spoof alert.
"""

from typing import List, Tuple
from ai.app.core.types import DeepfakeStatus, DeepfakeAnalysisResult, AudioQualityResult, AudioQualityRating
from ai.app.deepfake.types import RawDeepfakePrediction


class DeepfakeCalibrator:
    def __init__(self, spoof_threshold: float = 0.65, authentic_threshold: float = 0.35):
        self.spoof_threshold = spoof_threshold
        self.authentic_threshold = authentic_threshold

    def calibrate(
        self,
        prediction: RawDeepfakePrediction,
        quality: AudioQualityResult,
        speech_duration_ms: float,
        inference_latency_ms: float
    ) -> DeepfakeAnalysisResult:
        """
        Calibrates raw spoof prediction against signal health and speech duration.
        """
        explainability: List[str] = []
        raw_score = prediction.raw_spoof_score
        raw_conf = prediction.raw_confidence

        # Base uncertainty derived from prediction ambiguity and audio quality penalty
        quality_uncertainty = quality.uncertainty_penalty
        uncertainty = max(0.05, quality_uncertainty)

        # 1. Check for insufficient speech duration
        if speech_duration_ms < 300.0:
            explainability.append(f"Insufficient speech duration ({round(speech_duration_ms)}ms < 300ms) for reliable deepfake inference.")
            return DeepfakeAnalysisResult(
                status=DeepfakeStatus.INSUFFICIENT_AUDIO,
                spoof_score=None,
                confidence=0.0,
                uncertainty=1.0,
                spectral_flatness_anomaly=False,
                vocoder_distortion_score=0.0,
                lfcc_anomaly_score=0.0,
                artifacts_detected=[],
                model_version=prediction.model_version,
                explainability=explainability,
                inference_latency_ms=inference_latency_ms
            )

        # 2. Check for Poor Audio Quality Degradation
        if quality.rating == AudioQualityRating.POOR:
            uncertainty = max(0.80, uncertainty)
            confidence = max(0.10, raw_conf * (1.0 - uncertainty))
            explainability.append("Audio quality is POOR (severe clipping or low SNR). Deepfake analysis reliability reduced.")
            explainability.append(f"Quality diagnostic: {quality.notes}")

            return DeepfakeAnalysisResult(
                status=DeepfakeStatus.INCONCLUSIVE,
                spoof_score=round(raw_score, 4),
                confidence=round(confidence, 3),
                uncertainty=round(uncertainty, 3),
                spectral_flatness_anomaly=False,
                vocoder_distortion_score=0.0,
                lfcc_anomaly_score=0.0,
                artifacts_detected=prediction.artifacts,
                model_version=prediction.model_version,
                explainability=explainability,
                inference_latency_ms=inference_latency_ms
            )

        # 3. Quality-Aware Confidence Scaling
        adjusted_confidence = float(raw_conf * (1.0 - (quality_uncertainty * 0.6)))
        adjusted_confidence = round(max(0.15, min(1.0, adjusted_confidence)), 3)

        # 4. Decision Boundaries
        if raw_score >= self.spoof_threshold and adjusted_confidence >= 0.55:
            status = DeepfakeStatus.SUSPICIOUS
            explainability.append(f"Acoustic spectral features exhibited synthetic speech / vocoder artifacts (Spoof score: {raw_score}).")
            for art in prediction.artifacts:
                explainability.append(f"Artifact detected: {art}")
        elif raw_score <= self.authentic_threshold and adjusted_confidence >= 0.50:
            status = DeepfakeStatus.AUTHENTIC
            explainability.append("Acoustic harmonic distribution and cepstral variance consistent with natural human speech.")
        else:
            status = DeepfakeStatus.INCONCLUSIVE
            explainability.append(f"Acoustic evidence is inconclusive (Spoof score: {raw_score}, Threshold: {self.spoof_threshold}).")

        if quality.rating == AudioQualityRating.DEGRADED:
            explainability.append("Audio signal is mildly degraded; uncertainty margin widened.")

        return DeepfakeAnalysisResult(
            status=status,
            spoof_score=round(raw_score, 4),
            confidence=adjusted_confidence,
            uncertainty=round(uncertainty, 3),
            spectral_flatness_anomaly=prediction.feature_vector.spectral_flatness > 0.45,
            vocoder_distortion_score=prediction.feature_vector.vocoder_phase_distortion,
            lfcc_anomaly_score=round(float(prediction.raw_spoof_score), 4),
            artifacts_detected=prediction.artifacts,
            model_version=prediction.model_version,
            explainability=explainability,
            inference_latency_ms=inference_latency_ms
        )
