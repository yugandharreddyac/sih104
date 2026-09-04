# VOXSHIELD Model Staging: Multilingual Streaming ASR

## Intended Model
* **Model Checkpoint:** `faster-whisper-base` (or `Systran/faster-whisper-base`)
* **Purpose:** Real-time streaming speech-to-text with native multilingual support for English (`en`), Hindi (`hi`), and Telugu (`te`), including Hinglish/Tenglish subword code-switching.

## Runtime & Inference Specifications
* **Runtime Engine:** CTranslate2 C++ inference engine (`faster-whisper`)
* **Execution Provider:** CPU (AVX2 / AVX-VNNI SIMD)
* **Quantization Format:** INT8 (`int8` quantized GEMM)
* **Expected Storage Size:** ~145 MB
* **Expected RAM Footprint:** ~480 MB

## Model Integrity & Verification
* **Expected Checksum (SHA-256):** To be registered in [ModelRegistry](../../app/core/model_registry.py) upon acquisition.
* **Integrity Gate:** Model initialization strictly verifies cryptographic checksum before mounting.

## Licensing & Source
* **Source:** Hugging Face Hub / Systran CTranslate2 Model Registry
* **Base Architecture:** OpenAI Whisper (MIT License) / CTranslate2 (MIT License)
* **Redistribution / Commercial Use:** Permissive MIT License

## Current Status
* **Status:** `AVAILABLE` / `STAGED_ACTIVE`
* **Weights Downloaded:** YES (`Systran/faster-whisper-base` CPU INT8, ~145 MB `model.bin`)
* **Verified Checksum (SHA-256):** `d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9`

## Fallback Behavior
* If model weights are missing or uninitialized, [StreamingASREngine](../../app/asr/engine.py) seamlessly returns structured empty transcript segments with explicit `INSUFFICIENT_EVIDENCE` / `INCONCLUSIVE` uncertainty tokens without interrupting active WebSocket audio streams.
