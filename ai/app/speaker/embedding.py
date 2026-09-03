"""
Speaker Biometric Embedding Extractor (ECAPA-TDNN Neural ONNX Primary + Deterministic DSP Fallback)
Extracts acoustic vocal tract resonance and deep speaker identity embeddings.
Applies L2 spherical normalization to ensure stable cosine similarity comparisons.
"""

import os
import time
import logging
import numpy as np
from typing import List, Optional, Any

from ai.app.speaker.types import SpeakerEmbeddingVector

logger = logging.getLogger("voxshield.speaker.embedding")


class SpeakerEmbeddingExtractor:
    _cached_session: Optional[Any] = None
    _neural_initialized: bool = False
    _neural_model_path: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "models", "speaker", "ecapa_tdnn.onnx"
    )

    def __init__(self, sample_rate: int = 16000, embedding_dim: int = 192, model_path: Optional[str] = None):
        self.sample_rate = sample_rate
        self.embedding_dim = embedding_dim
        self.model_version = "speaker_xvector_biometric_v3"
        self._custom_model_path = model_path or self._neural_model_path

        # Deterministic projection weights for acoustic filterbank to embedding space (DSP fallback)
        np.random.seed(42)
        self.dsp_dim = 128
        self.projection_matrix = np.random.randn(64, self.dsp_dim).astype(np.float32)
        self.projection_matrix /= np.linalg.norm(self.projection_matrix, axis=0, keepdims=True)

        # Attempt lazy initialization on first instance
        self._ensure_neural_session(self._custom_model_path)

    @classmethod
    def _ensure_neural_session(cls, custom_path: Optional[str] = None) -> Optional[Any]:
        """Lazily initializes and caches the ONNX Runtime ECAPA-TDNN session on CPU."""
        if cls._neural_initialized and cls._cached_session is not None:
            return cls._cached_session

        target_path = custom_path or cls._neural_model_path
        if not os.path.exists(target_path) or not os.path.isfile(target_path):
            logger.warning(
                f"[Speaker] ECAPA-TDNN ONNX model not found at '{target_path}'. "
                "Engaging deterministic DSP random-projection fallback."
            )
            cls._neural_initialized = True
            cls._cached_session = None
            return None

        try:
            import onnxruntime as ort
            logger.info(f"[Speaker] Loading ECAPA-TDNN ONNX model from {target_path}...")
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
            logger.info(f"[Speaker] ECAPA-TDNN ONNX model successfully loaded in {load_ms} ms.")
            return cls._cached_session
        except Exception as e:
            logger.warning(
                f"[Speaker] Failed to initialize ECAPA-TDNN ONNX session: {e}. "
                "Gracefully falling back to DSP filterbank projection."
            )
            cls._neural_initialized = True
            cls._cached_session = None
            return None

    @property
    def is_neural_active(self) -> bool:
        return self._cached_session is not None

    def _extract_dsp_fallback(self, samples: np.ndarray, speaker_id: Optional[str] = None) -> SpeakerEmbeddingVector:
        """Deterministic mathematical DSP 64-band FFT filterbank with random projection."""
        if len(samples) < 320:
            zero_vec = [0.0] * self.dsp_dim
            return SpeakerEmbeddingVector(
                speaker_id=speaker_id,
                embedding=zero_vec,
                dimension=self.dsp_dim,
                energy_norm=0.0,
                model_version=self.model_version
            )

        # 1. FFT Spectrogram (64 filter sub-bands)
        nfft = 512
        frame_size = 400
        hop_size = 160
        num_frames = max(1, (len(samples) - frame_size) // hop_size)

        fbank_energies = np.zeros((num_frames, 64), dtype=np.float32)
        window = np.hamming(frame_size)

        for i in range(num_frames):
            start = i * hop_size
            frame = samples[start:start + frame_size]
            spec = np.abs(np.fft.rfft(frame * window, n=nfft))
            spec_norm = spec / (np.max(spec) + 1e-6)
            step = max(1, len(spec) // 64)
            for b in range(64):
                fbank_energies[i, b] = float(np.mean(spec_norm[b * step:(b + 1) * step]))

        # 2. Temporal Statistics Pooling (Mean + Std over frames)
        mean_spec = np.mean(fbank_energies, axis=0)
        std_spec = np.std(fbank_energies, axis=0)
        pooled = (mean_spec + 0.5 * std_spec).reshape(1, 64)

        # 3. Dense Projection & Non-Linear Activation (Tanh)
        raw_embedding = np.tanh(np.dot(pooled, self.projection_matrix)).flatten()

        # 4. L2 Spherical Normalization
        norm = float(np.linalg.norm(raw_embedding))
        if norm > 1e-6:
            normalized_vec = raw_embedding / norm
        else:
            normalized_vec = raw_embedding

        return SpeakerEmbeddingVector(
            speaker_id=speaker_id,
            embedding=[round(float(x), 5) for x in normalized_vec],
            dimension=self.dsp_dim,
            energy_norm=round(norm, 4),
            model_version=self.model_version,
            engine_type="DSP_FALLBACK"
        )

    def extract_embedding(
        self,
        samples: np.ndarray,
        speaker_id: Optional[str] = None,
        force_dsp: bool = False
    ) -> SpeakerEmbeddingVector:
        """
        Extracts L2-normalized speaker embedding vector (ECAPA-TDNN 192-dim primary, DSP 128-dim fallback).
        """
        if len(samples) < 320:
            zero_vec = [0.0] * (self.embedding_dim if (self.is_neural_active and not force_dsp) else self.dsp_dim)
            return SpeakerEmbeddingVector(
                speaker_id=speaker_id,
                embedding=zero_vec,
                dimension=len(zero_vec),
                energy_norm=0.0,
                model_version=self.model_version,
                engine_type="DSP_FALLBACK"
            )

        # 1. Primary Neural Path (ECAPA-TDNN ONNX Runtime)
        if self.is_neural_active and not force_dsp:
            try:
                audio_float = samples.astype(np.float32)
                if np.max(np.abs(audio_float)) > 1.0:
                    audio_float = audio_float / 32768.0

                audio_tensor = audio_float.reshape(1, -1)
                input_name = self._cached_session.get_inputs()[0].name
                outputs = self._cached_session.run(None, {input_name: audio_tensor})

                raw_emb = outputs[0].squeeze()
                if raw_emb.ndim == 1 and len(raw_emb) > 0 and np.all(np.isfinite(raw_emb)):
                    norm = float(np.linalg.norm(raw_emb))
                    if norm > 1e-6:
                        normalized_vec = raw_emb / norm
                    else:
                        normalized_vec = raw_emb

                    return SpeakerEmbeddingVector(
                        speaker_id=speaker_id,
                        embedding=[round(float(x), 5) for x in normalized_vec],
                        dimension=len(normalized_vec),
                        energy_norm=round(norm, 4),
                        model_version=self.model_version,
                        engine_type="NEURAL"
                    )
            except Exception as exc:
                logger.warning(
                    f"[Speaker] Neural ECAPA-TDNN inference failed: {exc}. "
                    "Routing to deterministic DSP fallback."
                )

        # 2. Deterministic DSP Fallback Path
        return self._extract_dsp_fallback(samples, speaker_id=speaker_id)
