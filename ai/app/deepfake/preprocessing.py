"""
Acoustic Audio Preprocessing & Framing for Deepfake Detection
Pre-emphasis filtering, DC offset removal, and windowed framing.
"""

import numpy as np
from typing import List


class AudioPreprocessor:
    def __init__(self, sample_rate: int = 16000, pre_emphasis: float = 0.97):
        self.sample_rate = sample_rate
        self.pre_emphasis = pre_emphasis

    def preprocess(self, samples: np.ndarray) -> np.ndarray:
        """
        Removes DC offset and applies high-frequency boost pre-emphasis filter.
        """
        if len(samples) < 2:
            return samples

        # DC offset removal
        centered = samples - np.mean(samples)

        # Pre-emphasis filter: y[t] = x[t] - alpha * x[t-1]
        preemphasized = np.append(centered[0], centered[1:] - self.pre_emphasis * centered[:-1])
        return preemphasized.astype(np.float32)

    def frame_signal(self, samples: np.ndarray, frame_size: int = 400, hop_size: int = 160) -> np.ndarray:
        """
        Splits signal into windowed overlapping frames (e.g. 25ms frames with 10ms step at 16kHz).
        Applies Hamming window.
        """
        num_samples = len(samples)
        if num_samples < frame_size:
            # Zero-pad if shorter than one frame
            padded = np.pad(samples, (0, frame_size - num_samples), mode='constant')
            return (padded * np.hamming(frame_size)).reshape(1, frame_size)

        num_frames = 1 + int((num_samples - frame_size) / hop_size)
        frames = np.zeros((num_frames, frame_size), dtype=np.float32)
        window = np.hamming(frame_size)

        for i in range(num_frames):
            start = i * hop_size
            frames[i] = samples[start:start + frame_size] * window

        return frames
