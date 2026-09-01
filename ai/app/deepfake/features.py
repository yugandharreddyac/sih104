"""
Acoustic Feature Extraction for Deepfake & Synthetic Voice Detection
Computes Log-Mel Filterbanks, Linear Frequency Cepstral Coefficients (LFCC),
Spectral Flatness, and Neural Vocoder Phase Distortion Signatures.
"""

import numpy as np
from typing import Tuple, Dict, Any
from ai.app.deepfake.preprocessing import AudioPreprocessor
from ai.app.deepfake.types import DeepfakeFeatureVector


class AcousticFeatureExtractor:
    def __init__(self, sample_rate: int = 16000, num_mel_bins: int = 24, num_lfcc_bins: int = 20):
        self.sample_rate = sample_rate
        self.num_mel_bins = num_mel_bins
        self.num_lfcc_bins = num_lfcc_bins
        self.preprocessor = AudioPreprocessor(sample_rate=sample_rate)

    def compute_linear_filterbank(self, num_filters: int, nfft: int) -> np.ndarray:
        """Constructs linearly-spaced triangular filterbank (LFCC basis)."""
        low_freq = 0.0
        high_freq = self.sample_rate / 2.0
        linear_points = np.linspace(low_freq, high_freq, num_filters + 2)
        bin_points = np.floor((nfft + 1) * linear_points / self.sample_rate).astype(int)

        fbank = np.zeros((num_filters, int(nfft / 2 + 1)), dtype=np.float32)
        for m in range(1, num_filters + 1):
            f_m_minus = bin_points[m - 1]
            f_m = bin_points[m]
            f_m_plus = bin_points[m + 1]

            for k in range(f_m_minus, f_m):
                if f_m != f_m_minus:
                    fbank[m - 1, k] = (k - bin_points[m - 1]) / (f_m - f_m_minus)
            for k in range(f_m, f_m_plus):
                if f_m_plus != f_m:
                    fbank[m - 1, k] = (bin_points[m + 1] - k) / (f_m_plus - f_m)

        return fbank

    def extract_features(self, raw_samples: np.ndarray) -> DeepfakeFeatureVector:
        """
        Extracts multi-domain spectral and LFCC acoustic features from 16kHz audio samples.
        """
        if len(raw_samples) < 160:
            # Minimal dummy features if chunk is empty or tiny
            return DeepfakeFeatureVector(
                log_mel_spectrogram_mean=[0.0] * self.num_mel_bins,
                lfcc_coefficients=[0.0] * self.num_lfcc_bins,
                spectral_flatness=0.0,
                vocoder_phase_distortion=0.0,
                high_freq_attenuation_ratio=0.0,
                temporal_variance=0.0
            )

        # 1. Preprocess & Window Framing (25ms window, 10ms hop)
        clean_samples = self.preprocessor.preprocess(raw_samples)
        frames = self.preprocessor.frame_signal(clean_samples, frame_size=400, hop_size=160)

        # 2. FFT Power Spectrum
        nfft = 512
        mag_frames = np.abs(np.fft.rfft(frames, n=nfft))
        pow_frames = (1.0 / nfft) * (mag_frames ** 2)

        # 3. LFCC Feature Computation (Linear Frequency Cepstral Coefficients)
        lfcc_fbank = self.compute_linear_filterbank(self.num_lfcc_bins, nfft)
        filter_energies = np.dot(pow_frames, lfcc_fbank.T)
        filter_energies = np.where(filter_energies == 0, np.finfo(float).eps, filter_energies)
        log_energies = np.log(filter_energies)

        # Discrete Cosine Transform (DCT) to get cepstral coefficients
        from numpy.fft import fft
        dct_coeffs = np.mean(log_energies, axis=0)
        lfcc_mean = [round(float(x), 4) for x in dct_coeffs[:self.num_lfcc_bins]]

        # 4. Log-Mel Spectrogram Energy
        freqs = np.fft.rfftfreq(nfft, 1.0 / self.sample_rate)
        mel_energies = np.mean(pow_frames, axis=0)
        # Bin power into mel representation
        mel_step = len(mel_energies) // self.num_mel_bins
        log_mel_mean = []
        for b in range(self.num_mel_bins):
            start = b * mel_step
            end = min(len(mel_energies), (b + 1) * mel_step)
            val = float(np.mean(mel_energies[start:end])) if end > start else 0.0
            log_mel_mean.append(round(float(np.log(max(val, 1e-8))), 4))

        # 5. Spectral Flatness (Wiener entropy = geometric mean / arithmetic mean)
        # Synthesized speech often has unnaturally flat or smoothed spectral peaks in higher bands
        geo_mean = np.exp(np.mean(np.log(np.maximum(mel_energies, 1e-8))))
        arith_mean = np.mean(mel_energies)
        spectral_flatness = float(geo_mean / max(arith_mean, 1e-8))

        # 6. Vocoder Phase Distortion / High-Band Discontinuity
        # Neural vocoders (HiFi-GAN, WaveNet, MelGAN) often exhibit phase variance in 4k-8kHz
        high_band_mask = freqs >= 4000.0
        high_band_energy = np.sum(mel_energies[high_band_mask]) if np.any(high_band_mask) else 0.0
        low_band_energy = np.sum(mel_energies[~high_band_mask]) if np.any(~high_band_mask) else 1e-6
        high_freq_ratio = float(high_band_energy / max(low_band_energy, 1e-6))

        # Temporal energy variance across frames
        frame_energies = np.sum(pow_frames, axis=1)
        temporal_variance = float(np.var(frame_energies))

        # Phase jitter approximation across successive frames
        diff_mag = np.diff(mag_frames, axis=0)
        vocoder_phase_distortion = float(np.mean(np.abs(diff_mag))) if len(diff_mag) > 0 else 0.0

        return DeepfakeFeatureVector(
            log_mel_spectrogram_mean=log_mel_mean,
            lfcc_coefficients=lfcc_mean,
            spectral_flatness=round(spectral_flatness, 4),
            vocoder_phase_distortion=round(vocoder_phase_distortion, 4),
            high_freq_attenuation_ratio=round(high_freq_ratio, 4),
            temporal_variance=round(temporal_variance, 5)
        )
