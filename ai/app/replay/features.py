"""
Replay Attack Feature Extractor
Extracts physical loudspeaker playback artifacts: high-frequency spectral roll-off,
double-room reverberation decay anomalies, and transducer non-linear harmonic distortion.
"""

import numpy as np
from ai.app.replay.types import ReplayFeatureVector


class ReplayFeatureExtractor:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def extract_features(self, samples: np.ndarray) -> ReplayFeatureVector:
        """
        Extracts replay acoustic cues from float32 audio samples.
        """
        if len(samples) < 320:
            return ReplayFeatureVector(
                spectral_decay_slope=0.0,
                high_freq_cutoff_ratio=0.0,
                reverberation_decay_time_ms=0.0,
                channel_impulse_distortion=0.0
            )

        # 1. FFT Power Spectrum
        nfft = 512
        mag = np.abs(np.fft.rfft(samples, n=nfft))
        freqs = np.fft.rfftfreq(nfft, 1.0 / self.sample_rate)

        # 2. High-Frequency Spectral Roll-off & Cutoff (> 4500 Hz)
        low_band = mag[freqs < 3000.0]
        high_band = mag[freqs >= 4500.0]

        low_energy = float(np.sum(low_band)) if len(low_band) > 0 else 1e-5
        high_energy = float(np.sum(high_band)) if len(high_band) > 0 else 1e-5
        high_freq_cutoff_ratio = float(high_energy / max(low_energy, 1e-5))

        # 3. Spectral Decay Slope (Log-linear regression across spectrum)
        log_freqs = np.log(np.maximum(freqs[1:], 1.0))
        log_mag = np.log(np.maximum(mag[1:], 1e-6))
        slope, _ = np.polyfit(log_freqs, log_mag, 1)

        # 4. Double Reverberation Decay Anomaly Estimate
        # Replayed audio exhibits delayed energy decay envelope
        env = np.abs(samples)
        env_centered = env - np.mean(env)
        if np.std(env_centered) > 1e-4:
            autocorr = np.correlate(env_centered, env_centered, mode='full')
            autocorr = autocorr[len(autocorr)//2:]
            if np.max(autocorr) > 1e-6:
                autocorr /= np.max(autocorr)
                decay_idx = np.where(autocorr < 0.3)[0]
                decay_time_ms = float(decay_idx[0] / self.sample_rate * 1000.0) if len(decay_idx) > 0 else 20.0
            else:
                decay_time_ms = 0.0
        else:
            decay_time_ms = 10.0

        # 5. Transducer Harmonic Non-Linearity (Normalized non-linear envelope residual)
        var_samples = float(np.var(samples))
        if var_samples > 1e-5:
            # Non-linear clipping / saturation residual
            cubic_fit = np.mean((samples ** 3) ** 2)
            channel_distortion = float(cubic_fit / (var_samples ** 3))
        else:
            channel_distortion = 0.0

        return ReplayFeatureVector(
            spectral_decay_slope=round(float(slope), 4),
            high_freq_cutoff_ratio=round(high_freq_cutoff_ratio, 4),
            reverberation_decay_time_ms=round(decay_time_ms, 2),
            channel_impulse_distortion=round(channel_distortion, 5)
        )
