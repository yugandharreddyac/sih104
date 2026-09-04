"""Two-Channel Time-Frequency Spectrogram Feature Extractor for MiniAcousticCNN.

Constructs a 2-channel 2D time-frequency representation from 16 kHz raw audio:
  - Channel 0: Log-Mel Spectrogram (60 Mel bins, 80 Hz - 8000 Hz)
  - Channel 1: LFCC Spectrogram (60 linear filterbank bins -> Log -> DCT-II)

Both channels are computed with matching STFT parameters:
  - Sample Rate: 16,000 Hz
  - Window Length: 400 samples (25.0 ms, Hamming window)
  - Hop Length: 160 samples (10.0 ms)
  - FFT Length: 512 bins (257 power spectrum bins)
  - Target Duration: 3.0 seconds (48,000 samples -> exactly 301 time frames)

Output Shape:
  torch.Tensor of shape (2, 60, 301), dtype=torch.float32.
"""

from __future__ import annotations

import torch
import torchaudio


class TwoChannelSpectrogramExtractor:
    """Extracts synchronized 2-channel Log-Mel and LFCC spectrograms from raw audio."""

    def __init__(
        self,
        sample_rate: int = 16000,
        n_fft: int = 512,
        win_length: int = 400,
        hop_length: int = 160,
        n_bins: int = 60,
        target_duration_sec: float = 3.0,
        pre_emphasis: float = 0.97,
    ) -> None:
        self.sample_rate = sample_rate
        self.n_fft = n_fft
        self.win_length = win_length
        self.hop_length = hop_length
        self.n_bins = n_bins
        self.target_samples = int(target_duration_sec * sample_rate)  # 48,000
        self.pre_emphasis = pre_emphasis

        # Pre-build Log-Mel transform
        self.mel_transform = torchaudio.transforms.MelSpectrogram(
            sample_rate=self.sample_rate,
            n_fft=self.n_fft,
            win_length=self.win_length,
            hop_length=self.hop_length,
            n_mels=self.n_bins,
            f_min=80.0,
            f_max=float(self.sample_rate // 2),
            power=2.0,
            normalized=False,
        )

        # Pre-build power spectrogram transform for LFCC
        self.power_spec_transform = torchaudio.transforms.Spectrogram(
            n_fft=self.n_fft,
            win_length=self.win_length,
            hop_length=self.hop_length,
            power=2.0,
            normalized=False,
        )

        # Pre-compute linear filterbank matrix: shape (n_freqs=257, n_filter=60)
        n_freqs = self.n_fft // 2 + 1
        self.linear_fb = torchaudio.functional.linear_fbanks(
            n_freqs=n_freqs,
            f_min=0.0,
            f_max=float(self.sample_rate // 2),
            n_filter=self.n_bins,
            sample_rate=self.sample_rate,
        )

        # Pre-compute DCT-II orthonormal matrix: shape (n_bins, n_bins)
        # DCT-II: X[k] = sum_{n=0}^{N-1} x[n] * cos(pi * (2n+1) * k / (2N))
        n = torch.arange(self.n_bins, dtype=torch.float32)
        k = torch.arange(self.n_bins, dtype=torch.float32).unsqueeze(1)
        self.dct_matrix = torch.cos(torch.pi * (2.0 * n + 1.0) * k / (2.0 * float(self.n_bins)))

    def preprocess_waveform(self, samples: torch.Tensor) -> torch.Tensor:
        """Preprocesses 1D raw waveform: DC offset, pre-emphasis, length normalization.

        Args:
            samples: 1D torch.Tensor of shape (N,) or 2D (1, N).

        Returns:
            1D torch.Tensor of exact length self.target_samples (48,000).
        """
        if samples.dim() == 2:
            samples = samples.squeeze(0)
        elif samples.dim() != 1:
            raise ValueError(f"Expected 1D or 2D audio tensor, got shape {samples.shape}")

        samples = samples.to(dtype=torch.float32)

        # Normalization if audio is 16-bit integer range
        if torch.max(torch.abs(samples)) > 1.0:
            samples = samples / 32768.0

        # DC offset removal
        samples = samples - torch.mean(samples)

        # Pre-emphasis filter: y[t] = x[t] - alpha * x[t-1]
        if len(samples) > 1:
            preemph = torch.cat([samples[:1], samples[1:] - self.pre_emphasis * samples[:-1]])
        else:
            preemph = samples

        # Fixed-length window: 48,000 samples (3.0s)
        n_samples = len(preemph)
        if n_samples >= self.target_samples:
            # Deterministic prefix crop
            waveform = preemph[: self.target_samples]
        else:
            # Deterministic zero-pad at end
            pad_amount = self.target_samples - n_samples
            waveform = torch.nn.functional.pad(preemph, (0, pad_amount), mode="constant", value=0.0)

        return waveform

    def extract(self, samples: torch.Tensor) -> torch.Tensor:
        """Extracts 2-channel normalized spectrogram tensor.

        Args:
            samples: 1D or 2D torch.Tensor containing raw 16kHz audio.

        Returns:
            torch.Tensor of shape (2, n_bins, n_frames), shape: (2, 60, 301).
        """
        wave = self.preprocess_waveform(samples)

        # ── Channel 0: Log-Mel Spectrogram ──────────────────────────────────
        mel_energies = self.mel_transform(wave)  # shape: (n_bins, n_frames)
        log_mel = torch.log(torch.clamp(mel_energies, min=1e-8))

        # Per-channel standardization
        mel_mean = log_mel.mean()
        mel_std = log_mel.std()
        log_mel_norm = (log_mel - mel_mean) / (mel_std + 1e-6)

        # ── Channel 1: LFCC Spectrogram ─────────────────────────────────────
        power_spec = self.power_spec_transform(wave)  # shape: (n_freqs=257, n_frames)
        # Apply linear filterbank: (frames, freqs) @ (freqs, filters) -> (frames, filters)
        linear_energies = torch.matmul(power_spec.transpose(-1, -2), self.linear_fb).transpose(-1, -2)
        log_linear = torch.log(torch.clamp(linear_energies, min=1e-8))  # (n_bins, n_frames)

        # Apply DCT-II along frequency dimension: (n_bins, n_bins) @ (n_bins, n_frames)
        lfcc = torch.matmul(self.dct_matrix, log_linear)  # (n_bins, n_frames)

        # Per-channel standardization
        lfcc_mean = lfcc.mean()
        lfcc_std = lfcc.std()
        lfcc_norm = (lfcc - lfcc_mean) / (lfcc_std + 1e-6)

        # ── Stack into (2, n_bins, n_frames) ────────────────────────────────
        two_channel = torch.stack([log_mel_norm, lfcc_norm], dim=0)

        # Defensive numerical sanitization
        if torch.isnan(two_channel).any() or torch.isinf(two_channel).any():
            two_channel = torch.nan_to_num(two_channel, nan=0.0, posinf=1.0, neginf=-1.0)

        return two_channel
