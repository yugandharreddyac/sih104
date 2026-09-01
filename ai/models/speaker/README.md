# VOXSHIELD Model Staging: Speaker Biometric Verification

## Model Overview
* **Model Name:** `ECAPA-TDNN VoxCeleb Speaker Embedding`
* **Model Checkpoint:** `ecapa_tdnn.onnx`
* **Original Architecture:** SpeechBrain ECAPA-TDNN (`speechbrain/spkrec-ecapa-voxceleb`)
* **Source Repository:** Hugging Face Hub (`MelissaJ/spkrec-ecapa-voxceleb-onnx`)
* **License:** Apache-2.0 (Permissive open-source research and commercial use)
* **Purpose:** Extraction of robust, text-independent acoustic biometric voice embeddings for speaker verification and executive impersonation detection.

## Technical Specifications
* **Runtime Engine:** ONNX Runtime (`onnxruntime`)
* **Execution Provider:** `CPUExecutionProvider`
* **Input Tensor Name:** `audio_input`
* **Input Shape:** `[1, num_samples]` (1D/2D float32 normalized in [-1.0, 1.0])
* **Sample Rate:** 16,000 Hz Mono Linear PCM
* **Minimum Speech Duration:** $\ge 300\text{ ms}$ ($\ge 4,800$ samples)
* **Output Tensor Name:** `embedding_output`
* **Output Shape:** `[1, 1, 192]`
* **Embedding Dimension:** 192-dimensional vector (spherical L2-normalized)
* **File Size:** 84,139,323 bytes (~80.2 MB)
* **Cryptographic Hash (SHA-256):** `2ef890f0212dbeb5684622c42c03b4df80ef4cc171da004d2ec754247a3cf3f9`
* **Verification Date:** September 1, 2026

## Integrity & Gating Invariants
* **SHA-256 Gate:** Cryptographic checksum is registered and verified against [ModelRegistry](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/core/model_registry.py).
* **Anti-Spoof Enrollment Gate:** All speaker profiles must pass deepfake anti-spoof pre-screening before enrollment is approved.
* **Fallback Behavior:** If the ONNX session fails to initialize or files are absent, [SpeakerEmbeddingExtractor](file:///c:/Users/supre/OneDrive/Desktop/sih104/ai/app/speaker/embedding.py) automatically routes execution to the deterministic DSP random projection fallback.
