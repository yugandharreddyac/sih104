# VOXSHIELD Model Registry & Cryptographic Verification

## 1. Overview
The VOXSHIELD Model Registry (`ai/app/core/model_registry.py`) governs all AI detection models, their cryptographic SHA-256 integrity hashes, license metadata, training datasets, and inference latency baselines.

---

## 2. Registered Model Catalog

| Model ID | Category | Version | Framework | Checksum (SHA-256) | Training Dataset / Provenance | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `robust_mini_acoustic_cnn_v1` | DEEPFAKE | 1.0.0 | PYTORCH_CPU | `b8c0b623175a7d53204004690aab3e1cbed921517189c80ad888ea5a3b7cbbc5` | VCC2020 + VCC2018 2x Balanced Corpus (2,800 records) | **AVAILABLE (Production Model)** |
| `faster_whisper_base_int8` | ASR | 1.0.0 | CTRANSLATE2_INT8 | `d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9` | OpenAI Whisper Base / Systran CTranslate2 INT8 | **AVAILABLE (Production Model)** |
| `speaker_xvector_biometric_v3` | SPEAKER | 3.5.0 | ONNX_NEURAL_DSP | `2ef890f0212dbeb5684622c42c03b4df80ef4cc171da004d2ec754247a3cf3f9` | VoxCeleb 1 & 2 Corpus | **AVAILABLE (DSP Fallback Active; ONNX absent)** |
| `replay_spectral_decay_v3` | REPLAY | 3.0.1 | NUMPY_DSP | `c591240182390123...` | ASVspoof 2019 PA Corpus (heuristic only) | **AVAILABLE (Experimental Heuristic)** |
| `vad_acoustic_multi_feature_v2` | VAD | 2.1.0 | NUMPY_DSP | `8492019284019283...` | Telephony Speech Benchmark | **AVAILABLE** |
| `deepfake_wav2vec2_asvspoof_v1` | DEEPFAKE | 1.0.0 | ONNX_NEURAL | `8bf3d10c3dcfc5a4...` | Historical ASVspoof 2021 PA / LA design | **NOT_AVAILABLE (Absent from disk)** |
| `speaker_ecapa_tdnn_v1` | SPEAKER | 1.0.0 | ONNX_NEURAL | `2ef890f0212dbeb5...` | Historical SpeechBrain ECAPA design | **NOT_AVAILABLE (Absent from disk)** |

> [!IMPORTANT]
> **Current Production Deepfake Acoustic Model:** The physically verified and frozen production acoustic deepfake model is the PyTorch CPU **`robust_mini_acoustic_cnn_v1`** (`ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`), operating on 2-channel log-Mel and LFCC spectrograms. The historical Wav2Vec2/ONNX checkpoint is absent from disk and is NOT the production detector.

---

## 3. Cryptographic Integrity Validation
Before loading or updating any model checkpoint, `ModelRegistry.verify_integrity(model_id, content_bytes)` executes an automated SHA-256 comparison. If the computed digest does not match the registry record, execution is aborted with `MODEL_LOAD_FAILURE` and logged to the immutable audit trail.
