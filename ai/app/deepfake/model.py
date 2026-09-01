"""
Acoustic Deepfake & Synthetic Speech Scoring Model
Dual-Engine Architecture:
- Primary: ASVspoof-trained Deepfake Wav2Vec2 Quantized ONNX Neural Model (CPUExecutionProvider)
- Fallback: Deterministic LFCC higher-order variance, vocoder phase distortion, Wiener flatness, and prosodic dynamics DSP math
"""

import os
import time
import logging
import numpy as np
from typing import List, Optional, Any

from ai.app.deepfake.types import DeepfakeFeatureVector, RawDeepfakePrediction

logger = logging.getLogger("voxshield.deepfake.model")


class DeepfakeAcousticModel:
    _cached_session: Optional[Any] = None
    _neural_initialized: bool = False
    _neural_model_path: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "models", "deepfake", "deepfake_detector.onnx"
    )

    def __init__(self, model_version: str = "deepfake_aasist_spectral_v3", model_path: Optional[str] = None):
        self.model_version = model_version
        self._custom_model_path = model_path or self._neural_model_path

        # Baseline calibration weights for DSP fallback (ASVspoof 2019/2021 LA benchmarks)
        self.w_lfcc = 0.35
        self.w_vocoder = 0.30
        self.w_flatness = 0.20
        self.w_temporal = 0.15

        # Attempt lazy initialization on first instance
        self._ensure_neural_session(self._custom_model_path)

    @classmethod
    def _ensure_neural_session(cls, custom_path: Optional[str] = None) -> Optional[Any]:
        """Lazily initializes and caches the ONNX Runtime Deepfake model session on CPU."""
        if cls._neural_initialized and cls._cached_session is not None:
            return cls._cached_session

        target_path = custom_path or cls._neural_model_path
        if not os.path.exists(target_path) or not os.path.isfile(target_path):
            logger.warning(
                f"[Deepfake] Neural ONNX model not found at '{target_path}'. "
                "Engaging deterministic DSP LFCC/Wiener fallback."
            )
            cls._neural_initialized = True
            cls._cached_session = None
            return None

        try:
            import onnxruntime as ort
            logger.info(f"[Deepfake] Loading Neural ONNX model from {target_path}...")
            start_t = time.perf_counter()

            session_opts = ort.SessionOptions()
            session_opts.intra_op_num_threads = 2
            session_opts.inter_op_num_threads = 1
            session_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            session = ort.InferenceSession(
                target_path,
                sess_options=session_opts,
                providers=["CPUExecutionProvider"]
            )
            cls._cached_session = session
            cls._neural_initialized = True
            load_ms = round((time.perf_counter() - start_t) * 1000.0, 2)
            logger.info(f"[Deepfake] Neural ONNX model successfully loaded in {load_ms} ms.")
            return cls._cached_session
        except Exception as e:
            logger.warning(
                f"[Deepfake] Failed to initialize Neural ONNX session: {e}. "
                "Gracefully falling back to deterministic DSP."
            )
            cls._neural_initialized = True
            cls._cached_session = None
            return None

    @property
    def is_neural_active(self) -> bool:
        return self._cached_session is not None

    def _predict_dsp(self, features: DeepfakeFeatureVector) -> Tuple[float, float, List[str]]:
        """Deterministic LFCC higher-order variance and acoustic DSP scoring."""
        artifacts: List[str] = []

        # 1. LFCC Higher-Order Cepstral Variance
        lfcc_arr = np.array(features.lfcc_coefficients)
        if len(lfcc_arr) >= 12:
            high_lfcc_std = float(np.std(lfcc_arr[6:]))
            if high_lfcc_std < 0.65:
                lfcc_score = min(1.0, (0.65 - high_lfcc_std) / 0.50)
                artifacts.append(f"Oversmoothed higher-order LFCC cepstral variance ({round(high_lfcc_std, 2)}) typical of neural vocoders")
            else:
                lfcc_score = 0.10
        else:
            lfcc_score = 0.20

        # 2. Vocoder Phase Discontinuity & Frame Jitter
        if features.vocoder_phase_distortion > 0.08:
            vocoder_score = min(1.0, (features.vocoder_phase_distortion - 0.08) / 0.15)
            artifacts.append("Elevated high-frequency spectral phase transition jitter")
        else:
            vocoder_score = 0.08

        # 3. Spectral Flatness Anomaly Check
        if features.spectral_flatness > 0.45:
            flatness_score = min(1.0, (features.spectral_flatness - 0.45) / 0.40)
            artifacts.append("Elevated spectral Wiener entropy (unnatural high-band harmonic distribution)")
        elif features.spectral_flatness < 0.01:
            flatness_score = 0.05
        else:
            flatness_score = 0.15

        # 4. Temporal Variance & Prosodic Uniformity
        if 0.0 < features.temporal_variance < 0.0002:
            temporal_score = 0.70
            artifacts.append("Low dynamic prosodic variance across temporal speech frames")
        else:
            temporal_score = 0.10

        raw_spoof_score = float(
            self.w_lfcc * lfcc_score +
            self.w_vocoder * vocoder_score +
            self.w_flatness * flatness_score +
            self.w_temporal * temporal_score
        )
        raw_spoof_score = float(np.clip(raw_spoof_score, 0.0, 1.0))

        agreement_count = sum([lfcc_score > 0.5, vocoder_score > 0.5, flatness_score > 0.5, temporal_score > 0.5])
        if agreement_count >= 2:
            raw_confidence = 0.85
        elif agreement_count == 1:
            raw_confidence = 0.65
        else:
            raw_confidence = 0.80

        return raw_spoof_score, raw_confidence, artifacts

    def predict(
        self,
        features: DeepfakeFeatureVector,
        raw_samples: Optional[np.ndarray] = None,
        force_dsp: bool = False
    ) -> RawDeepfakePrediction:
        """
        Executes deepfake artifact prediction (Neural ONNX Primary with DSP fallback).
        """
        dsp_spoof_score, dsp_confidence, dsp_artifacts = self._predict_dsp(features)

        # 1. Primary Neural Path (ONNX Runtime)
        if (
            not force_dsp
            and self.is_neural_active
            and raw_samples is not None
            and len(raw_samples) >= 4800  # >= 300ms
        ):
            try:
                audio_float = raw_samples.astype(np.float32)
                if np.max(np.abs(audio_float)) > 1.0:
                    audio_float = audio_float / 32768.0

                audio_tensor = audio_float.reshape(1, -1)
                input_name = self._cached_session.get_inputs()[0].name
                outputs = self._cached_session.run(None, {input_name: audio_tensor})

                logits = outputs[0][0]
                if len(logits) >= 2 and np.all(np.isfinite(logits)):
                    exp_l = np.exp(logits - np.max(logits))
                    probs = exp_l / np.sum(exp_l)
                    p_fake = float(probs[1])

                    # Ensemble: Blend neural probability with physical acoustic DSP evidence
                    combined_spoof = float(0.60 * p_fake + 0.40 * dsp_spoof_score)
                    combined_spoof = float(np.clip(combined_spoof, 0.0, 1.0))

                    combined_conf = float(np.clip(0.50 + abs(combined_spoof - 0.50) * 1.0, 0.50, 0.95))

                    artifacts = list(dsp_artifacts)
                    if p_fake > 0.60:
                        artifacts.append(
                            f"Neural acoustic transformer detected synthetic speech generation / voice clone pattern (Neural p_fake: {round(p_fake, 3)})."
                        )

                    return RawDeepfakePrediction(
                        raw_spoof_score=round(combined_spoof, 4),
                        raw_confidence=round(combined_conf, 3),
                        model_version=self.model_version,
                        feature_vector=features,
                        artifacts=artifacts
                    )
            except Exception as exc:
                logger.warning(
                    f"[Deepfake] Neural ONNX inference failed: {exc}. "
                    "Routing to deterministic DSP fallback."
                )

        # 2. Deterministic DSP Fallback Path
        return RawDeepfakePrediction(
            raw_spoof_score=round(dsp_spoof_score, 4),
            raw_confidence=round(dsp_confidence, 3),
            model_version=self.model_version,
            feature_vector=features,
            artifacts=dsp_artifacts
        )
