# VOXSHIELD Model Staging: Acoustic Deepfake Anti-Spoofing

## Intended Model
* **Model Checkpoint:** `aasist_ssl_v3.onnx`
* **Architecture:** AASIST (Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention)
* **Purpose:** High-accuracy acoustic deepfake detection, neural vocoder artifact identification, and synthetic voice discrimination.

## Runtime & Inference Specifications
* **Runtime Engine:** ONNX Runtime (`onnxruntime`)
* **Execution Provider:** CPUExecutionProvider
* **Quantization Format:** INT8 quantized ONNX graph
* **Input Format:** 16,000 Hz 1D float32 audio samples $[1, N]$
* **Expected Storage Size:** ~18 MB
* **Expected RAM Footprint:** ~65 MB

## Model Integrity & Verification
* **Expected Checksum (SHA-256):** To be registered in [ModelRegistry](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/core/model_registry.py) upon export and quantization.
* **Integrity Gate:** Cryptographic verification is enforced before model session creation.

## Licensing & Source
* **Training Dataset:** ASVspoof 2019 / 2021 Logical Access (LA) + In-the-Wild Cloned Dataset
* **License:** Apache-2.0 / Academic Open Access
* **Redistribution / Commercial Use:** Permissive open-source research license

## Current Status
* **Status:** `PLANNED` / `STAGED_STRUCTURE_ONLY`
* **Weights Downloaded:** NO (Stage-only; zero binaries downloaded in Phase 6.1)

## Fallback Behavior
* If the ONNX model file is absent or invalid, [DeepfakeDetector](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/deepfake/detector.py) executes the mathematical DSP pipeline (higher-order LFCC variance, Wiener spectral flatness, and vocoder phase jitter) with zero disruption to the risk fusion engine.
