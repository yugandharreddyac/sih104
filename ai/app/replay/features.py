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
                channel_impulse_distortion=0.0,
                is_narrowband=False,
                effective_bandwidth_hz=8000.0
            )

        # 1. FFT Power Spectrum
        nfft = 512
        mag = np.abs(np.fft.rfft(samples, n=nfft))
        freqs = np.fft.rfftfreq(nfft, 1.0 / self.sample_rate)

        low_band = mag[freqs < 3000.0]
        high_band = mag[freqs >= 4500.0]

        total_energy = float(np.sum(mag)) if len(mag) > 0 else 1e-5
        low_energy = float(np.sum(low_band)) if len(low_band) > 0 else 1e-5
        high_energy = float(np.sum(high_band)) if len(high_band) > 0 else 1e-5
        high_freq_cutoff_ratio = float(high_energy / max(low_energy, 1e-5))
        high_band_fraction = float(high_energy / max(total_energy, 1e-5))

        # Channel bandwidth classification (Narrowband PSTN / G.711 exhibits cutoff above 3.8-4.5 kHz)
        is_narrowband = bool(high_freq_cutoff_ratio < 0.04 and high_band_fraction < 0.05)
        effective_bandwidth = 3800.0 if is_narrowband else 8000.0

        # 3. Spectral Decay Slope (Log-linear regression across spectrum)
        log_freqs = np.log(np.maximum(freqs[1:], 1.0))
        log_mag = np.log(np.maximum(mag[1:], 1e-6))
        if len(log_freqs) > 1 and np.std(log_mag) > 1e-5:
            try:
                poly_slope, _ = np.polyfit(log_freqs, log_mag, 1)
                slope = float(poly_slope) if np.isfinite(poly_slope) else 0.0
            except Exception:
                slope = 0.0
        else:
            slope = 0.0
        slope = float(np.clip(slope, -20.0, 20.0))

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
        decay_time_ms = float(np.clip(decay_time_ms, 0.0, 2000.0))

        # 5. Transducer Harmonic Non-Linearity (Normalized non-linear envelope residual)
        var_samples = float(np.var(samples))
        if var_samples > 1e-5:
            cubic_fit = np.mean((samples ** 3) ** 2)
            raw_distortion = float(cubic_fit / (var_samples ** 3))
            channel_distortion = float(raw_distortion) if np.isfinite(raw_distortion) else 0.0
        else:
            channel_distortion = 0.0
        channel_distortion = float(np.clip(channel_distortion, 0.0, 100.0))

        return ReplayFeatureVector(
            spectral_decay_slope=round(float(slope), 4),
            high_freq_cutoff_ratio=round(high_freq_cutoff_ratio, 4),
            reverberation_decay_time_ms=round(decay_time_ms, 2),
            channel_impulse_distortion=round(channel_distortion, 5),
            is_narrowband=is_narrowband,
            effective_bandwidth_hz=effective_bandwidth
        )
