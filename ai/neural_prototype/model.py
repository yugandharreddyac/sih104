"""MiniAcousticCNN — Lightweight 2D CNN for Voice Deepfake Detection.

Designed specifically for real-time CPU evaluation and CPU training:
  - Input: 2-channel time-frequency tensor (2, n_bins, n_frames)
  - Channel 0: Log-Mel spectrogram
  - Channel 1: LFCC spectrogram
  - Output: 2 class logits (0=bonafide, 1=spoof)
  - Trainable parameters: ~93.7k
"""

from __future__ import annotations

import torch
import torch.nn as nn


class MiniAcousticCNN(nn.Module):
    """Lightweight 2-channel 2D Spectrogram Convolutional Neural Network."""

    def __init__(self, in_channels: int = 2, num_classes: int = 2, dropout_rate: float = 0.3) -> None:
        super().__init__()

        # Block 1: Conv2D(2 -> 32) + BatchNorm + ReLU + MaxPool
        self.block1 = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
        )

        # Block 2: Conv2D(32 -> 64) + BatchNorm + ReLU + MaxPool
        self.block2 = nn.Sequential(
            nn.Conv2d(32, 64, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
        )

        # Block 3: Conv2D(64 -> 128) + BatchNorm + ReLU
        self.block3 = nn.Sequential(
            nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
        )

        # Global Spatial Pooling + Regularization + Output Linear
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.dropout = nn.Dropout(p=dropout_rate)
        self.fc = nn.Linear(128, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            x: Input tensor of shape (batch_size, 2, n_bins, n_frames).

        Returns:
            Logits tensor of shape (batch_size, 2).
        """
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.pool(x)
        x = torch.flatten(x, 1)
        x = self.dropout(x)
        logits = self.fc(x)
        return logits

    def count_parameters(self) -> int:
        """Returns total trainable parameter count."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
