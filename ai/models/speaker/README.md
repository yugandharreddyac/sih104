# VOXSHIELD Model Staging: Speaker Biometric Verification

## Intended Model
* **Model Checkpoint:** `ecapa_tdnn_voxceleb_128.onnx`
* **Architecture:** ECAPA-TDNN (Emphasized Channel Attention, Propagation and Aggregation)
* **Purpose:** Extraction of robust, text-independent acoustic biometric voice embeddings for speaker verification and impersonation detection.

## Runtime & Inference Specifications
* **Runtime Engine:** ONNX Runtime (`onnxruntime`)
* **Execution Provider:** CPUExecutionProvider
* **Quantization Format:** INT8 quantized ONNX graph
* **Input Format:** 80-bin Log-Mel Spectrogram $[1, 80, T]$
* **Embedding Dimensionality:** 128-dimensional L2-normalized vector
* **Expected Storage Size:** ~32 MB
* **Expected RAM Footprint:** ~95 MB

## Model Integrity & Verification
* **Expected Checksum (SHA-256):** To be registered in [ModelRegistry](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/core/model_registry.py) upon export.
* **Integrity Gate:** Cryptographic checksum verified before model session initialization.

## Licensing & Source
* **Training Dataset:** VoxCeleb 1 & 2 Multilingual Conversational Corpus
* **License:** Apache-2.0 / BSD-3
* **Redistribution / Commercial Use:** Permissive open-source license

## Current Status
* **Status:** `PLANNED` / `STAGED_STRUCTURE_ONLY`
* **Weights Downloaded:** NO (Stage-only; zero binaries downloaded in Phase 6.1)

## Fallback Behavior
* If the ONNX model is uninitialized, [SpeakerEmbeddingExtractor](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/speaker/embedding.py) executes the deterministic DSP random projection matrix with cosine distance matching ($Threshold = 0.70$) and anti-spoofing enrollment gating.
