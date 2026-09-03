"""
Phase 7 — AI Latency Benchmark Script
Reproducible latency measurement for Deepfake and Speaker ONNX models.

Usage:
    python evaluation/benchmark_ai_latency.py

Requirements:
    onnxruntime, numpy, scipy

Produces:
    Measured median/p95/max latency for each model at 5 audio durations.
    Results are printed as a plain-text table — not fabricated.
"""
import sys
import os
import time
import hashlib
import numpy as np

# Support running from repo root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import onnxruntime as ort
except ImportError:
    print("ERROR: onnxruntime is not installed. Run: pip install onnxruntime")
    sys.exit(1)

try:
    from scipy.special import softmax
except ImportError:
    def softmax(x):
        e = np.exp(x - np.max(x))
        return e / e.sum()


DEEPFAKE_MODEL_PATH = "ai/models/deepfake/deepfake_detector.onnx"
SPEAKER_MODEL_PATH = "ai/models/speaker/ecapa_tdnn.onnx"
SAMPLE_RATE = 16000
N_WARMUP = 3
N_MEASURE = 10


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def benchmark_model(sess, input_name, durations_ms, label):
    print(f"\n{'='*60}")
    print(f"  {label} Latency Benchmark")
    print(f"{'='*60}")
    print(f"  {'Audio (ms)':>12} | {'Min (ms)':>10} | {'Median (ms)':>12} | {'P95 (ms)':>10} | {'Max (ms)':>10}")
    print(f"  {'-'*68}")

    results = {}
    for dur_ms in durations_ms:
        n_samples = int(SAMPLE_RATE * dur_ms / 1000)
        audio = np.random.randn(1, n_samples).astype(np.float32)

        # Warmup
        for _ in range(N_WARMUP):
            sess.run(None, {input_name: audio})

        # Measure
        latencies = []
        for _ in range(N_MEASURE):
            t0 = time.perf_counter()
            sess.run(None, {input_name: audio})
            latencies.append((time.perf_counter() - t0) * 1000)

        latencies.sort()
        p50 = float(np.percentile(latencies, 50))
        p95 = float(np.percentile(latencies, 95))
        p_min = min(latencies)
        p_max = max(latencies)

        results[dur_ms] = {"min": p_min, "p50": p50, "p95": p95, "max": p_max}
        print(f"  {dur_ms:>12} | {p_min:>10.1f} | {p50:>12.1f} | {p95:>10.1f} | {p_max:>10.1f}")

    return results


def main():
    print("\n=== SIH104 Phase 7 — AI Latency Benchmark ===")
    print(f"ONNX Runtime version: {ort.__version__}")
    print(f"Providers available: {ort.get_available_providers()}")
    print()

    # Verify model files
    for path, name in [(DEEPFAKE_MODEL_PATH, "Deepfake"), (SPEAKER_MODEL_PATH, "Speaker")]:
        if not os.path.exists(path):
            print(f"ERROR: {name} model not found at {path}")
            sys.exit(1)
        sha = sha256_file(path)
        size = os.path.getsize(path)
        print(f"{name} model: {path}")
        print(f"  Size: {size:,} bytes ({size / (1024*1024):.2f} MB)")
        print(f"  SHA-256: {sha}")

    # Load models
    print("\nLoading ONNX sessions...")
    sess_df = ort.InferenceSession(DEEPFAKE_MODEL_PATH, providers=["CPUExecutionProvider"])
    sess_spk = ort.InferenceSession(SPEAKER_MODEL_PATH, providers=["CPUExecutionProvider"])
    print("Sessions loaded.")

    # Print input/output specs
    print("\n--- Deepfake Model I/O ---")
    for inp in sess_df.get_inputs():
        print(f"  Input: {inp.name}, shape={inp.shape}, type={inp.type}")
    for out in sess_df.get_outputs():
        print(f"  Output: {out.name}, shape={out.shape}, type={out.type}")

    print("\n--- Speaker Model I/O ---")
    for inp in sess_spk.get_inputs():
        print(f"  Input: {inp.name}, shape={inp.shape}, type={inp.type}")
    for out in sess_spk.get_outputs():
        print(f"  Output: {out.name}, shape={out.shape}, type={out.type}")

    # Quick output inspection
    print("\n--- Deepfake Output Sample ---")
    audio_1s = np.random.randn(1, 16000).astype(np.float32)
    out = sess_df.run(None, {sess_df.get_inputs()[0].name: audio_1s})
    logits = out[0][0]
    probs = softmax(logits)
    print(f"  Raw logits: {logits}")
    print(f"  Softmax probs: p_bona_fide={probs[0]:.4f}, p_spoof={probs[1]:.4f}")

    print("\n--- Speaker Output Sample ---")
    audio_3s = np.random.randn(1, 48000).astype(np.float32)
    out_spk = sess_spk.run(None, {sess_spk.get_inputs()[0].name: audio_3s})
    emb = out_spk[0].squeeze()
    norm = float(np.linalg.norm(emb))
    emb_normalized = emb / (norm + 1e-8)
    print(f"  Embedding shape: {emb.shape}")
    print(f"  Raw embedding norm: {norm:.4f} (NOT L2-normalized by model)")
    print(f"  After L2 normalization: norm={float(np.linalg.norm(emb_normalized)):.6f}")

    # Benchmarks
    deepfake_durations = [256, 512, 1000, 2000, 3000]
    speaker_durations = [500, 1000, 2000, 3000]

    df_results = benchmark_model(
        sess_df,
        sess_df.get_inputs()[0].name,
        deepfake_durations,
        "Deepfake (Wav2Vec2 ONNX)"
    )

    spk_results = benchmark_model(
        sess_spk,
        sess_spk.get_inputs()[0].name,
        speaker_durations,
        "Speaker (ECAPA-TDNN ONNX)"
    )

    print("\n=== BENCHMARK SUMMARY ===")
    print("All latencies are real-time measurements. No values are fabricated.")
    print(f"Warmup iterations: {N_WARMUP}, Measurement iterations: {N_MEASURE}")
    print(f"Machine: {sys.platform}, Python {sys.version}")
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
