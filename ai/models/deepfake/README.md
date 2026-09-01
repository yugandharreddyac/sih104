# VOXSHIELD Model Staging: Acoustic Deepfake & Anti-Spoofing

## Model Overview
* **Model Name:** `Deepfake-Audio-Wav2Vec2 Quantized ONNX`
* **Model Checkpoint:** `deepfake_detector.onnx`
* **Original Architecture:** `facebook/wav2vec2-base` sequence classification head trained on Balanced ASVspoof 2021 PA / LA benchmarks
* **Source Repository:** Hugging Face Hub (`ai8shiro/deepfake-audio-wav2vec2-ONNX` from `Vansh180/deepfake-audio-wav2vec2`)
* **License:** MIT License (Permissive open-source research and commercial use)
* **Purpose:** High-precision acoustic anti-spoofing, detecting neural vocoder artifacts, synthetic speech generation, and voice cloning in streaming voice calls.

## Technical Specifications
* **Runtime Engine:** ONNX Runtime (`onnxruntime`)
* **Execution Provider:** `CPUExecutionProvider` (SIMD AVX2, 2 intra-op threads)
* **Quantization / Precision:** INT4/INT8 Quantized Graph (`model_q4.onnx`)
* **Input Tensor Name:** `input_values`
* **Input Shape:** `[1, sequence_length]` (1D/2D float32 normalized waveform in [-1.0, 1.0])
* **Sample Rate:** 16,000 Hz Mono Linear PCM
* **Minimum Analysis Duration:** $\ge 300\text{ ms}$ ($\ge 4,800$ samples)
* **Output Tensor Name:** `logits`
* **Output Shape:** `[1, 2]` (`Index 0: Bona-Fide / Real Human`, `Index 1: Synthetic Spoof / Deepfake`)
* **File Size:** 89,855,582 bytes (~85.69 MB)
* **Cryptographic Hash (SHA-256):** `8bf3d10c3dcfc5a485396998453e2474da6bf498fe01b4403ceb76e9a4a0ca11`
* **Verification Date:** September 1, 2026

## Integrity & Gating Invariants
* **SHA-256 Gate:** Cryptographic checksum is registered and verified against [ModelRegistry](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/core/model_registry.py).
* **Dual-Engine Fallback:** If the neural ONNX model fails or is uninitialized, [DeepfakeAcousticModel](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/deepfake/model.py) automatically routes execution to the deterministic LFCC/Wiener filterbank DSP fallback.
* **Enrollment Security Gate:** [SpeakerEnrollmentManager](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/speaker/enrollment.py) gates all biometric voice registrations through anti-spoof pre-screening, rejecting synthetic voices before storage.
