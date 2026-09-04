"""Smoke Test for VOXSHIELD Phase 1B.1 Neural Prototype.

Verifies:
  1. Module syntax & clean imports
  2. 2-channel spectrogram extraction (Log-Mel + LFCC)
  3. Tensor shapes: (2, 60, 301)
  4. Numerical integrity (zero NaN/Inf)
  5. MiniAcousticCNN parameter count and forward pass
  6. Backprop gradient flow
  7. DataLoader batching on actual benchmark audio files
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import soundfile as sf
import torch
from torch.utils.data import DataLoader

from ai.neural_prototype.dataset import ASVSpoof2021BenchmarkDataset
from ai.neural_prototype.features import TwoChannelSpectrogramExtractor
from ai.neural_prototype.model import MiniAcousticCNN


def run_smoke_test() -> bool:
    print("=" * 72)
    print("  VOXSHIELD Phase 1B.1 — Neural Prototype Smoke Test")
    print("=" * 72)

    # 1. Feature Extractor Test on Synthetic Audio
    print("\n[1/5] Testing TwoChannelSpectrogramExtractor on synthetic waveform...")
    extractor = TwoChannelSpectrogramExtractor(
        sample_rate=16000,
        n_bins=60,
        target_duration_sec=3.0,
    )
    synth_wave = torch.randn(48000, dtype=torch.float32)
    synth_feat = extractor.extract(synth_wave)
    print(f"  Synthetic feature shape: {synth_feat.shape}")
    assert synth_feat.shape == (2, 60, 301), f"Unexpected shape {synth_feat.shape}"
    assert not torch.isnan(synth_feat).any(), "NaN found in synthetic features!"
    assert not torch.isinf(synth_feat).any(), "Inf found in synthetic features!"
    print("  -> Synthetic feature extraction: PASSED (zero NaN/Inf)")

    # 2. Feature Extractor Test on Real Benchmark FLAC
    print("\n[2/5] Testing TwoChannelSpectrogramExtractor on real ASVspoof FLAC file...")
    sample_flac = PROJECT_ROOT / "datasets/raw/asvspoof/ASVspoof2021_DF_eval_part02/ASVspoof2021_DF_eval/flac/DF_E_3663172.flac"
    assert sample_flac.exists(), f"Sample FLAC not found: {sample_flac}"
    audio_data, sr = sf.read(str(sample_flac), dtype="float32")
    real_wave = torch.from_numpy(audio_data)
    real_feat = extractor.extract(real_wave)
    print(f"  Real audio length: {len(audio_data)} samples ({len(audio_data)/sr:.2f}s) at {sr} Hz")
    print(f"  Extracted 2-channel feature shape: {real_feat.shape}")
    assert real_feat.shape == (2, 60, 301), f"Unexpected shape {real_feat.shape}"
    assert not torch.isnan(real_feat).any(), "NaN found in real features!"
    assert not torch.isinf(real_feat).any(), "Inf found in real features!"
    print(f"  Channel 0 (Log-Mel) mean: {real_feat[0].mean().item():.4f}, std: {real_feat[0].std().item():.4f}")
    print(f"  Channel 1 (LFCC)    mean: {real_feat[1].mean().item():.4f}, std: {real_feat[1].std().item():.4f}")
    print("  -> Real audio feature extraction: PASSED")

    # 3. Model Architecture & Forward Pass Test
    print("\n[3/5] Testing MiniAcousticCNN architecture & forward pass...")
    model = MiniAcousticCNN(in_channels=2, num_classes=2, dropout_rate=0.3)
    param_count = model.count_parameters()
    print(f"  Total trainable parameters: {param_count:,}")
    assert param_count == 93442, f"Expected 93,442 parameters, got {param_count}"

    dummy_batch = torch.randn(4, 2, 60, 301, dtype=torch.float32)
    logits = model(dummy_batch)
    print(f"  Input batch shape:  {dummy_batch.shape}")
    print(f"  Output logits shape: {logits.shape}")
    assert logits.shape == (4, 2), f"Expected (4, 2), got {logits.shape}"
    assert not torch.isnan(logits).any(), "NaN in logits!"
    print("  -> Model forward pass: PASSED")

    # 4. Backward Pass & Gradient Flow Test
    print("\n[4/5] Testing gradient computation and optimizer backward pass...")
    criterion = torch.nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    dummy_targets = torch.tensor([0, 1, 0, 1], dtype=torch.long)
    loss = criterion(logits, dummy_targets)
    loss.backward()
    optimizer.step()
    print(f"  Loss value: {loss.item():.4f}")
    assert not torch.isnan(loss), "Loss is NaN!"
    print("  -> Gradient backprop & step: PASSED")

    # 5. Benchmark Dataset & DataLoader Batch Integration Test
    print("\n[5/5] Testing ASVSpoof2021BenchmarkDataset and DataLoader integration...")
    t0 = time.perf_counter()
    ds = ASVSpoof2021BenchmarkDataset(split="val", repo_root=str(PROJECT_ROOT), preload_to_memory=False)
    print(f"  Loaded validation partition: {len(ds)} samples")
    loader = DataLoader(ds, batch_size=4, shuffle=False)

    for features, labels, audio_ids in loader:
        print(f"  Retrieved first DataLoader batch:")
        print(f"    Features shape: {features.shape} (dtype: {features.dtype})")
        print(f"    Labels shape:   {labels.shape} (values: {labels.tolist()})")
        print(f"    Audio IDs:      {list(audio_ids)}")
        assert features.shape == (4, 2, 60, 301)
        assert labels.shape == (4,)
        break
    load_time = time.perf_counter() - t0
    print(f"  DataLoader batch retrieval latency: {load_time*1000:.1f} ms")
    print("  -> Dataset & DataLoader integration: PASSED")

    print("\n" + "=" * 72)
    print("  SMOKE TEST RESULT: ALL 5 CHECKS PASSED SUCCESSFULLY")
    print(f"  MiniAcousticCNN Parameter Count: {param_count:,}")
    print("  Training Pipeline Status: READY TO RUN")
    print("=" * 72)
    return True


if __name__ == "__main__":
    success = run_smoke_test()
    sys.exit(0 if success else 1)
