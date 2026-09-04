"""VOXSHIELD Phase 1B.1 — Standalone Neural Training Prototype.

Contains the MiniAcousticCNN model, 2-channel Log-Mel + LFCC time-frequency
spectrogram extractor, dataset loader for the ASVspoof 2021 benchmark, and
CPU training/evaluation pipeline.
"""

from ai.neural_prototype.model import MiniAcousticCNN
from ai.neural_prototype.features import TwoChannelSpectrogramExtractor

__all__ = ["MiniAcousticCNN", "TwoChannelSpectrogramExtractor"]
