"""
Acoustic Feature Extraction for Deepfake & Synthetic Voice Detection.

Computes:
  - 24 Log-Mel spectrogram mean features (Mel triangular filterbank, then log)
  - 20 LFCC features (linear triangular filterbank, log, DCT-II)
  - Spectral flatness (Wiener entropy)
  - Magnitude-spectrum temporal variation (labelled vocoder_phase_distortion)
  - High-to-low frequency energy ratio (labelled high_freq_attenuation_ratio)
  - Temporal energy variance (unnormalized; see note below)

PREPROCESSING NOTE:
  This extractor expects RAW (unprocessed) float32 PCM samples.
  It applies DC offset removal and pre-emphasis internally (once).
  Do NOT pass pre-processed samples — that would apply preprocessing twice.

FEATURE NAMING NOTE:
  - 'vocoder_phase_distortion': actually mean absolute frame-to-frame magnitude
    difference (no phase angle is used). Name retained for API compatibility.
  - 'high_freq_attenuation_ratio': actually the high-to-low energy ratio
    (higher value = more high-frequency energy). Name retained for API compatibility.
  - 'temporal_variance': variance of per-frame total power. NOT normalized by
    mean power or audio length. Units are (power^2). Retained without normalization
    to avoid changing the relative scale of already-trained models.
"""

import numpy as np
from typing import List
from ai.app.deepfake.preprocessing import AudioPreprocessor
from ai.app.deepfake.types import DeepfakeFeatureVector


class AcousticFeatureExtractor:
    def __init__(self, sample_rate: int = 16000, num_mel_bins: int = 24, num_lfcc_bins: int = 20):
        self.sample_rate = sample_rate
        self.num_mel_bins = num_mel_bins
        self.num_lfcc_bins = num_lfcc_bins
        self.preprocessor = AudioPreprocessor(sample_rate=sample_rate)

        # Pre-compute fixed filterbanks for this sample_rate + nfft combination.
        # They are independent of audio content, so caching avoids recomputation.
        self._nfft = 512
        self._mel_fbank = self._build_mel_filterbank(self._nfft)         # (num_mel_bins, nfft//2+1)
        self._lfcc_fbank = self._build_linear_filterbank(self._nfft)     # (num_lfcc_bins, nfft//2+1)

    # ------------------------------------------------------------------
    # Filterbank builders (computed once at init)
    # ------------------------------------------------------------------

    def _build_mel_filterbank(self, nfft: int) -> np.ndarray:
        """Build standard Mel triangular filterbank matrix.

        Uses the standard HTK formula (80 Hz – Nyquist, 1127*ln(1+f/700)).

        Returns:
            np.ndarray of shape (num_mel_bins, nfft//2 + 1), dtype float64.
        """
        low_hz = 80.0
        high_hz = self.sample_rate / 2.0

        def hz_to_mel(hz: float) -> float:
            return 2595.0 * np.log10(1.0 + hz / 700.0)

        def mel_to_hz(mel: float) -> float:
            return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)

        low_mel = hz_to_mel(low_hz)
        high_mel = hz_to_mel(high_hz)
        mel_points = np.linspace(low_mel, high_mel, self.num_mel_bins + 2)
        hz_points = np.array([mel_to_hz(m) for m in mel_points])
        bin_idx = np.floor((nfft + 1) * hz_points / self.sample_rate).astype(int)

        n_fft_bins = nfft // 2 + 1
        fbank = np.zeros((self.num_mel_bins, n_fft_bins), dtype=np.float64)
        for m in range(1, self.num_mel_bins + 1):
            lo = bin_idx[m - 1]
            ctr = bin_idx[m]
            hi = bin_idx[m + 1]
            # Rising slope
            if ctr > lo:
                for k in range(lo, ctr):
                    fbank[m - 1, k] = (k - lo) / (ctr - lo)
            # Falling slope
            if hi > ctr:
                for k in range(ctr, hi):
                    fbank[m - 1, k] = (hi - k) / (hi - ctr)
        return fbank

    def _build_linear_filterbank(self, nfft: int) -> np.ndarray:
        """Build linear-frequency triangular filterbank for LFCC.

        Identical to the original compute_linear_filterbank logic,
        kept as a cached matrix.

        Returns:
            np.ndarray of shape (num_lfcc_bins, nfft//2 + 1), dtype float32.
        """
        low_freq = 0.0
        high_freq = self.sample_rate / 2.0
        n_fft_bins = int(nfft / 2 + 1)
        linear_points = np.linspace(low_freq, high_freq, self.num_lfcc_bins + 2)
        bin_points = np.floor((nfft + 1) * linear_points / self.sample_rate).astype(int)

        fbank = np.zeros((self.num_lfcc_bins, n_fft_bins), dtype=np.float32)
        for m in range(1, self.num_lfcc_bins + 1):
            f_m_minus = bin_points[m - 1]
            f_m = bin_points[m]
            f_m_plus = bin_points[m + 1]
            for k in range(f_m_minus, f_m):
                if f_m != f_m_minus:
                    fbank[m - 1, k] = (k - f_m_minus) / (f_m - f_m_minus)
            for k in range(f_m, f_m_plus):
                if f_m_plus != f_m:
                    fbank[m - 1, k] = (f_m_plus - k) / (f_m_plus - f_m)
        return fbank

    @staticmethod
    def _dct2(x: np.ndarray, n_out: int) -> np.ndarray:
        """Compute DCT-II of a 1-D array and return the first n_out coefficients.

        DCT-II: X[k] = sum_{n=0}^{N-1} x[n] * cos(pi*(2n+1)*k / (2*N))

        Implemented via direct summation (numpy outer product) to avoid
        dependency on scipy. Deterministic and numerically stable for N<=64.

        Args:
            x:     1-D float array of length N.
            n_out: Number of output DCT coefficients to return (<= N).

        Returns:
            1-D float array of length n_out.
        """
        N = len(x)
        n = np.arange(N, dtype=np.float64)
        k = np.arange(n_out, dtype=np.float64)
        # cos_matrix[n, k] = cos(pi * (2n+1) * k / (2N))
        cos_matrix = np.cos(np.pi * np.outer(2.0 * n + 1.0, k) / (2.0 * N))
        return (x @ cos_matrix).astype(np.float32)  # shape (n_out,)

    # ------------------------------------------------------------------
    # Main feature extraction
    # ------------------------------------------------------------------

    def extract_features(self, raw_samples: np.ndarray) -> DeepfakeFeatureVector:
        """Extract 48-dim acoustic features from raw PCM samples.

        Args:
            raw_samples: 1-D float32 array of raw (unprocessed) audio at
                         self.sample_rate Hz, mono. Do NOT pass pre-processed
                         audio — preprocessing is applied once here.

        Returns:
            DeepfakeFeatureVector with exactly:
                24 log_mel_spectrogram_mean  (Mel filterbank -> log)
                20 lfcc_coefficients         (linear filterbank -> log -> DCT-II)
                1  spectral_flatness         (Wiener entropy on mean power spectrum)
                1  vocoder_phase_distortion  (mean |frame-to-frame magnitude diff|)
                1  high_freq_attenuation_ratio (high-to-low power ratio, >= 4 kHz)
                1  temporal_variance         (variance of per-frame total power)
        """
        if len(raw_samples) < 160:
            # Audio too short for even one frame: return zero vector.
            return DeepfakeFeatureVector(
                log_mel_spectrogram_mean=[0.0] * self.num_mel_bins,
                lfcc_coefficients=[0.0] * self.num_lfcc_bins,
                spectral_flatness=0.0,
                vocoder_phase_distortion=0.0,
                high_freq_attenuation_ratio=0.0,
                temporal_variance=0.0,
            )

        nfft = self._nfft

        # 1. Preprocessing: DC offset removal + pre-emphasis (applied ONCE here)
        clean_samples = self.preprocessor.preprocess(raw_samples)

        # 2. Frame the signal (25 ms frame, 10 ms hop at 16 kHz)
        frames = self.preprocessor.frame_signal(clean_samples, frame_size=400, hop_size=160)

        # 3. FFT power spectrum: shape (N_frames, nfft//2+1)
        mag_frames = np.abs(np.fft.rfft(frames, n=nfft))                  # magnitude
        pow_frames = (1.0 / nfft) * (mag_frames ** 2)                     # power

        # ── 4. LOG-MEL FEATURES (24 bins) ─────────────────────────────────────
        # Mean power spectrum across frames: shape (nfft//2+1,)
        mean_pow = np.mean(pow_frames, axis=0)
        # Apply Mel triangular filterbank: shape (num_mel_bins,)
        mel_energies = np.dot(self._mel_fbank, mean_pow).astype(np.float64)
        mel_energies = np.maximum(mel_energies, 1e-8)
        log_mel_mean = [round(float(x), 4) for x in np.log(mel_energies)]

        # ── 5. LFCC FEATURES (20 bins) — linear filterbank + log + DCT-II ─────
        # Apply linear-frequency filterbank to per-frame power: shape (N_frames, num_lfcc_bins)
        filter_energies = np.dot(pow_frames, self._lfcc_fbank.T)
        filter_energies = np.where(filter_energies == 0, np.finfo(float).eps, filter_energies)
        log_filter_energies = np.log(filter_energies)                      # (N_frames, num_lfcc_bins)
        # Mean across frames: shape (num_lfcc_bins,)
        log_filter_mean = np.mean(log_filter_energies, axis=0)
        # DCT-II to decorrelate: shape (num_lfcc_bins,)
        lfcc_arr = self._dct2(log_filter_mean, self.num_lfcc_bins)
        lfcc_mean = [round(float(x), 4) for x in lfcc_arr]

        # ── 6. SCALAR FEATURES ────────────────────────────────────────────────

        # Spectral flatness (Wiener entropy): geo_mean / arith_mean of mean power spectrum.
        # Synthesised speech can exhibit unnaturally flat or peaked spectra.
        geo_mean = np.exp(np.mean(np.log(np.maximum(mean_pow, 1e-8))))
        arith_mean = np.mean(mean_pow)
        spectral_flatness = float(geo_mean / max(arith_mean, 1e-8))

        # High-to-low frequency energy ratio (threshold: 4 kHz).
        # Name: high_freq_attenuation_ratio (API-stable).
        # Semantics: ratio > 1 means more high-frequency than low-frequency energy.
        freqs = np.fft.rfftfreq(nfft, 1.0 / self.sample_rate)
        high_band_mask = freqs >= 4000.0
        high_band_energy = float(np.sum(mean_pow[high_band_mask])) if np.any(high_band_mask) else 0.0
        low_band_energy = float(np.sum(mean_pow[~high_band_mask])) if np.any(~high_band_mask) else 1e-6
        high_freq_ratio = high_band_energy / max(low_band_energy, 1e-6)

        # Mean absolute frame-to-frame magnitude difference.
        # Name: vocoder_phase_distortion (API-stable).
        # Semantics: measures temporal variation of the magnitude spectrum.
        # No phase angle is used in this calculation.
        diff_mag = np.diff(mag_frames, axis=0)
        vocoder_phase_distortion = float(np.mean(np.abs(diff_mag))) if len(diff_mag) > 0 else 0.0

        # Variance of per-frame total power (unnormalized).
        # Name: temporal_variance (API-stable).
        # Units: (power)^2. NOT normalized by mean power or audio length.
        # Captures energy dynamics over time; scale-sensitive to recording amplitude.
        frame_energies = np.sum(pow_frames, axis=1)
        temporal_variance = float(np.var(frame_energies))

        return DeepfakeFeatureVector(
            log_mel_spectrogram_mean=log_mel_mean,
            lfcc_coefficients=lfcc_mean,
            spectral_flatness=round(spectral_flatness, 4),
            vocoder_phase_distortion=round(vocoder_phase_distortion, 4),
            high_freq_attenuation_ratio=round(high_freq_ratio, 4),
            temporal_variance=round(temporal_variance, 5),
        )
