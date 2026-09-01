"""
ASR Audio Preprocessor & Silence Gate
"""

import numpy as np


class ASRPreprocessor:
    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate

    def condition_audio(self, samples: np.ndarray) -> np.ndarray:
        if len(samples) < 2:
            return samples
        # Remove DC offset
        centered = samples - np.mean(samples)
        # Normalization
        max_amp = np.max(np.abs(centered))
        if max_amp > 1e-4:
            normalized = centered / max_amp * 0.85
        else:
            normalized = centered
        return normalized.astype(np.float32)
