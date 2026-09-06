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
    def __init__(self, sample_rate: int = 16000, enable_phase2_cues: bool = True):
        self.sample_rate = sample_rate
        self.enable_phase2_cues = enable_phase2_cues
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
                engine_type=None,
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
                engine_type=None,
                explainability=["[DSP_FALLBACK] Insufficient audio duration (<250ms) for replay impulse response estimation."],
                inference_latency_ms=0.0
            )

        # Silence / near-zero energy check: return safe non-replay assessment
        if len(samples) == 0 or float(np.max(np.abs(samples))) < 1e-4:
            inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)
            return ReplayAnalysisResult(
                status=ReplayStatus.NOT_REPLAY,
                replay_probability=0.0,
                confidence=0.80,
                high_frequency_loss=False,
                reverberation_decay_anomaly=False,
                model_version=self.model_id,
                engine_type="DSP_FALLBACK",
                explainability=["[DSP_FALLBACK] Silent or zero-energy audio payload; no physical playback cues observed."],
                inference_latency_ms=inference_latency_ms
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
                engine_type="DSP_FALLBACK",
                explainability=["[DSP_FALLBACK] Audio quality POOR; replay analysis reliability compromised (uncalibrated heuristic fallback)."],
                inference_latency_ms=round((time.perf_counter() - start_time) * 1000.0, 3)
            )

        features = self.feature_extractor.extract_features(samples)

        explainability: List[str] = []

        # Cue 1: High-Frequency Spectral Roll-off Evaluation
        # If the channel is detected as narrowband telephony (<4 kHz), high-frequency loss
        # naturally originates from transmission bandpass rather than physical loudspeaker replay.
        raw_hf_loss = features.high_freq_cutoff_ratio < 0.04 and features.spectral_decay_slope < -2.8
        if features.is_narrowband:
            has_hf_loss = False  # Attenuate roll-off cue on narrowband telephone channels
            explainability.append(
                "Narrowband telephony channel detected (~3.4-4kHz cutoff); "
                "spectral roll-off cue attenuated to prevent false positive replay alarm."
            )
        else:
            has_hf_loss = raw_hf_loss
            if has_hf_loss:
                explainability.append(
                    f"Severe high-frequency attenuation slope ({features.spectral_decay_slope}) "
                    "consistent with loudspeaker acoustic playback."
                )

        # Cue 2: Extended double reverberation decay time
        has_reverb_anomaly = features.reverberation_decay_time_ms > 120.0
        if has_reverb_anomaly:
            explainability.append(
                f"Elevated secondary room acoustic reverberation ({features.reverberation_decay_time_ms}ms)."
            )

        # Cue 3: High transducer harmonic distortion
        has_distortion = features.channel_impulse_distortion > 8.0
        if has_distortion:
            explainability.append("Non-linear transducer harmonic impulse distortion detected.")

        # Cue 4: Spectral Flatness (Wiener entropy) Anomaly
        has_flatness_anomaly = features.spectral_flatness > 0.45
        if has_flatness_anomaly:
            explainability.append(
                f"Elevated spectral flatness / Wiener entropy ({features.spectral_flatness:.3f} > 0.45), "
                "indicating diffuse acoustic spread."
            )

        # Cue 5 (Task 2.2): Temporal Modulation Spectrum Anomaly (4-20 Hz band)
        # Cue 6 (Task 2.2): Cepstral / Homomorphic Spectral Smear
        if self.enable_phase2_cues:
            # Engineering heuristic: elevated modulation ratio in 4-20 Hz with diffuse modulation entropy
            has_modulation_anomaly = (
                features.modulation_energy_ratio_4_20hz > 0.65 and
                features.modulation_spectral_entropy > 0.85
            )
            if has_modulation_anomaly:
                explainability.append(
                    f"Diffuse envelope modulation in 4-20Hz band (ratio={features.modulation_energy_ratio_4_20hz:.2f}, "
                    f"entropy={features.modulation_spectral_entropy:.2f}), indicating secondary enclosure modulation smear."
                )

            # Engineering heuristic: degraded pitch quefrency prominence (CPP < 1.4) with high macro-envelope concentration
            has_cepstral_anomaly = (
                features.cepstral_peak_prominence < 1.4 and
                features.spectral_flatness < 0.35 and
                features.cepstral_energy_ratio > 0.80
            )
            if has_cepstral_anomaly:
                explainability.append(
                    f"Degraded pitch quefrency prominence (CPP={features.cepstral_peak_prominence:.2f} < 1.4) "
                    "with elevated macro-envelope ratio, consistent with multipath acoustic transmission."
                )
        else:
            has_modulation_anomaly = False
            has_cepstral_anomaly = False

        has_corroboration = has_flatness_anomaly or has_modulation_anomaly or has_cepstral_anomaly

        inference_latency_ms = round((time.perf_counter() - start_time) * 1000.0, 3)

        # Multi-Cue Decision & Heuristic Evidence Strength Assignment
        # Physical playback cues: has_hf_loss, has_reverb_anomaly, has_distortion
        # Corroborating cues: has_flatness_anomaly, has_modulation_anomaly, has_cepstral_anomaly
        if (has_hf_loss and (has_reverb_anomaly or has_distortion)) or (has_reverb_anomaly and has_distortion):
            status = ReplayStatus.REPLAY
            replay_prob = 0.88
            confidence = 0.80 if features.is_narrowband else 0.85
            if has_modulation_anomaly or has_cepstral_anomaly:
                confidence = min(0.92, confidence + 0.03)
                explainability.append("Multiple independent acoustic playback cues corroborated by modulation/cepstral envelope anomalies.")
            else:
                explainability.append("Multiple independent acoustic playback cues confirmed physical or digital replay.")
        elif has_corroboration and (has_reverb_anomaly or has_distortion or has_hf_loss):
            status = ReplayStatus.LIKELY_REPLAY
            replay_prob = 0.65
            confidence = 0.55 if features.is_narrowband else 0.60
            if has_modulation_anomaly and has_cepstral_anomaly:
                confidence = min(0.70, confidence + 0.05)
            explainability.append("Acoustic playback cue corroborated by modulation/cepstral or diffuse spectral indicators; moderate replay suspicion.")
        elif has_hf_loss or has_distortion:
            status = ReplayStatus.LIKELY_REPLAY
            replay_prob = 0.65
            confidence = 0.55 if features.is_narrowband else 0.60
            explainability.append("Isolated playback indicator observed; moderate replay suspicion.")
        elif has_reverb_anomaly:
            if features.is_narrowband:
                if has_modulation_anomaly or has_cepstral_anomaly:
                    status = ReplayStatus.LIKELY_REPLAY
                    replay_prob = 0.55
                    confidence = 0.55
                    explainability.append("Elevated room reverberation corroborated by modulation/cepstral cues over narrowband channel; moderate replay suspicion.")
                else:
                    status = ReplayStatus.NOT_REPLAY
                    replay_prob = 0.25
                    confidence = 0.65
                    explainability.append("Elevated room reverberation observed in isolation over narrowband channel; insufficient for replay classification.")
            else:
                status = ReplayStatus.LIKELY_REPLAY
                replay_prob = 0.60
                confidence = 0.55
                explainability.append("Isolated playback indicator observed; moderate replay suspicion.")
        elif has_corroboration:
            status = ReplayStatus.NOT_REPLAY
            replay_prob = 0.20
            confidence = 0.70
            explainability.append("Isolated modulation/cepstral or flatness indicator observed without physical playback cues; consistent with voice dynamics.")
        else:
            status = ReplayStatus.NOT_REPLAY
            replay_prob = 0.12
            if features.is_narrowband:
                confidence = 0.70  # Tempered confidence because high-frequency spectrum was unobservable
                explainability.append("Acoustic impulse response and frequency envelope consistent with direct voice over narrowband channel.")
            else:
                confidence = 0.82
                explainability.append("Acoustic impulse response and frequency spectrum consistent with live direct microphone voice.")

        # If audio quality was mildly DEGRADED, adjust confidence safely
        if quality and quality.rating == AudioQualityRating.DEGRADED:
            confidence = max(0.25, confidence * (1.0 - quality.uncertainty_penalty * 0.4))
            explainability.append("Audio signal is mildly degraded; replay evidence confidence slightly lowered.")

        return ReplayAnalysisResult(
            status=status,
            replay_probability=round(float(replay_prob), 4),
            confidence=round(float(confidence), 3),
            high_frequency_loss=has_hf_loss,
            reverberation_decay_anomaly=has_reverb_anomaly,
            modulation_anomaly=has_modulation_anomaly,
            cepstral_anomaly=has_cepstral_anomaly,
            model_version=self.model_id,
            engine_type="DSP_FALLBACK",
            explainability=explainability,
            inference_latency_ms=inference_latency_ms
        )
