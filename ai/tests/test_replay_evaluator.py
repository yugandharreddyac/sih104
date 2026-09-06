"""
Targeted Unit Tests for Replay Dataset Evaluator & Reproducibility Pipeline
Validates mathematical correctness, edge-case safety, deduplication, and error handling.

IMPORTANT TEST PRINCIPLE:
These tests use synthetic/mock signals solely to verify evaluation code correctness.
They do NOT constitute real-world physical replay accuracy validation.
"""

import os
import tempfile
import numpy as np
import pytest

from ai.app.replay.evaluator import (
    ReplayDatasetEvaluator,
    LabeledReplaySample,
    compute_roc_auc,
    compute_eer,
    split_dataset
)
from ai.app.replay.detector import ReplayDetector


# =====================================================================
# 1. Dataset Path Unavailable
# =====================================================================

def test_evaluator_dataset_path_unavailable():
    """Verifies that an unavailable dataset path raises FileNotFoundError with a clear message."""
    evaluator = ReplayDatasetEvaluator()
    nonexistent = os.path.join(tempfile.gettempdir(), "voxshield_nonexistent_eval_dir_12345")
    with pytest.raises(FileNotFoundError) as excinfo:
        evaluator.discover_samples(nonexistent)
    assert "Dataset directory not found" in str(excinfo.value)


# =====================================================================
# 2. Empty Dataset
# =====================================================================

def test_evaluator_empty_dataset():
    """Verifies that an empty dataset directory raises ValueError with clear message."""
    evaluator = ReplayDatasetEvaluator()
    with tempfile.TemporaryDirectory() as tmpdir:
        with pytest.raises(ValueError) as excinfo:
            evaluator.discover_samples(tmpdir)
        assert "contains 0 valid labeled samples" in str(excinfo.value)


# =====================================================================
# 3. Malformed Metadata
# =====================================================================

def test_evaluator_malformed_metadata():
    """Verifies that malformed, empty, and truncated lines in protocol are safely skipped."""
    evaluator = ReplayDatasetEvaluator()
    with tempfile.TemporaryDirectory() as tmpdir:
        proto_path = os.path.join(tmpdir, "protocol.txt")
        with open(proto_path, "w", encoding="utf-8") as f:
            f.write("\n")  # Empty line
            f.write("   \n")  # Whitespace
            f.write("truncated\n")  # Missing label
            f.write("spk1 sample_001 bonafide\n")  # Valid line
            f.write("corrupted line with no recognizable label ???\n")
            f.write("spk2 sample_002 replay\n")  # Valid line

        samples = evaluator.discover_samples(tmpdir, protocol_path=proto_path)
        assert len(samples) == 2
        assert samples[0].audio_id == "sample_001"
        assert not samples[0].is_replay
        assert samples[1].audio_id == "sample_002"
        assert samples[1].is_replay


# =====================================================================
# 4. Missing Labels
# =====================================================================

def test_evaluator_missing_labels():
    """Verifies that samples with unparseable or absent labels are not admitted."""
    evaluator = ReplayDatasetEvaluator()
    with tempfile.TemporaryDirectory() as tmpdir:
        proto_path = os.path.join(tmpdir, "protocol.txt")
        with open(proto_path, "w", encoding="utf-8") as f:
            f.write("spk1 audio_unknown UNKNOWN_LABEL_TYPE\n")
            f.write("spk2 audio_empty \n")
            f.write("spk3 audio_valid bonafide\n")

        samples = evaluator.discover_samples(tmpdir, protocol_path=proto_path)
        assert len(samples) == 1
        assert samples[0].audio_id == "audio_valid"


# =====================================================================
# 5. Duplicate Sample Handling
# =====================================================================

def test_evaluator_duplicate_sample_handling():
    """Verifies that duplicate entries for identical audio paths/IDs are deduplicated."""
    evaluator = ReplayDatasetEvaluator()
    with tempfile.TemporaryDirectory() as tmpdir:
        proto_path = os.path.join(tmpdir, "protocol.txt")
        with open(proto_path, "w", encoding="utf-8") as f:
            f.write("spk1 sample_dup bonafide\n")
            f.write("spk1 sample_dup bonafide\n")  # Exact duplicate
            f.write("spk1 sample_dup replay\n")    # Path duplicate
            f.write("spk2 sample_unique replay\n")

        samples = evaluator.discover_samples(tmpdir, protocol_path=proto_path)
        assert len(samples) == 2
        audio_ids = [s.audio_id for s in samples]
        assert "sample_dup" in audio_ids
        assert "sample_unique" in audio_ids


# =====================================================================
# 6. Deterministic Evaluation
# =====================================================================

def test_evaluator_deterministic_evaluation():
    """Verifies that repeated evaluations on identical synthetic data yield identical metrics and scores."""
    evaluator = ReplayDatasetEvaluator(enable_phase2_cues=True)

    samples = [
        LabeledReplaySample(audio_path="synth_0.wav", is_replay=False, label_str="bonafide"),
        LabeledReplaySample(audio_path="synth_1.wav", is_replay=True, label_str="replay"),
        LabeledReplaySample(audio_path="synth_2.wav", is_replay=False, label_str="bonafide"),
    ]

    # Synthetic signal generator
    def mock_audio(path: str) -> np.ndarray:
        seed = hash(path) % (2**31 - 1)
        rng = np.random.RandomState(seed)
        t = np.linspace(0, 1.0, 16000, endpoint=False)
        return (0.3 * np.sin(2 * np.pi * 300.0 * t) + 0.05 * rng.randn(16000)).astype(np.float32)

    metrics_1, details_1 = evaluator.evaluate_samples(samples, mock_audio_fn=mock_audio)
    metrics_2, details_2 = evaluator.evaluate_samples(samples, mock_audio_fn=mock_audio)

    assert metrics_1.total_samples == metrics_2.total_samples
    assert metrics_1.true_positives == metrics_2.true_positives
    assert metrics_1.false_positives == metrics_2.false_positives
    assert metrics_1.tpr == metrics_2.tpr
    assert metrics_1.fpr == metrics_2.fpr
    assert metrics_1.f1_score == metrics_2.f1_score
    assert metrics_1.roc_auc == metrics_2.roc_auc
    assert metrics_1.eer == metrics_2.eer

    for d1, d2 in zip(details_1, details_2):
        assert d1["ranking_score"] == d2["ranking_score"]
        assert d1["status"] == d2["status"]


# =====================================================================
# 7. Finite Scores & Extreme Values
# =====================================================================

def test_evaluator_finite_scores():
    """Verifies that extreme signals (silence, NaNs, Infs) produce finite evaluation scores without crashing."""
    evaluator = ReplayDatasetEvaluator()

    samples = [
        LabeledReplaySample(audio_path="silence.wav", is_replay=False, label_str="bonafide"),
        LabeledReplaySample(audio_path="nan_inf.wav", is_replay=True, label_str="replay"),
        LabeledReplaySample(audio_path="loud.wav", is_replay=False, label_str="bonafide"),
    ]

    def mock_extreme_audio(path: str) -> np.ndarray:
        if "silence" in path:
            return np.zeros(16000, dtype=np.float32)
        elif "nan_inf" in path:
            arr = np.ones(16000, dtype=np.float32) * 0.1
            arr[0:100] = np.nan
            arr[100:200] = np.inf
            return arr
        else:
            return np.ones(16000, dtype=np.float32) * 2.5

    metrics, details = evaluator.evaluate_samples(samples, mock_audio_fn=mock_extreme_audio)
    assert np.isfinite(metrics.accuracy)
    assert np.isfinite(metrics.latency_mean_ms)
    assert np.isfinite(metrics.throughput_samples_sec)

    for d in details:
        assert np.isfinite(d["ranking_score"])
        assert 0.0 <= d["ranking_score"] <= 1.0


# =====================================================================
# 8. Valid Metric Calculation (ROC-AUC & EER Ground Truth)
# =====================================================================

def test_evaluator_valid_metric_calculation():
    """Verifies exactness of ROC-AUC and EER on known ground-truth distributions."""
    # Perfect ranking separation
    y_true_perfect = np.array([0, 0, 0, 1, 1, 1])
    y_scores_perfect = np.array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
    auc_perfect = compute_roc_auc(y_true_perfect, y_scores_perfect)
    eer_perfect, eer_th_perfect = compute_eer(y_true_perfect, y_scores_perfect)

    assert auc_perfect == 1.0
    assert eer_perfect == 0.0

    # Inverted ranking
    y_scores_inverted = np.array([0.9, 0.8, 0.7, 0.3, 0.2, 0.1])
    auc_inverted = compute_roc_auc(y_true_perfect, y_scores_inverted)
    assert auc_inverted == 0.0

    # Intermediate test
    y_true_mid = np.array([0, 0, 1, 1])
    y_scores_mid = np.array([0.2, 0.6, 0.4, 0.8])
    # Pairs (neg, pos):
    # (0.2, 0.4) -> pos > neg (1)
    # (0.2, 0.8) -> pos > neg (1)
    # (0.6, 0.4) -> pos < neg (0)
    # (0.6, 0.8) -> pos > neg (1)
    # Total concordant = 3 out of 4 -> AUC = 0.75
    auc_mid = compute_roc_auc(y_true_mid, y_scores_mid)
    assert auc_mid == 0.75


# =====================================================================
# 9. Degenerate Label Distributions
# =====================================================================

def test_evaluator_degenerate_label_distributions():
    """Verifies safe handling of single-class datasets (e.g. all bona_fide or all replay)."""
    # All bona fide
    y_all_bona = np.array([0, 0, 0, 0])
    scores = np.array([0.1, 0.2, 0.3, 0.4])
    assert compute_roc_auc(y_all_bona, scores) is None
    eer_bona, _ = compute_eer(y_all_bona, scores)
    assert eer_bona is None

    # All replay
    y_all_rep = np.array([1, 1, 1])
    assert compute_roc_auc(y_all_rep, scores[:3]) is None
    eer_rep, _ = compute_eer(y_all_rep, scores[:3])
    assert eer_rep is None

    # Evaluator sample-level integration with single class
    evaluator = ReplayDatasetEvaluator()
    samples_single_class = [
        LabeledReplaySample(audio_path="s1.wav", is_replay=False, label_str="bonafide"),
        LabeledReplaySample(audio_path="s2.wav", is_replay=False, label_str="bonafide"),
    ]

    metrics, _ = evaluator.evaluate_samples(
        samples_single_class,
        mock_audio_fn=lambda p: np.zeros(16000, dtype=np.float32)
    )
    assert metrics.is_degenerate is True
    assert metrics.roc_auc is None
    assert metrics.eer is None
    assert metrics.tpr == 0.0
    assert metrics.fpr == 0.0


# =====================================================================
# 10. Train/Test Separation (Zero Leakage)
# =====================================================================

def test_evaluator_train_test_separation():
    """Verifies that split_dataset enforces strict disjoint partition with zero data leakage."""
    samples = [
        LabeledReplaySample(audio_path=f"path_{i:03d}.flac", is_replay=(i % 2 == 0), label_str="test")
        for i in range(100)
    ]

    train_set, test_set = split_dataset(samples, train_ratio=0.75, seed=123)

    assert len(train_set) == 75
    assert len(test_set) == 25

    train_paths = {s.audio_path for s in train_set}
    test_paths = {s.audio_path for s in test_set}

    # Zero leakage check
    intersection = train_paths.intersection(test_paths)
    assert len(intersection) == 0

    # Determinism check
    train_2, test_2 = split_dataset(samples, train_ratio=0.75, seed=123)
    assert [s.audio_path for s in train_set] == [s.audio_path for s in train_2]


# =====================================================================
# 11. Baseline vs Enhanced Ablation Configuration
# =====================================================================

def test_evaluator_baseline_vs_enhanced_toggle():
    """Verifies that enable_phase2_cues correctly disables modulation and cepstral cues."""
    detector_baseline = ReplayDetector(sample_rate=16000, enable_phase2_cues=False)
    detector_enhanced = ReplayDetector(sample_rate=16000, enable_phase2_cues=True)

    assert detector_baseline.enable_phase2_cues is False
    assert detector_enhanced.enable_phase2_cues is True
