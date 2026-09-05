"""
Audio Quality Analysis & Signal Health Engine
Phase 2: Evaluates acoustic metrics (RMS dBFS, peak clipping, SNR estimate, silence ratio).
Core principle: Poor audio quality increases uncertainty; it NEVER generates fake spoof scores.
"""

import numpy as np
from ai.app.core.types import AudioQualityRating, AudioQualityResult


class AudioQualityAnalyzer:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.model_version = "signal_health_quality_v2"

    def analyze_samples(self, samples: np.ndarray, duration_ms: float = 0.0) -> AudioQualityResult:
        """
        Calculates signal health and normalized quality rating from float32 audio samples [-1.0, 1.0].
        """
        if len(samples) == 0:
            return AudioQualityResult(
                rating=AudioQualityRating.UNKNOWN,
                rms_dbfs=-96.0,
                peak_amplitude=0.0,
                clipping_ratio=0.0,
                silence_ratio=1.0,
                snr_estimate_db=0.0,
                dynamic_range_db=0.0,
                sample_rate=self.sample_rate,
                channels=1,
                duration_ms=duration_ms,
                uncertainty_penalty=0.5,
                notes="Empty audio chunk received."
            )

        # 1. Peak & Clipping Detection (Saturated samples >= 0.99)
        abs_samples = np.abs(samples)
        peak_amplitude = float(np.max(abs_samples))
        clipping_samples = np.sum(abs_samples >= 0.985)
        clipping_ratio = float(clipping_samples / len(samples))

        # 2. RMS in dBFS
        rms = float(np.sqrt(np.mean(samples ** 2)))
        if rms > 1e-6:
            rms_dbfs = float(20.0 * np.log10(rms))
        else:
            rms_dbfs = -96.0

        # 3. Silence Ratio (samples with amplitude < -42 dBFS / 0.008)
        silence_threshold = 0.008
        silence_samples = np.sum(abs_samples < silence_threshold)
        silence_ratio = float(silence_samples / len(samples))

        # 4. Dynamic Range & SNR Estimation
        # Sort amplitudes to find 95th percentile signal vs 10th percentile noise floor
        sorted_amps = np.sort(abs_samples)
        raw_p95 = float(sorted_amps[int(len(sorted_amps) * 0.95)])
        raw_p10 = float(sorted_amps[int(len(sorted_amps) * 0.10)])
        if raw_p95 < 1e-4:
            dynamic_range_db = 0.0
            snr_estimate_db = 0.0
        else:
            p95 = max(raw_p95, 1e-4)
            p10 = max(raw_p10, 1e-5)
            dynamic_range_db = float(20.0 * np.log10(p95 / p10))
            snr_estimate_db = max(0.0, dynamic_range_db - 3.0)

        # 5. Spectral Bandwidth & High-Frequency Ratio (Cutoff: 3.8 kHz)
        if len(samples) >= 160:
            n_samples = len(samples)
            freqs = np.fft.rfftfreq(n_samples, 1.0 / self.sample_rate)
            fft_mag = np.abs(np.fft.rfft(samples))
            fft_power = fft_mag ** 2
            total_power = float(np.sum(fft_power))

            if total_power > 1e-12:
                # 95% cumulative energy roll-off frequency as effective spectral bandwidth
                cum_power = np.cumsum(fft_power)
                idx_95 = int(np.searchsorted(cum_power, 0.95 * total_power))
                idx_95 = min(idx_95, len(freqs) - 1)
                spectral_bandwidth_hz = float(freqs[idx_95])

                # High-frequency ratio around 3.8 kHz cutoff vs passband (>= 300 Hz)
                cutoff_hz = 3800.0
                high_band = freqs >= cutoff_hz
                low_band = (freqs >= 300.0) & (freqs < cutoff_hz)

                high_power = float(np.sum(fft_power[high_band]))
                low_power = float(np.sum(fft_power[low_band]))

                high_frequency_ratio = float(high_power / (low_power + 1e-8))
            else:
                spectral_bandwidth_hz = 0.0
                high_frequency_ratio = 0.0
        else:
            spectral_bandwidth_hz = 0.0
            high_frequency_ratio = 0.0

        # 6. Quality Rating & Uncertainty Penalty Assignment
        notes = []
        uncertainty_penalty = 0.0

        # Check clipping
        if clipping_ratio > 0.05:
            notes.append(f"Severe audio clipping detected ({round(clipping_ratio * 100, 1)}% samples saturated).")
            uncertainty_penalty += 0.40
        elif clipping_ratio > 0.01:
            notes.append(f"Minor audio clipping detected ({round(clipping_ratio * 100, 1)}% samples saturated).")
            uncertainty_penalty += 0.20

        # Check signal level
        if rms_dbfs < -48.0:
            notes.append("Signal level extremely weak (low acoustic amplitude).")
            uncertainty_penalty += 0.35
        elif rms_dbfs < -38.0:
            notes.append("Signal level quiet.")
            uncertainty_penalty += 0.15

        # Check SNR
        if snr_estimate_db < 6.0 and rms_dbfs > -45.0:
            notes.append("High background noise floor relative to signal.")
            uncertainty_penalty += 0.25

        uncertainty_penalty = float(np.clip(uncertainty_penalty, 0.0, 1.0))

        # Final Quality Classification
        if clipping_ratio > 0.08 or (rms_dbfs < -52.0 and silence_ratio < 0.95) or snr_estimate_db < 4.0:
            rating = AudioQualityRating.POOR
        elif uncertainty_penalty > 0.25 or clipping_ratio > 0.01 or rms_dbfs < -35.0:
            rating = AudioQualityRating.DEGRADED
        else:
            rating = AudioQualityRating.GOOD

        if not notes:
            notes.append("Optimal acoustic levels and SNR for real-time analysis.")

        return AudioQualityResult(
            rating=rating,
            rms_dbfs=round(rms_dbfs, 2),
            peak_amplitude=round(peak_amplitude, 4),
            clipping_ratio=round(clipping_ratio, 4),
            silence_ratio=round(silence_ratio, 4),
            snr_estimate_db=round(snr_estimate_db, 2),
            dynamic_range_db=round(dynamic_range_db, 2),
            sample_rate=self.sample_rate,
            channels=1,
            duration_ms=round(duration_ms, 2),
            uncertainty_penalty=round(uncertainty_penalty, 3),
            notes=" | ".join(notes),
            spectral_bandwidth_hz=round(spectral_bandwidth_hz, 1),
            high_frequency_ratio=round(high_frequency_ratio, 4)
        )

    @staticmethod
    def is_telephony_bandwidth(quality: AudioQualityResult) -> bool:
        """
        Conservative acoustic classification of narrowband telephone band.
        Requires:
        - Non-poor quality, sufficient speech/signal level (RMS >= -42 dBFS, SNR >= 8.0 dB, silence <= 0.85)
        - Spectral energy roll-off <= 3800 Hz
        - Minimal energy above 3.8 kHz (high_frequency_ratio < 0.05)
        """
        if quality.rating == AudioQualityRating.POOR:
            return False
        if quality.spectral_bandwidth_hz is None or quality.high_frequency_ratio is None:
            return False
        if quality.rms_dbfs < -42.0 or quality.snr_estimate_db < 8.0 or quality.silence_ratio > 0.85:
            return False
        return quality.spectral_bandwidth_hz <= 3800.0 and quality.high_frequency_ratio < 0.05
