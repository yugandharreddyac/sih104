"""
Replay Attack Feature Extractor (Deterministic DSP / Heuristic Fallback)
Extracts physical loudspeaker playback and channel acoustic artifacts:
1. High-frequency spectral roll-off & spectral decay slope
2. Channel bandwidth & narrowband telephony classification
3. Spectral flatness (Wiener entropy / tone-to-noise distribution)
4. Spectral centroid & bandwidth (spread) in Hz
5. Double-room reverberation decay anomaly from envelope autocorrelation
6. Transducer non-linear harmonic distortion
"""

import numpy as np
from ai.app.replay.types import ReplayFeatureVector


class ReplayFeatureExtractor:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def extract_features(self, samples: np.ndarray) -> ReplayFeatureVector:
        """
        Extracts deterministic DSP replay acoustic cues from float32 audio samples.
        Guarantees numerical stability on silence, NaNs, Infs, clipping, and short audio.
        """
        samples = np.asarray(samples, dtype=np.float32)
        if samples.ndim > 1:
            samples = np.mean(samples, axis=-1 if samples.shape[-1] <= 2 else 0)
        samples = samples.flatten()

        # Sanitize NaNs and Infs
        if not np.all(np.isfinite(samples)):
            samples = np.nan_to_num(samples, nan=0.0, posinf=0.0, neginf=0.0)

        # Handle very short signals (<20 ms at 16 kHz)
        if len(samples) < 320:
            return ReplayFeatureVector(
                spectral_decay_slope=0.0,
                high_freq_cutoff_ratio=0.0,
                reverberation_decay_time_ms=0.0,
                channel_impulse_distortion=0.0,
                is_narrowband=False,
                effective_bandwidth_hz=float(self.sample_rate / 2.0),
                spectral_flatness=0.0,
                spectral_centroid_hz=0.0,
                spectral_bandwidth_hz=0.0
            )

        # Overall signal energy and amplitude distribution
        rms = float(np.sqrt(np.mean(samples ** 2)))
        var_samples = float(np.var(samples))
        peak_amp = float(np.max(np.abs(samples)))

        # 1. FFT Power Spectrum & Magnitude Spectrum
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

        # 2. Spectral Flatness (Wiener Entropy)
        # Ratio of geometric mean to arithmetic mean of power spectrum P = mag^2.
        # Measures tone-to-noise distribution in [0.0, 1.0].
        # Highly tonal signals (clean speech / harmonic formants) have low flatness (near 0.0).
        # Diffuse noise-like signals and flattened loudspeaker acoustic responses have higher flatness.
        power_spec = mag ** 2
        arithmetic_mean = float(np.mean(power_spec))
        if arithmetic_mean > 1e-9 and rms >= 0.005:
            log_power = np.log(power_spec + 1e-12)
            geometric_mean = float(np.exp(np.mean(log_power)))
            spectral_flatness = float(np.clip(geometric_mean / max(arithmetic_mean, 1e-9), 0.0, 1.0))
        else:
            spectral_flatness = 0.0

        # 3. Spectral Centroid & Spectral Bandwidth (Spread) in Hz
        # Centroid: Frequency center of mass.
        # Bandwidth: Frequency standard deviation around the centroid.
        if total_energy > 1e-5 and rms >= 0.005:
            spectral_centroid = float(np.sum(freqs * mag) / total_energy)
            spread_sq = float(np.sum(((freqs - spectral_centroid) ** 2) * mag) / total_energy)
            spectral_bandwidth = float(np.sqrt(max(0.0, spread_sq)))
        else:
            spectral_centroid = 0.0
            spectral_bandwidth = 0.0

        # 4. Channel Bandwidth Classification (Narrowband PSTN / G.711 vs Wideband)
        # Narrowband telephone speech exhibits severe cutoff above 3.4-4.0 kHz.
        # Classify as narrowband if:
        # a) Max frequency < 4.5 kHz (e.g. native 8 kHz audio), OR
        # b) High band energy fraction is minimal (<5%) and cutoff ratio < 0.04 and centroid is in voice band
        is_narrowband = bool(
            (freqs[-1] <= 4500.0) or
            (high_freq_cutoff_ratio < 0.04 and high_band_fraction < 0.05 and spectral_centroid < 2800.0)
        )
        effective_bandwidth = 3800.0 if is_narrowband else float(min(self.sample_rate / 2.0, 8000.0))

        # 5. Spectral Decay Slope (Log-linear regression across spectrum)
        log_freqs = np.log(np.maximum(freqs[1:], 1.0))
        log_mag = np.log(np.maximum(mag[1:], 1e-6))
        if len(log_freqs) > 1 and np.std(log_mag) > 1e-5 and rms >= 0.005:
            try:
                poly_slope, _ = np.polyfit(log_freqs, log_mag, 1)
                slope = float(poly_slope) if np.isfinite(poly_slope) else 0.0
            except Exception:
                slope = 0.0
        else:
            slope = 0.0
        slope = float(np.clip(slope, -20.0, 20.0))

        # 6. Double Reverberation Decay Anomaly Estimate
        # Replayed audio played in an acoustic room exhibits extended autocorrelation decay of its energy envelope.
        # Hardened against low energy, silence, and flat stationary noise.
        if rms >= 0.01 and peak_amp >= 0.02 and var_samples > 1e-5:
            env = np.abs(samples)
            env_centered = env - np.mean(env)
            if np.std(env_centered) > 1e-4:
                autocorr = np.correlate(env_centered, env_centered, mode='full')
                autocorr = autocorr[len(autocorr)//2:]
                max_ac = float(autocorr[0]) if len(autocorr) > 0 else 0.0
                if max_ac > 1e-6:
                    autocorr_norm = autocorr / max_ac
                    decay_idx = np.where(autocorr_norm < 0.3)[0]
                    decay_time_ms = float(decay_idx[0] / self.sample_rate * 1000.0) if len(decay_idx) > 0 else 20.0
                else:
                    decay_time_ms = 0.0
            else:
                decay_time_ms = 10.0
        else:
            decay_time_ms = 0.0
        decay_time_ms = float(np.clip(decay_time_ms, 0.0, 1000.0))

        # 7. Transducer Harmonic Non-Linearity (Normalized non-linear envelope residual)
        # Evaluates harmonic impulse distortion characteristic of physical loudspeaker cone excursion.
        # Hardened against silence, low-energy noise, ADC clipping, and pathological variance.
        clipping_ratio = float(np.mean(np.abs(samples) >= 0.98))
        if rms >= 0.02 and var_samples > 1e-4 and clipping_ratio < 0.15:
            cubic_fit = float(np.mean((samples ** 3) ** 2))
            raw_distortion = float(cubic_fit / ((var_samples + 1e-3) ** 3))
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
            effective_bandwidth_hz=round(effective_bandwidth, 1),
            spectral_flatness=round(spectral_flatness, 4),
            spectral_centroid_hz=round(spectral_centroid, 2),
            spectral_bandwidth_hz=round(spectral_bandwidth, 2)
        )
