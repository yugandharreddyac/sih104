"""
Deepfake Score Calibration & Quality-Aware Uncertainty Scaling
Applies decision boundaries and quality degradation penalties.
Principle: Poor audio quality increases uncertainty; it NEVER generates a fake spoof alert.
"""

import math
from dataclasses import dataclass
from typing import List, Tuple, Optional
from ai.app.core.types import (
    ChannelType,
    DeepfakeStatus,
    DeepfakeAnalysisResult,
    AudioQualityResult,
    AudioQualityRating,
)
from ai.app.deepfake.types import RawDeepfakePrediction
from ai.app.audio.quality import AudioQualityAnalyzer


# Empirically calibrated Phase-1 thresholds (Policy C)
# Engineering targets balancing false alarms and recall; not claimed to be scientifically optimal
WIDEBAND_THRESHOLD = 0.6850
TELEPHONY_THRESHOLD = 0.5250

TELEPHONY_CODEC_SUBSTRINGS = (
    "alaw", "mulaw", "ulaw", "g711", "g711a", "g711u", "pcma", "pcmu",
    "amr", "amrnb", "amrwb", "gsm", "g729", "g722"
)


@dataclass(frozen=True)
class AcousticThresholdProfile:
    """Centralized runtime acoustic decision profile."""
    name: str = "Policy C (Dual-Mode Engineering Calibration)"
    wideband_threshold: float = WIDEBAND_THRESHOLD
    telephony_threshold: float = TELEPHONY_THRESHOLD
    authentic_floor: float = 0.5000
    suspicious_min_confidence: float = 0.5500
    authentic_min_confidence: float = 0.5000
    poor_quality_uncertainty: float = 0.8000
    min_speech_duration_ms: float = 300.0


def is_telephony_codec(codec: Optional[str]) -> bool:
    if not codec:
        return False
    clean = codec.lower().replace(".", "").replace("-", "").replace("_", "").strip()
    return any(sub in clean for sub in TELEPHONY_CODEC_SUBSTRINGS)


class DeepfakeCalibrator:
    def __init__(
        self,
        spoof_threshold: float = WIDEBAND_THRESHOLD,
        authentic_threshold: float = 0.50,
        wideband_threshold: float = WIDEBAND_THRESHOLD,
        telephony_threshold: float = TELEPHONY_THRESHOLD,
        profile: Optional[AcousticThresholdProfile] = None,
    ):
        if profile is not None:
            self.profile = profile
        else:
            self.profile = AcousticThresholdProfile(
                wideband_threshold=wideband_threshold,
                telephony_threshold=telephony_threshold,
                authentic_floor=authentic_threshold,
            )
        self.wideband_threshold = self.profile.wideband_threshold
        self.telephony_threshold = self.profile.telephony_threshold
        # Retain spoof_threshold for backward compatibility
        self.spoof_threshold = spoof_threshold
        self.authentic_threshold = self.profile.authentic_floor

    def resolve_threshold(
        self,
        channel_type: Optional[ChannelType] = None,
        codec: Optional[str] = None,
        sample_rate: Optional[int] = None,
        quality: Optional[AudioQualityResult] = None,
    ) -> Tuple[ChannelType, float, str]:
        """
        Resolves the operating threshold and applied ChannelType.
        Precedence:
        1. Explicit channel_type (when WIDEBAND or TELEPHONY)
        2. Explicit/known telephony codec metadata
        3. Narrowband sample rate metadata (<= 8000 Hz)
        4. Acoustic channel evidence (spectral bandwidth)
        5. Safe default to WIDEBAND
        """
        # 1. Explicit channel_type
        if channel_type == ChannelType.WIDEBAND:
            return ChannelType.WIDEBAND, self.wideband_threshold, "Channel type resolved from explicit metadata (WIDEBAND)"
        if channel_type == ChannelType.TELEPHONY:
            return ChannelType.TELEPHONY, self.telephony_threshold, "Channel type resolved from explicit metadata (TELEPHONY)"

        # If AUTO or None:
        # 2. Known telephony codec metadata
        if codec and is_telephony_codec(codec):
            return ChannelType.TELEPHONY, self.telephony_threshold, f"Channel type resolved from telephony codec metadata ({codec})"

        # 3. Narrowband sample rate metadata (e.g. 8 kHz PSTN)
        if sample_rate is not None and 0 < sample_rate <= 8000:
            return ChannelType.TELEPHONY, self.telephony_threshold, f"Channel type resolved from narrowband sample rate metadata ({sample_rate} Hz)"

        # 4. Acoustic channel evidence
        if quality is not None:
            if AudioQualityAnalyzer.is_telephony_bandwidth(quality):
                return ChannelType.TELEPHONY, self.telephony_threshold, "Channel type resolved from acoustic bandwidth evidence"
            elif quality.spectral_bandwidth_hz is not None:
                return ChannelType.WIDEBAND, self.wideband_threshold, "Channel type ambiguous; defaulted to WIDEBAND"

        # 5. Safe fallback to WIDEBAND
        return ChannelType.WIDEBAND, self.wideband_threshold, "Channel type ambiguous; defaulted to WIDEBAND"

    def calibrate(
        self,
        prediction: RawDeepfakePrediction,
        quality: AudioQualityResult,
        speech_duration_ms: float,
        inference_latency_ms: float,
        channel_type: Optional[ChannelType] = None,
        codec: Optional[str] = None,
        sample_rate: Optional[int] = None,
    ) -> DeepfakeAnalysisResult:
        """
        Calibrates raw spoof prediction against signal health, channel characteristics, and speech duration.
        """
        explainability: List[str] = []
        raw_score = prediction.raw_spoof_score
        raw_conf = prediction.raw_confidence

        # Resolve channel-aware threshold
        applied_channel, applied_threshold, resolution_reason = self.resolve_threshold(
            channel_type=channel_type,
            codec=codec,
            sample_rate=sample_rate,
            quality=quality,
        )

        # Numerical sanity check on raw_score
        is_invalid_score = (
            raw_score is None
            or not isinstance(raw_score, (int, float))
            or math.isnan(raw_score)
            or math.isinf(raw_score)
            or raw_score < 0.0
            or raw_score > 1.0
        )
        if is_invalid_score:
            explainability.append(f"Invalid raw spoof score ({raw_score}); degraded to INCONCLUSIVE for safety.")
            explainability.append(f"Applied channel type: {applied_channel.value}")
            explainability.append(f"Applied spoof threshold: {applied_threshold}")
            explainability.append(f"Threshold profile: {self.profile.name}")
            explainability.append(resolution_reason)
            return DeepfakeAnalysisResult(
                status=DeepfakeStatus.INCONCLUSIVE,
                spoof_score=None,
                confidence=0.0,
                uncertainty=1.0,
                spectral_flatness_anomaly=False,
                vocoder_distortion_score=0.0,
                lfcc_anomaly_score=0.0,
                artifacts_detected=[],
                model_version=prediction.model_version,
                engine_type=prediction.engine_type,
                explainability=explainability,
                inference_latency_ms=inference_latency_ms,
                channel_type_applied=applied_channel,
                threshold_applied=applied_threshold,
            )

        # Base uncertainty derived from prediction ambiguity and audio quality penalty
        quality_uncertainty = quality.uncertainty_penalty
        uncertainty = max(0.05, quality_uncertainty)

        # 1. Check for insufficient speech duration
        if speech_duration_ms < self.profile.min_speech_duration_ms:
            explainability.append(
                f"Insufficient speech duration ({round(speech_duration_ms)}ms < {round(self.profile.min_speech_duration_ms)}ms) for reliable deepfake inference."
            )
            explainability.append(f"Applied channel type: {applied_channel.value}")
            explainability.append(f"Applied spoof threshold: {applied_threshold}")
            explainability.append(f"Threshold profile: {self.profile.name}")
            explainability.append(resolution_reason)
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
                engine_type=None,
                explainability=explainability,
                inference_latency_ms=inference_latency_ms,
                channel_type_applied=applied_channel,
                threshold_applied=applied_threshold,
            )

        # 2. Check for Poor Audio Quality Degradation
        if quality.rating == AudioQualityRating.POOR:
            uncertainty = max(self.profile.poor_quality_uncertainty, uncertainty)
            confidence = max(0.10, raw_conf * (1.0 - uncertainty))
            explainability.append("Audio quality is POOR (severe clipping or low SNR). Deepfake analysis reliability reduced.")
            explainability.append(f"Quality diagnostic: {quality.notes}")
            explainability.append(f"Applied channel type: {applied_channel.value}")
            explainability.append(f"Applied spoof threshold: {applied_threshold}")
            explainability.append(f"Threshold profile: {self.profile.name}")
            explainability.append(resolution_reason)

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
                engine_type=prediction.engine_type,
                explainability=explainability,
                inference_latency_ms=inference_latency_ms,
                channel_type_applied=applied_channel,
                threshold_applied=applied_threshold,
            )

        # 3. Quality-Aware Confidence Scaling
        adjusted_confidence = float(raw_conf * (1.0 - (quality_uncertainty * 0.6)))
        adjusted_confidence = round(max(0.15, min(1.0, adjusted_confidence)), 3)

        # 4. Decision Boundaries (using channel-aware threshold)
        # Comparison semantics: >= applied_threshold is SUSPICIOUS; < applied_threshold is AUTHENTIC
        is_neural = "robust_mini_acoustic_cnn" in prediction.model_version
        if raw_score >= applied_threshold and adjusted_confidence >= self.profile.suspicious_min_confidence:
            status = DeepfakeStatus.SUSPICIOUS
            if is_neural:
                explainability.append(f"Robust MiniAcousticCNN spoof probability ({raw_score}) exceeded operating threshold ({applied_threshold}).")
            else:
                explainability.append(f"Acoustic spectral features exhibited synthetic speech / vocoder artifacts (Spoof score: {raw_score}).")
            for art in prediction.artifacts:
                explainability.append(f"Artifact detected: {art}")
        elif raw_score < applied_threshold and adjusted_confidence >= self.profile.authentic_min_confidence:
            status = DeepfakeStatus.AUTHENTIC
            if is_neural:
                explainability.append(f"Robust MiniAcousticCNN spoof probability ({raw_score}) within authentic bounds (Threshold: {applied_threshold}).")
            else:
                explainability.append("Acoustic harmonic distribution and cepstral variance consistent with natural human speech.")
        else:
            status = DeepfakeStatus.INCONCLUSIVE
            explainability.append(f"Acoustic evidence is inconclusive (Spoof score: {raw_score}, Threshold: {applied_threshold}).")

        explainability.append(f"Applied channel type: {applied_channel.value}")
        explainability.append(f"Applied spoof threshold: {applied_threshold}")
        explainability.append(f"Threshold profile: {self.profile.name}")
        explainability.append(resolution_reason)

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
            engine_type=prediction.engine_type,
            explainability=explainability,
            inference_latency_ms=inference_latency_ms,
            channel_type_applied=applied_channel,
            threshold_applied=applied_threshold,
        )
