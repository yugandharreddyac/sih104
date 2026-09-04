"""SIH104 — Feature Extraction Pipeline.

Wraps the existing AcousticFeatureExtractor into a deterministic 48-dimensional
float vector with a fixed, documented ordering.

PREPROCESSING NOTE:
    Audio preprocessing (DC offset removal, pre-emphasis, framing) is performed
    ONCE inside AcousticFeatureExtractor.extract_features(). This wrapper must
    pass RAW audio samples to the extractor — NOT pre-processed samples.

Feature Vector Layout (48 dimensions):
  [0:24]   log_mel_00 to log_mel_23   — Log-Mel mean (Mel triangular filterbank,
                                         80 Hz–8 kHz, 24 bins, log energy)
  [24:44]  lfcc_00 to lfcc_19         — LFCC: linear filterbank → log → DCT-II
  [44]     spectral_flatness           — Wiener entropy (geo_mean / arith_mean)
  [45]     vocoder_phase_distortion    — Mean |frame-to-frame magnitude diff|
                                         (no phase angle used; name kept for API)
  [46]     high_freq_attenuation_ratio — High-to-low energy ratio (>= 4 kHz)
                                         (higher = more high-freq; name kept for API)
  [47]     temporal_variance           — Variance of per-frame total power
                                         (unnormalized; scale-sensitive to amplitude)

Usage:
    from ai.app.ml.feature_pipeline import FeaturePipeline

    pipeline = FeaturePipeline()
    vec = pipeline.extract(raw_samples_float32)  # np.ndarray shape (48,)
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Feature vector specification
# These must stay fixed for the lifetime of a trained model artifact.
# ─────────────────────────────────────────────────────────────────────────────

_N_LOG_MEL = 24   # matches AcousticFeatureExtractor.num_mel_bins
_N_LFCC = 20      # matches AcousticFeatureExtractor.num_lfcc_bins

FEATURE_NAMES: list[str] = (
    [f"log_mel_{i:02d}" for i in range(_N_LOG_MEL)]
    + [f"lfcc_{i:02d}" for i in range(_N_LFCC)]
    + ["spectral_flatness", "vocoder_phase_distortion",
       "high_freq_attenuation_ratio", "temporal_variance"]
)

FEATURE_DIM: int = len(FEATURE_NAMES)  # 48


class FeaturePipeline:
    """Deterministic 48-dim acoustic feature extractor for SIH104.

    Wraps AcousticFeatureExtractor and converts DeepfakeFeatureVector to
    a fixed-order numpy float32 vector.

    Preprocessing (DC offset removal, pre-emphasis) is performed ONCE inside
    AcousticFeatureExtractor. This class passes raw audio directly to the
    extractor without any prior preprocessing step.

    Args:
        sample_rate: Expected audio sample rate after FFmpeg decode (default 16000 Hz).
        ffmpeg_exe:  Optional explicit FFmpeg binary path.
    """

    def __init__(self, sample_rate: int = 16000, ffmpeg_exe: Optional[str] = None) -> None:
        self.sample_rate = sample_rate
        self._ffmpeg_exe = ffmpeg_exe

        from ai.app.deepfake.features import AcousticFeatureExtractor  # type: ignore

        self._extractor = AcousticFeatureExtractor(sample_rate=sample_rate)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract(self, raw_samples: np.ndarray) -> np.ndarray:
        """Extract features from raw PCM samples.

        Args:
            raw_samples: 1-D float32 array of RAW audio at self.sample_rate Hz
                         (mono, unprocessed — as produced by FFmpeg decode).
                         Do NOT pass pre-processed audio.

        Returns:
            np.ndarray of shape (FEATURE_DIM,) dtype float32.

        Raises:
            ValueError: If raw_samples is not 1-D, or if the extracted vector
                        contains NaN or Inf values.
        """
        if not isinstance(raw_samples, np.ndarray) or raw_samples.ndim != 1:
            raise ValueError("raw_samples must be a 1-D numpy array.")

        # Pass raw samples directly to the extractor.
        # AcousticFeatureExtractor.extract_features() applies preprocessing
        # (DC offset removal + pre-emphasis) exactly once, internally.
        feat = self._extractor.extract_features(raw_samples)

        # Flatten to fixed-order vector
        vec = self._flatten(feat)

        # Sanity check
        if not np.isfinite(vec).all():
            bad = np.where(~np.isfinite(vec))[0]
            bad_names = [FEATURE_NAMES[i] for i in bad]
            raise ValueError(
                f"Non-finite values in feature vector at positions "
                f"{bad.tolist()} ({bad_names}). "
                "Audio may be silent or corrupt."
            )

        return vec

    def extract_from_file(self, flac_path: str) -> np.ndarray:
        """Decode an audio file with FFmpeg and extract features.

        Args:
            flac_path: Path to the audio file (FLAC, WAV, or any FFmpeg format).

        Returns:
            np.ndarray of shape (FEATURE_DIM,) dtype float32.
        """
        from ai.app.ml.ffmpeg_util import decode_audio_to_float32  # type: ignore

        samples = decode_audio_to_float32(
            flac_path,
            ffmpeg_exe=self._ffmpeg_exe,
            target_sr=self.sample_rate,
        )
        return self.extract(samples)

    @staticmethod
    def feature_names() -> list[str]:
        """Return the ordered list of feature names."""
        return list(FEATURE_NAMES)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _flatten(feat) -> np.ndarray:
        """Convert DeepfakeFeatureVector to a deterministic 48-dim float32 array.

        Field ordering is fixed and must not change between runs or model versions.
        """
        values: list[float] = []

        # Log-Mel (24)
        for v in feat.log_mel_spectrogram_mean:
            values.append(float(v))

        # LFCC (20)
        for v in feat.lfcc_coefficients:
            values.append(float(v))

        # 4 scalar features
        values.append(float(feat.spectral_flatness))
        values.append(float(feat.vocoder_phase_distortion))
        values.append(float(feat.high_freq_attenuation_ratio))
        values.append(float(feat.temporal_variance))

        vec = np.array(values, dtype=np.float32)

        if len(vec) != FEATURE_DIM:
            raise ValueError(
                f"Feature dimension mismatch: expected {FEATURE_DIM}, got {len(vec)}. "
                "AcousticFeatureExtractor configuration may have changed."
            )

        return vec
