"""
VOXSHIELD Physical Replay Dataset Evaluator
Provides reproducible evaluation pathways for physical replay / presentation-attack detection.

Evaluates:
- Baseline DSP detector (Cues 1-4)
- Phase 2 Enhanced DSP detector (Cues 1-6 + modulation & homomorphic cepstral features)

PROVENANCE & METHODOLOGY NOTE:
The replay detector values are deterministic engineering heuristic scores, NOT calibrated
probabilities. Continuous ranking metrics (e.g. ROC-AUC, EER) use the heuristic ranking score
for ordering purposes only.
"""

from __future__ import annotations

import os
import csv
import time
import base64
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any, Union
import numpy as np

from ai.app.core.types import AudioChunkPayload, ReplayStatus
from ai.app.replay.detector import ReplayDetector

logger = logging.getLogger("voxshield.replay.evaluator")


@dataclass
class LabeledReplaySample:
    """Represents a single labeled replay trial."""
    audio_path: str
    is_replay: bool
    label_str: str
    audio_id: Optional[str] = None
    environment: Optional[str] = None
    sample_rate: int = 16000


@dataclass
class ReplayEvaluationMetrics:
    """Comprehensive evaluation metrics for physical replay detection."""
    total_samples: int
    num_bonafide: int
    num_replay: int
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int
    tpr: float                    # True Positive Rate / Recall
    fpr: float                    # False Positive Rate
    precision: float              # Precision
    f1_score: float               # F1-Score
    accuracy: float               # Binary Accuracy
    roc_auc: Optional[float]      # Continuous ranking ROC-AUC (None if degenerate)
    eer: Optional[float]          # Equal Error Rate (None if degenerate)
    eer_threshold: Optional[float]# Threshold yielding EER
    latency_mean_ms: float        # Mean inference latency per chunk
    latency_p50_ms: float         # Median latency
    throughput_samples_sec: float # Evaluation throughput
    is_degenerate: bool = False   # True if single-class distribution
    notes: List[str] = field(default_factory=list)


def compute_roc_auc(y_true: np.ndarray, y_scores: np.ndarray) -> Optional[float]:
    """
    Computes exact Area Under the ROC Curve via the Mann-Whitney U rank statistic.
    Handles ties cleanly. Returns None if label set is degenerate (single class).
    """
    if len(y_true) == 0 or len(np.unique(y_true)) < 2:
        return None

    pos_mask = (y_true == 1)
    n_pos = int(np.sum(pos_mask))
    n_neg = len(y_true) - n_pos

    if n_pos == 0 or n_neg == 0:
        return None

    # Rank scores with average tie resolution
    order = np.argsort(y_scores)
    ranks = np.empty_like(order, dtype=np.float64)
    ranks[order] = np.arange(1, len(y_scores) + 1)

    # Resolve tied scores
    sorted_scores = y_scores[order]
    unique_vals, inverse_indices, counts = np.unique(
        sorted_scores, return_inverse=True, return_counts=True
    )
    tie_indices = np.where(counts > 1)[0]
    for tie_idx in tie_indices:
        mask = (sorted_scores == unique_vals[tie_idx])
        ranks[order[mask]] = np.mean(ranks[order[mask]])

    # Mann-Whitney U formula
    u_stat = np.sum(ranks[pos_mask]) - (n_pos * (n_pos + 1)) / 2.0
    auc = float(u_stat / (n_pos * n_neg))
    return float(np.clip(auc, 0.0, 1.0))


def compute_eer(y_true: np.ndarray, y_scores: np.ndarray) -> Tuple[Optional[float], Optional[float]]:
    """
    Computes Equal Error Rate (EER) where FPR == FNR.
    Returns: (eer, eer_threshold). Returns (None, None) if label set is degenerate.
    """
    if len(y_true) == 0 or len(np.unique(y_true)) < 2:
        return None, None

    n_pos = int(np.sum(y_true == 1))
    n_neg = int(np.sum(y_true == 0))
    if n_pos == 0 or n_neg == 0:
        return None, None

    # Evaluate candidate thresholds from unique score values
    thresholds = np.unique(y_scores)
    thresholds = np.sort(thresholds)

    best_diff = float("inf")
    best_eer = 0.5
    best_thresh = 0.5

    for th in thresholds:
        preds = (y_scores >= th).astype(int)
        fp = np.sum((preds == 1) & (y_true == 0))
        fn = np.sum((preds == 0) & (y_true == 1))

        fpr = float(fp / n_neg)
        fnr = float(fn / n_pos)

        diff = abs(fpr - fnr)
        if diff < best_diff:
            best_diff = diff
            best_eer = float((fpr + fnr) / 2.0)
            best_thresh = float(th)

    return best_eer, best_thresh


def split_dataset(
    samples: List[LabeledReplaySample],
    train_ratio: float = 0.7,
    seed: int = 42
) -> Tuple[List[LabeledReplaySample], List[LabeledReplaySample]]:
    """
    Splits samples into disjoint train and test subsets with zero data leakage.
    Deterministic based on provided seed.
    """
    if not samples:
        return [], []

    rng = np.random.RandomState(seed)
    indices = np.arange(len(samples))
    rng.shuffle(indices)

    split_pt = int(len(samples) * train_ratio)
    train_indices = set(indices[:split_pt])

    train_set = [samples[i] for i in range(len(samples)) if i in train_indices]
    test_set = [samples[i] for i in range(len(samples)) if i not in train_indices]

    # Verify zero intersection
    train_paths = {s.audio_path for s in train_set}
    test_paths = {s.audio_path for s in test_set}
    assert len(train_paths.intersection(test_paths)) == 0, "Data leakage detected across train/test splits!"

    return train_set, test_set


class ReplayDatasetEvaluator:
    """
    Evaluator for physical replay attack detection on labeled audio corpora.
    Handles discovery, execution, metric calculation, and report generation.
    """

    def __init__(self, detector: Optional[ReplayDetector] = None, enable_phase2_cues: bool = True):
        self.enable_phase2_cues = enable_phase2_cues
        self.detector = detector or ReplayDetector(sample_rate=16000, enable_phase2_cues=enable_phase2_cues)

    def discover_samples(
        self,
        dataset_dir: str,
        protocol_path: Optional[str] = None
    ) -> List[LabeledReplaySample]:
        """
        Discovers labeled samples from a dataset directory.
        Supports:
        1. ASVspoof protocol files (space/tab-delimited: speaker_id, audio_id, ..., label)
        2. CSV / TSV manifests (columns: audio_path, label / is_replay)
        3. Standard directory structure: dataset_dir/bonafide/ and dataset_dir/replay/ (or spoof/)
        """
        if not os.path.exists(dataset_dir):
            raise FileNotFoundError(f"Dataset directory not found: '{dataset_dir}'")

        samples: List[LabeledReplaySample] = []
        seen_paths: set[str] = set()

        # Strategy 1: Explicit or discovered protocol file
        proto_file = protocol_path
        if not proto_file:
            candidates = [
                os.path.join(dataset_dir, "protocol.txt"),
                os.path.join(dataset_dir, "keys", "trial_metadata.txt"),
                os.path.join(dataset_dir, "trial_metadata.txt"),
                os.path.join(dataset_dir, "manifest.csv"),
                os.path.join(dataset_dir, "metadata.csv"),
            ]
            for c in candidates:
                if os.path.isfile(c):
                    proto_file = c
                    break

        if proto_file and os.path.isfile(proto_file):
            samples.extend(self._parse_protocol_file(dataset_dir, proto_file, seen_paths))

        # Strategy 2: Directory structure fallthrough if no protocol parsed
        if not samples:
            samples.extend(self._scan_folder_structure(dataset_dir, seen_paths))

        if not samples:
            raise ValueError(f"Dataset directory '{dataset_dir}' contains 0 valid labeled samples.")

        return samples

    def _parse_protocol_file(
        self,
        dataset_dir: str,
        protocol_path: str,
        seen_paths: set[str]
    ) -> List[LabeledReplaySample]:
        results: List[LabeledReplaySample] = []
        is_csv = protocol_path.endswith(".csv")

        with open(protocol_path, "r", encoding="utf-8", errors="replace") as f:
            if is_csv:
                reader = csv.DictReader(f)
                for row in reader:
                    path_val = row.get("audio_path") or row.get("file_path") or row.get("path")
                    label_val = row.get("label") or row.get("status") or row.get("key")
                    if not path_val or not label_val:
                        continue

                    full_path = path_val if os.path.isabs(path_val) else os.path.join(dataset_dir, path_val)
                    if full_path in seen_paths:
                        continue

                    is_rep = self._parse_label(label_val)
                    if is_rep is None:
                        continue

                    seen_paths.add(full_path)
                    results.append(LabeledReplaySample(
                        audio_path=full_path,
                        is_replay=is_rep,
                        label_str=label_val.strip(),
                        audio_id=row.get("audio_id")
                    ))
            else:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) < 2:
                        continue

                    # Search for label keyword
                    label_idx = None
                    is_rep = None
                    for idx, token in enumerate(parts):
                        parsed = self._parse_label(token)
                        if parsed is not None:
                            is_rep = parsed
                            label_idx = idx
                            break

                    if is_rep is None:
                        continue

                    # Audio file identifier is typically before label
                    audio_id = parts[1] if len(parts) > 1 else parts[0]
                    # Search for audio in dataset_dir
                    resolved_path = self._resolve_audio_file(dataset_dir, audio_id)
                    if not resolved_path:
                        resolved_path = os.path.join(dataset_dir, f"{audio_id}.flac")

                    if resolved_path in seen_paths:
                        continue

                    seen_paths.add(resolved_path)
                    results.append(LabeledReplaySample(
                        audio_path=resolved_path,
                        is_replay=is_rep,
                        label_str=parts[label_idx],
                        audio_id=audio_id
                    ))

        return results

    def _scan_folder_structure(self, dataset_dir: str, seen_paths: set[str]) -> List[LabeledReplaySample]:
        results: List[LabeledReplaySample] = []
        bonafide_dirs = ["bonafide", "bona_fide", "live", "real"]
        replay_dirs = ["replay", "spoof", "pa", "presentation_attack"]

        audio_exts = {".wav", ".flac"}

        for root, _, files in os.walk(dataset_dir):
            rel = os.path.relpath(root, dataset_dir).lower().replace("\\", "/")
            parts = rel.split("/")

            is_rep = None
            if any(b in parts for b in bonafide_dirs):
                is_rep = False
            elif any(r in parts for r in replay_dirs):
                is_rep = True

            if is_rep is None:
                continue

            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in audio_exts:
                    full_p = os.path.join(root, file)
                    if full_p in seen_paths:
                        continue
                    seen_paths.add(full_p)
                    results.append(LabeledReplaySample(
                        audio_path=full_p,
                        is_replay=is_rep,
                        label_str="replay" if is_rep else "bonafide",
                        audio_id=os.path.splitext(file)[0]
                    ))

        return results

    @staticmethod
    def _parse_label(token: str) -> Optional[bool]:
        t = token.lower().strip()
        if t in ("bonafide", "bona_fide", "0", "genuine", "live", "real"):
            return False
        if t in ("replay", "spoof", "1", "attack", "fake", "pa"):
            return True
        return None

    @staticmethod
    def _resolve_audio_file(dataset_dir: str, audio_id: str) -> Optional[str]:
        for ext in (".flac", ".wav"):
            target = os.path.join(dataset_dir, f"{audio_id}{ext}")
            if os.path.isfile(target):
                return target
            target_sub = os.path.join(dataset_dir, "flac", f"{audio_id}{ext}")
            if os.path.isfile(target_sub):
                return target_sub
        return None

    def evaluate_samples(
        self,
        samples: List[LabeledReplaySample],
        mock_audio_fn: Optional[Any] = None
    ) -> Tuple[ReplayEvaluationMetrics, List[Dict[str, Any]]]:
        """
        Executes detector evaluation on provided labeled samples.
        mock_audio_fn: Optional callable (audio_path) -> np.ndarray for unit testing without disk I/O.
        """
        if not samples:
            raise ValueError("Cannot evaluate an empty sample list.")

        y_true_list: List[int] = []
        y_pred_list: List[int] = []
        y_scores_list: List[float] = []
        latencies_ms: List[float] = []

        detailed_results: List[Dict[str, Any]] = []
        t0_all = time.perf_counter()

        for idx, sample in enumerate(samples):
            # Safe audio loading
            if mock_audio_fn is not None:
                pcm_float = mock_audio_fn(sample.audio_path)
            else:
                pcm_float = self._load_audio_file(sample.audio_path)

            pcm_float = np.nan_to_num(pcm_float, nan=0.0, posinf=0.0, neginf=0.0)
            int16_samples = (np.clip(pcm_float, -1.0, 1.0) * 32767.0).astype(np.int16)
            b64_audio = base64.b64encode(int16_samples.tobytes()).decode("utf-8")

            chunk = AudioChunkPayload(
                call_id=f"eval-{idx}",
                chunk_index=0,
                audio_base64=b64_audio,
                sample_rate=sample.sample_rate
            )

            t0 = time.perf_counter()
            result = self.detector.detect_replay(chunk)
            lat_ms = (time.perf_counter() - t0) * 1000.0
            latencies_ms.append(lat_ms)

            # Map decision to binary prediction
            is_pred_replay = 1 if result.status in (ReplayStatus.REPLAY, ReplayStatus.LIKELY_REPLAY) else 0
            
            # Derive deterministic continuous ranking score in [0.0, 1.0]
            # When REPLAY/LIKELY_REPLAY: score in [0.5, 1.0] mapped from confidence
            # When NOT_REPLAY: score in [0.0, 0.5] mapped from confidence
            # When UNCERTAIN: 0.5
            conf = result.confidence if result.confidence is not None else 0.5
            if result.status in (ReplayStatus.REPLAY, ReplayStatus.LIKELY_REPLAY):
                ranking_score = 0.5 + 0.5 * conf
            elif result.status == ReplayStatus.NOT_REPLAY:
                ranking_score = 0.5 - 0.5 * conf
            else:
                ranking_score = 0.5

            ranking_score = float(np.clip(ranking_score, 0.0, 1.0))

            target = 1 if sample.is_replay else 0
            y_true_list.append(target)
            y_pred_list.append(is_pred_replay)
            y_scores_list.append(ranking_score)

            detailed_results.append({
                "audio_path": sample.audio_path,
                "target": target,
                "predicted": is_pred_replay,
                "status": result.status.value,
                "ranking_score": ranking_score,
                "confidence": result.confidence,
                "latency_ms": lat_ms,
                "explainability": result.explainability
            })

        total_elapsed = time.perf_counter() - t0_all

        y_true = np.array(y_true_list, dtype=int)
        y_pred = np.array(y_pred_list, dtype=int)
        y_scores = np.array(y_scores_list, dtype=float)

        n_pos = int(np.sum(y_true == 1))
        n_neg = int(np.sum(y_true == 0))
        is_degen = (n_pos == 0 or n_neg == 0)

        tp = int(np.sum((y_pred == 1) & (y_true == 1)))
        fp = int(np.sum((y_pred == 1) & (y_true == 0)))
        tn = int(np.sum((y_pred == 0) & (y_true == 0)))
        fn = int(np.sum((y_pred == 0) & (y_true == 1)))

        tpr = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
        fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
        precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
        f1 = float(2 * precision * tpr / (precision + tpr)) if (precision + tpr) > 0 else 0.0
        acc = float((tp + tn) / len(y_true)) if len(y_true) > 0 else 0.0

        roc_auc = compute_roc_auc(y_true, y_scores)
        eer, eer_th = compute_eer(y_true, y_scores)

        throughput = float(len(samples) / total_elapsed) if total_elapsed > 0 else 0.0

        metrics = ReplayEvaluationMetrics(
            total_samples=len(samples),
            num_bonafide=n_neg,
            num_replay=n_pos,
            true_positives=tp,
            false_positives=fp,
            true_negatives=tn,
            false_negatives=fn,
            tpr=tpr,
            fpr=fpr,
            precision=precision,
            f1_score=f1,
            accuracy=acc,
            roc_auc=roc_auc,
            eer=eer,
            eer_threshold=eer_th,
            latency_mean_ms=float(np.mean(latencies_ms)),
            latency_p50_ms=float(np.median(latencies_ms)),
            throughput_samples_sec=throughput,
            is_degenerate=is_degen
        )

        if is_degen:
            metrics.notes.append("Dataset label distribution is degenerate (only one class present). Ranking metrics undefined.")

        return metrics, detailed_results

    @staticmethod
    def _load_audio_file(audio_path: str) -> np.ndarray:
        """Loads audio safely into float32 array in [-1.0, 1.0]."""
        if not os.path.exists(audio_path):
            return np.zeros(16000, dtype=np.float32)

        try:
            # pyrefly: ignore [missing-import]
            import soundfile as sf
            data, sr = sf.read(audio_path, dtype="float32")
            if data.ndim > 1:
                data = np.mean(data, axis=1)
            return data
        except Exception:
            pass

        # Fallback to standard wave module
        try:
            import wave
            with wave.open(audio_path, "rb") as wf:
                n_frames = wf.getnframes()
                raw = wf.readframes(n_frames)
                int16_samples = np.frombuffer(raw, dtype=np.int16)
                return (int16_samples.astype(np.float32) / 32768.0)
        except Exception as exc:
            logger.warning(f"Failed to read audio file '{audio_path}': {exc}. Returning zeros.")
            return np.zeros(16000, dtype=np.float32)

    @staticmethod
    def format_report(metrics: ReplayEvaluationMetrics, mode_name: str = "Enhanced DSP Detector (Phase 2)") -> str:
        """Formats evaluation metrics into a clean markdown report."""
        lines = [
            f"### Replay Evaluation Report: {mode_name}",
            "",
            "| Metric | Value | Interpretation |",
            "| :--- | :--- | :--- |",
            f"| **Total Evaluated Samples** | {metrics.total_samples} | Evaluated trials |",
            f"| **Bona-Fide / Genuine** | {metrics.num_bonafide} | Live human speech |",
            f"| **Replay / Spoof** | {metrics.num_replay} | Physical replay attacks |",
            f"| **True Positives (TP)** | {metrics.true_positives} | Correctly flagged replays |",
            f"| **False Positives (FP)** | {metrics.false_positives} | Genuine flagged as replay |",
            f"| **True Negatives (TN)** | {metrics.true_negatives} | Genuine correctly passed |",
            f"| **False Negatives (FN)** | {metrics.false_negatives} | Replays missed |",
            f"| **Replay Recall / TPR** | {metrics.tpr * 100.0:.2f}% | Sensitivity |",
            f"| **Replay FPR** | {metrics.fpr * 100.0:.2f}% | False alarm rate |",
            f"| **Precision** | {metrics.precision * 100.0:.2f}% | Positive predictive value |",
            f"| **F1-Score** | {metrics.f1_score:.4f} | Harmonic mean of P & R |",
            f"| **Accuracy** | {metrics.accuracy * 100.0:.2f}% | Overall binary accuracy |",
            f"| **ROC-AUC (Ranking)** | {f'{metrics.roc_auc:.4f}' if metrics.roc_auc is not None else 'N/A (Degenerate)'} | Ranking discriminability |",
            f"| **Equal Error Rate (EER)** | {f'{metrics.eer * 100.0:.2f}%' if metrics.eer is not None else 'N/A (Degenerate)'} | Crossover operating point |",
            f"| **EER Ranking Threshold** | {f'{metrics.eer_threshold:.4f}' if metrics.eer_threshold is not None else 'N/A'} | Threshold where FPR == FNR |",
            f"| **Mean Latency** | {metrics.latency_mean_ms:.2f} ms | Per chunk inference |",
            f"| **Median (p50) Latency** | {metrics.latency_p50_ms:.2f} ms | Typical throughput latency |",
            f"| **Throughput** | {metrics.throughput_samples_sec:.1f} samples/sec | Pipeline evaluation throughput |",
            ""
        ]

        if metrics.notes:
            lines.append("**Notes / Warnings:**")
            for n in metrics.notes:
                lines.append(f"- {n}")
            lines.append("")

        lines.append(
            "> [!NOTE]\n"
            "> The current detector values are deterministic engineering heuristics, NOT calibrated probabilities.\n"
            "> Ranking metrics (ROC-AUC / EER) reflect heuristic score ordering and should not be cited as calibrated probabilistic ROC curves."
        )

        return "\n".join(lines)
