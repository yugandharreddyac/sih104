"""
VOXSHIELD Physical Replay Dataset Evaluation CLI
Reproducible evaluation utility for testing physical replay / presentation-attack detection
against external labeled datasets (e.g. ASVspoof PA corpora) without committing audio into Git.

Usage:
    python ai/scripts/evaluate_replay_dataset.py --dataset-dir <path_to_dataset>
    python ai/scripts/evaluate_replay_dataset.py --dataset-dir <path_to_dataset> --protocol <path_to_protocol_file>
    python ai/scripts/evaluate_replay_dataset.py --dataset-dir <path_to_dataset> --compare-baseline
    python ai/scripts/evaluate_replay_dataset.py --dataset-dir <path_to_dataset> --output-report <output.md>

If no legitimate labeled physical replay dataset is available, this tool exits cleanly with:
    "Not evaluated due to unavailable labeled physical replay dataset."
"""

from __future__ import annotations

import os
import sys
import argparse
import logging
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.app.replay.evaluator import ReplayDatasetEvaluator, ReplayEvaluationMetrics
from ai.app.replay.detector import ReplayDetector

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("voxshield.scripts.evaluate_replay")


def run_evaluation(
    dataset_dir: str,
    protocol_path: str | None = None,
    compare_baseline: bool = False,
    output_report: str | None = None
) -> int:
    print("=" * 70)
    print("VOXSHIELD PHYSICAL REPLAY DETECTOR EVALUATION")
    print("=" * 70)

    # 1. Validate dataset existence
    if not dataset_dir or not os.path.exists(dataset_dir):
        print(f"\n[INFO] Dataset directory not found or not specified: '{dataset_dir}'")
        print("\nSTATUS: Not evaluated due to unavailable labeled physical replay dataset.")
        print("\nTo evaluate once a dataset (e.g. ASVspoof 2019/2021 PA) is downloaded:")
        print("  1. Place dataset audio and protocol files in a local directory outside Git.")
        print("  2. Run: python ai/scripts/evaluate_replay_dataset.py --dataset-dir <dir> --protocol <key_file>")
        return 1

    # 2. Discover labeled samples
    evaluator_enhanced = ReplayDatasetEvaluator(enable_phase2_cues=True)
    try:
        samples = evaluator_enhanced.discover_samples(dataset_dir, protocol_path=protocol_path)
        print(f"[OK] Discovered {len(samples)} labeled samples in '{dataset_dir}'.")
    except Exception as exc:
        print(f"\n[ERROR] Failed to discover valid labeled samples: {exc}")
        print("\nSTATUS: Not evaluated due to unavailable labeled physical replay dataset.")
        return 1

    # 3. Execute Phase 2 Enhanced Evaluation
    print("\nEvaluating Phase 2 Enhanced DSP Detector (Cues 1-6 + Modulation + Cepstrum)...")
    metrics_enhanced, _ = evaluator_enhanced.evaluate_samples(samples)
    report_enhanced = evaluator_enhanced.format_report(metrics_enhanced, mode_name="Phase 2 Enhanced DSP Detector")
    print("\n" + report_enhanced)

    # 4. Optional Baseline Comparison (Ablation: Cues 1-4 only)
    report_baseline = ""
    if compare_baseline:
        print("\nEvaluating Baseline DSP Detector (Cues 1-4 only)...")
        evaluator_baseline = ReplayDatasetEvaluator(enable_phase2_cues=False)
        metrics_baseline, _ = evaluator_baseline.evaluate_samples(samples)
        report_baseline = evaluator_baseline.format_report(metrics_baseline, mode_name="Baseline DSP Detector (Cues 1-4)")
        print("\n" + report_baseline)

        # Print comparison table
        print("\n### Baseline vs Phase 2 Enhanced Comparison")
        print("| Metric | Baseline (Cues 1-4) | Phase 2 Enhanced (Cues 1-6) | Delta |")
        print("| :--- | :--- | :--- | :--- |")
        print(f"| TPR / Recall | {metrics_baseline.tpr*100.0:.2f}% | {metrics_enhanced.tpr*100.0:.2f}% | {(metrics_enhanced.tpr - metrics_baseline.tpr)*100.0:+.2f}% |")
        print(f"| FPR | {metrics_baseline.fpr*100.0:.2f}% | {metrics_enhanced.fpr*100.0:.2f}% | {(metrics_enhanced.fpr - metrics_baseline.fpr)*100.0:+.2f}% |")
        print(f"| Precision | {metrics_baseline.precision*100.0:.2f}% | {metrics_enhanced.precision*100.0:.2f}% | {(metrics_enhanced.precision - metrics_baseline.precision)*100.0:+.2f}% |")
        print(f"| F1-Score | {metrics_baseline.f1_score:.4f} | {metrics_enhanced.f1_score:.4f} | {metrics_enhanced.f1_score - metrics_baseline.f1_score:+.4f} |")
        if metrics_enhanced.roc_auc is not None and metrics_baseline.roc_auc is not None:
            print(f"| ROC-AUC | {metrics_baseline.roc_auc:.4f} | {metrics_enhanced.roc_auc:.4f} | {metrics_enhanced.roc_auc - metrics_baseline.roc_auc:+.4f} |")

    # 5. Output file writing if requested
    if output_report:
        out_path = Path(output_report)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        full_content = report_enhanced
        if report_baseline:
            full_content += "\n\n" + report_baseline
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(full_content)
        print(f"\n[OK] Report saved to '{output_report}'")

    return 0


def main():
    parser = argparse.ArgumentParser(description="Evaluate VOXSHIELD physical replay detector on a labeled dataset.")
    parser.add_argument("--dataset-dir", type=str, default="", help="Path to labeled replay dataset directory.")
    parser.add_argument("--protocol", type=str, default=None, help="Path to trial metadata / protocol file.")
    parser.add_argument("--compare-baseline", action="store_true", help="Also evaluate baseline detector (Cues 1-4) for comparison.")
    parser.add_argument("--output-report", type=str, default=None, help="Path to write markdown evaluation report.")
    args = parser.parse_args()

    sys.exit(run_evaluation(
        dataset_dir=args.dataset_dir,
        protocol_path=args.protocol,
        compare_baseline=args.compare_baseline,
        output_report=args.output_report
    ))


if __name__ == "__main__":
    main()
