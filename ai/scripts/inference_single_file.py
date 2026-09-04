"""SIH104 — Single-File Audio Inference Script.

Takes a .flac (or any FFmpeg-readable audio) file and outputs
a JSON prediction using the saved traditional ML model.

The inference pipeline exactly mirrors training:
  FLAC → FFmpeg (16kHz mono f32) → AudioPreprocessor
       → AcousticFeatureExtractor → 48-dim vector
       → saved scaler (if any) → saved classifier → prediction

Usage:
    python ai/scripts/inference_single_file.py path/to/audio.flac

    # With explicit model directory
    python ai/scripts/inference_single_file.py path/to/audio.flac --model-dir ai/models/traditional

    # With explicit FFmpeg binary
    python ai/scripts/inference_single_file.py path/to/audio.flac --ffmpeg C:/ffmpeg/bin/ffmpeg.exe

Output (JSON to stdout):
    {
      "audio_path": "...",
      "prediction": "bonafide" | "spoof",
      "label": 0 | 1,
      "confidence": 0.0-1.0,
      "probabilities": {"bonafide": 0.xx, "spoof": 0.xx},
      "model_name": "...",
      "feature_dim": 48
    }
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# Ensure repo root is importable
# ─────────────────────────────────────────────────────────────────────────────
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
if str(_REPO_ROOT / "ai") not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT / "ai"))

logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")
log = logging.getLogger("sih104.inference")

MODEL_DIR_DEFAULT = str(_REPO_ROOT / "ai" / "models" / "traditional")


def load_best_model(model_dir: str):
    """Load the best trained model from the model directory.

    Reads best_model_info.json to discover which model file to load.

    Args:
        model_dir: Directory containing model artifacts.

    Returns:
        (model, model_name): loaded sklearn estimator and its name.

    Raises:
        FileNotFoundError: If the model directory or files are missing.
        RuntimeError: If no model has been trained yet.
    """
    import joblib

    mdir = Path(model_dir)
    info_path = mdir / "best_model_info.json"

    if not info_path.exists():
        raise FileNotFoundError(
            f"best_model_info.json not found in {model_dir}.\n"
            "Have you run the training pipeline yet?\n"
            "  python ai/scripts/train_traditional_pipeline.py --smoke-test"
        )

    info = json.loads(info_path.read_text(encoding="utf-8"))
    model_name = info["best_model_name"]
    model_file = mdir / info["best_model_file"]

    if not model_file.exists():
        # Also try lowercase with underscores
        alt = mdir / f"{model_name.replace(' ', '_').lower()}.joblib"
        if alt.exists():
            model_file = alt
        else:
            raise FileNotFoundError(
                f"Model file not found: {model_file}\n"
                "Please re-run the training pipeline."
            )

    model = joblib.load(model_file)
    log.info("Loaded model '%s' from %s", model_name, model_file)
    return model, model_name


def load_feature_config(model_dir: str) -> dict:
    """Load feature_config.json from the model directory.

    Args:
        model_dir: Directory containing model artifacts.

    Returns:
        Dict with feature configuration.
    """
    cfg_path = Path(model_dir) / "feature_config.json"
    if not cfg_path.exists():
        raise FileNotFoundError(
            f"feature_config.json not found in {model_dir}. "
            "Please re-run the training pipeline."
        )
    return json.loads(cfg_path.read_text(encoding="utf-8"))


def predict_single_file(
    audio_path: str,
    model_dir: str = MODEL_DIR_DEFAULT,
    ffmpeg_exe: str | None = None,
) -> dict:
    """Run inference on a single audio file.

    Args:
        audio_path: Path to the audio file (.flac, .wav, etc.).
        model_dir: Directory containing trained model artifacts.
        ffmpeg_exe: Optional explicit FFmpeg path.

    Returns:
        Dict with prediction, confidence, and metadata.
    """
    import numpy as np

    # ── 1. Load model and feature config ──────────────────────────────────────
    model, model_name = load_best_model(model_dir)
    feat_cfg = load_feature_config(model_dir)
    feature_names = feat_cfg["feature_names"]
    feature_dim = feat_cfg["feature_dim"]
    label_map = feat_cfg["label_map"]  # {"bonafide": 0, "spoof": 1}
    inv_label_map = {v: k for k, v in label_map.items()}

    # ── 2. Extract features (same pipeline as training) ───────────────────────
    from ai.app.ml.feature_pipeline import FeaturePipeline, FEATURE_DIM

    if feature_dim != FEATURE_DIM:
        raise RuntimeError(
            f"Feature dimension mismatch: model expects {feature_dim} but "
            f"current extractor produces {FEATURE_DIM}. "
            "The model must be retrained with the current feature extractor."
        )

    pipeline = FeaturePipeline(sample_rate=16000, ffmpeg_exe=ffmpeg_exe)
    feat_vec = pipeline.extract_from_file(audio_path)  # shape: (48,)

    # ── 3. Validate ────────────────────────────────────────────────────────────
    if not np.isfinite(feat_vec).all():
        bad = [feature_names[i] for i in np.where(~np.isfinite(feat_vec))[0]]
        raise ValueError(
            f"Non-finite values in feature vector: {bad}. "
            "Audio may be silent, corrupt, or too short."
        )

    # ── 4. Predict ────────────────────────────────────────────────────────────
    vec_2d = feat_vec.reshape(1, -1)  # shape: (1, 48)
    pred_label_int = int(model.predict(vec_2d)[0])
    pred_label_str = inv_label_map.get(pred_label_int, str(pred_label_int))

    # Probabilities
    probabilities: dict[str, float] = {}
    confidence = float("nan")

    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(vec_2d)[0]
        # Align probabilities to class order
        classes = list(model.classes_) if hasattr(model, "classes_") else [0, 1]
        for cls_int, prob in zip(classes, proba):
            cls_name = inv_label_map.get(int(cls_int), str(cls_int))
            probabilities[cls_name] = round(float(prob), 6)
        confidence = float(probabilities.get(pred_label_str, float("nan")))
    elif hasattr(model, "decision_function"):
        df_score = float(model.decision_function(vec_2d)[0])
        confidence = float("nan")
        probabilities = {"decision_function_score": df_score}

    return {
        "audio_path": str(audio_path),
        "prediction": pred_label_str,
        "label": pred_label_int,
        "confidence": round(confidence, 6),
        "probabilities": probabilities,
        "model_name": model_name,
        "feature_dim": feature_dim,
    }


def main(args: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="SIH104 — Single-File Audio Inference",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("audio_path", help="Path to the audio file (.flac, .wav, etc.)")
    parser.add_argument("--model-dir", default=MODEL_DIR_DEFAULT,
                        help="Directory containing trained model artifacts.")
    parser.add_argument("--ffmpeg", default=None, help="Explicit path to ffmpeg binary.")
    parser.add_argument("--verbose", action="store_true",
                        help="Enable verbose logging.")
    opts = parser.parse_args(args)

    if opts.verbose:
        logging.getLogger().setLevel(logging.INFO)

    if not Path(opts.audio_path).exists():
        print(json.dumps({"error": f"File not found: {opts.audio_path}"}))
        return 1

    try:
        result = predict_single_file(
            audio_path=opts.audio_path,
            model_dir=opts.model_dir,
            ffmpeg_exe=opts.ffmpeg,
        )
        print(json.dumps(result, indent=2))
        return 0

    except FileNotFoundError as e:
        print(json.dumps({"error": "model_not_found", "message": str(e)}), file=sys.stderr)
        return 2

    except Exception as e:
        import traceback
        print(json.dumps({"error": type(e).__name__, "message": str(e)}), file=sys.stderr)
        if opts.verbose:
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
