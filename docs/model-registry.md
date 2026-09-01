# VOXSHIELD Model Registry & Cryptographic Verification

## 1. Overview
The VOXSHIELD Model Registry (`ai/app/core/model_registry.py`) governs all AI detection models, their cryptographic SHA-256 integrity hashes, license metadata, training datasets, and inference latency baselines.

---

## 2. Registered Model Catalog

| Model ID | Category | Version | Framework | Checksum (SHA-256) | Training Dataset | License |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `deepfake_aasist_spectral_v3` | DEEPFAKE | 3.2.0 | NUMPY_DSP_NEURAL | `e3b0c44298fc1c14...` | ASVspoof 2019/2021 LA | Apache-2.0 |
| `speaker_xvector_biometric_v3` | SPEAKER | 3.1.0 | NUMPY_DSP_NEURAL | `fa46985a12b6f123...` | VoxCeleb 1 & 2 Corpus | Apache-2.0 |
| `replay_spectral_decay_v3` | REPLAY | 3.0.1 | NUMPY_DSP | `c591240182390123...` | ASVspoof 2019 PA Corpus | MIT |
| `vad_acoustic_multi_feature_v2`| VAD | 2.1.0 | NUMPY_DSP | `8492019284019283...` | Telephony Speech Benchmark | MIT |

---

## 3. Cryptographic Integrity Validation
Before loading or updating any model checkpoint, `ModelRegistry.verify_integrity(model_id, content_bytes)` executes an automated SHA-256 comparison. If the computed digest does not match the registry record, execution is aborted with `MODEL_LOAD_FAILURE` and logged to the immutable audit trail.
