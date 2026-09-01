"""
Speaker Biometric Similarity & Likelihood Ratio Matcher
Computes cosine similarity between 128-dimensional acoustic speaker embeddings.
"""

import numpy as np
from typing import Tuple


class SpeakerSimilarityMatcher:
    def __init__(self, verification_threshold: float = 0.70, neural_threshold: float = 0.88):
        self.verification_threshold = verification_threshold
        self.neural_threshold = neural_threshold

    def compute_similarity(self, emb1: list, emb2: list) -> float:
        """
        Computes cosine similarity between two normalized embedding vectors in [-1.0, 1.0].
        """
        if len(emb1) != len(emb2) or len(emb1) == 0:
            return 0.0

        v1 = np.array(emb1, dtype=np.float32)
        v2 = np.array(emb2, dtype=np.float32)

        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)

        if norm1 < 1e-6 or norm2 < 1e-6:
            return 0.0

        dot = float(np.dot(v1, v2))
        cosine_sim = dot / (norm1 * norm2)
        return float(np.clip(cosine_sim, -1.0, 1.0))

    def evaluate_match(self, similarity: float, threshold: float = None, is_neural: bool = False) -> Tuple[bool, float]:
        """
        Returns (is_match, confidence) based on cosine similarity and threshold margin.
        """
        if threshold is not None:
            tau = threshold
        elif is_neural:
            tau = self.neural_threshold
        else:
            tau = self.verification_threshold

        is_match = similarity >= tau

        # Confidence is higher the further similarity is from threshold
        margin = abs(similarity - tau)
        confidence = float(np.clip(0.50 + margin * 1.5, 0.50, 0.98))

        return is_match, round(confidence, 3)

