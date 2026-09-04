# VOXSHIELD Model Staging: Speaker Biometric Verification

## Current Staging Status
* **Status:** `BLOCKED — NO GENUINE ECAPA-TDNN WEIGHTS AVAILABLE LOCALLY`
* **Directory Contents:** `.gitkeep`, `README.md` (No model weights files present on disk)
* **Active Production Path:** Deterministic DSP 64-band FFT filterbank with random projection fallback (128-dimensional embedding vector).

## Intended Target Architecture (Planned)
* **Model Name:** `ECAPA-TDNN VoxCeleb Speaker Embedding`
* **Intended Checkpoint:** `ecapa_tdnn.onnx` (NOT physically present in current repository)
* **Intended Architecture:** SpeechBrain ECAPA-TDNN (`speechbrain/spkrec-ecapa-voxceleb`)
* **Intended Source:** Hugging Face Hub (`MelissaJ/spkrec-ecapa-voxceleb-onnx`)
* **License:** Apache-2.0 (Permissive open-source research and commercial use)
* **Purpose:** Extraction of robust, text-independent acoustic biometric voice embeddings for speaker verification and executive impersonation detection.

## Historical / Intended Specifications (Unverified Locally)
* **Target Runtime Engine:** ONNX Runtime (`onnxruntime`, `CPUExecutionProvider`)
* **Input Tensor:** `audio_input` shape `[1, num_samples]` (16,000 Hz Linear PCM float32)
* **Output Tensor:** `embedding_output` shape `[1, 1, 192]` (192-dimensional L2-normalized vector)
* **Claimed Upstream Checkpoint Size:** ~84.1 MB (84,139,323 bytes — unverified locally; file absent)
* **Claimed Upstream SHA-256:** `2ef890f0212dbeb5684622c42c03b4df80ef4cc171da004d2ec754247a3cf3f9` (registered as target hash; file absent)

## Active Implementation & Fallback Behavior
* **Active Fallback:** Because `ecapa_tdnn.onnx` is not present on disk, [SpeakerEmbeddingExtractor](../../app/speaker/embedding.py) automatically engages the deterministic DSP random-projection fallback (`is_neural_active = False`).
* **Active Vector Space:** 128-dimensional L2-normalized vector derived from a 64-band FFT filterbank with temporal statistics pooling and fixed projection matrix. This fallback must NOT be described as ECAPA.
* **Verification Threshold:** $\tau = 0.70$ (DSP fallback space).
* **Evaluation Status:** Genuine ECAPA biometric evaluation (FAR, FRR, TAR, EER) remains blocked because neither the genuine model artifact nor a paired speaker verification trial benchmark is currently available in the repository.
* **Anti-Spoof Enrollment Gate:** All speaker profiles must pass deepfake anti-spoof pre-screening before enrollment is approved.
