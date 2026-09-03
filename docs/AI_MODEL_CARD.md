# SIH104 — AI Model Card

**Phase 7 Scientific Validation**  
**Date**: September 3, 2026

---

## MODEL 1: Deepfake Acoustic Detector

| Field | Value |
|---|---|
| **Model ID** | `deepfake_aasist_spectral_v3` |
| **File** | `ai/models/deepfake/deepfake_detector.onnx` |
| **Size** | 85,695,582 bytes (85.69 MB) |
| **Architecture** | `facebook/wav2vec2-base` + 2-class sequence classification head |
| **Provenance** | `ai8shiro/deepfake-audio-wav2vec2-ONNX` (HuggingFace) |
| **Training Data** | Balanced ASVspoof 2021 PA/LA (per provenance documentation) |
| **SHA-256 (measured)** | `8bf3d10c3dcfc5a485396998453e2474da6bf498fe01b4403ceb76e9a4a0ca11` |
| **SHA-256 (registry)** | `8bf3d10c3dcfc5a485396998453e2474da6bf498fe01b4403ceb76e9a4a0ca11` — VERIFIED |
| **Runtime** | ONNX Runtime CPU (CPUExecutionProvider) |
| **Input** | `input_values`: float32 `[1, N]` at 16 kHz in [-1.0, 1.0] |
| **Output** | `logits`: float32 `[1, 2]` — raw logits, NOT probabilities |
| **Output Interpretation** | Softmax → `[p_bona_fide, p_spoof]` |
| **Min Duration** | 300 ms (4,800 samples) |
| **License** | MIT |
| **Fallback** | LFCC/Wiener DSP heuristic |

### Measured Latency (warm, CPU)

| Audio | Median Latency |
|---|---|
| 256 ms | 94.1 ms |
| 512 ms | 140.6 ms |
| 1,000 ms | 196.3 ms |
| 2,000 ms | 345.6 ms |
| 3,000 ms | 516.0 ms |

### Known Limitations

- Not independently validated against an external labeled test set by SIH104
- Training dataset provenance (ASVspoof 2021) is documented but not independently confirmed
- No calibration performed: thresholds 0.62/0.36 are hardcoded design choices
- Performance on Indian language speech (HI/TE/TA) is UNKNOWN
- Performance on 8 kHz telephone audio is UNKNOWN
- The 60/40 neural/DSP ensemble weighting is not empirically justified

### Scientific Status

`IMPLEMENTED / EXECUTABLE — SCIENTIFICALLY UNVALIDATED ON REAL DATA`

---

## MODEL 2: Speaker Biometric Verifier (ECAPA-TDNN)

| Field | Value |
|---|---|
| **Model ID** | `speaker_xvector_biometric_v3` |
| **File** | `ai/models/speaker/ecapa_tdnn.onnx` |
| **Size** | 84,139,323 bytes (80.24 MB) |
| **Architecture** | SpeechBrain ECAPA-TDNN |
| **Provenance** | `MelissaJ/spkrec-ecapa-voxceleb-onnx` (HuggingFace) |
| **Training Data** | VoxCeleb 1 & VoxCeleb 2 |
| **SHA-256 (measured)** | `2ef890f0212dbeb5684622c42c03b4df80ef4cc171da004d2ec754247a3cf3f9` |
| **SHA-256 (registry)** | `2ef890f0212dbeb5684622c42c03b4df80ef4cc171da004d2ec754247a3cf3f9` — VERIFIED |
| **Runtime** | ONNX Runtime CPU |
| **Input** | `audio_input`: float32 `[1, N]` at 16 kHz |
| **Output** | `embedding_output`: float32 `[1, 1, 192]` (squeezed to 192-dim vector) |
| **Output Norm (raw)** | ~368.0 (NOT L2-normalized by model) |
| **Post-processing** | L2 normalization applied in `embedding.py` |
| **Similarity** | Cosine similarity between L2-normalized embeddings |
| **Threshold (neural)** | 0.88 cosine similarity |
| **Threshold (DSP fallback)** | 0.70 cosine similarity |
| **License** | Apache-2.0 |

### Known Limitations

- VoxCeleb training corpus is primarily English-speaking. Domain shift for Indian language speakers is UNKNOWN
- No EER, FAR, or FRR measurements performed in SIH104
- Threshold 0.88 is a hardcoded design choice without empirical calibration
- Enrollment quality directly affects verification accuracy — short enrollment degrades performance
- No adaptation for telephone speech domain

### Scientific Status

`IMPLEMENTED / EXECUTABLE — SCIENTIFICALLY UNVALIDATED (NO EER/FAR MEASUREMENT)`

---

## MODEL 3: ASR (Faster-Whisper Base INT8)

| Field | Value |
|---|---|
| **Model ID** | `whisper_streaming_conformer_v4` |
| **Architecture** | Whisper Base (encoder-decoder) |
| **Quantization** | INT8 (CTranslate2) |
| **File** | `ai/models/asr/faster-whisper-base/model.bin` |
| **Size** | 145,217,532 bytes (138.49 MB) |
| **Languages** | 99 languages (configured for EN, EN-IN, HI, TE, TA, BN, MR) |
| **Compute** | CPU, INT8, 2 threads |
| **VAD** | Disabled in transcribe call (`vad_filter=False`) |
| **Beam Size** | 1 (greedy decoding) |

### Architecture Concern

The Phase 6 intent was to use ASR asynchronously on VAD-buffered 2-3 second segments. The current orchestrator calls ASR synchronously on every audio chunk. When Whisper receives voiced audio, it processes a 30-second internal window, causing ~8,000 ms latency per call on CPU.

**This blocks the acoustic path.** The 1,200 ms timeout introduced in Phase 6 is too short for ASR but correct for deepfake/speaker.

### Scientific Status

`IMPLEMENTED / EXECUTABLE — WER UNVALIDATED — ASYNC ARCHITECTURE INCOMPLETE`

---

## MODEL 4: Replay Detector

| Field | Value |
|---|---|
| **Model ID** | `replay_spectral_decay_v3` |
| **Type** | DSP heuristic |
| **Algorithm** | 3-cue spectral analysis (HF roll-off + reverberation + distortion) |
| **License** | MIT |

**No machine learning model.** Pure signal processing.

### Scientific Status

`IMPLEMENTED (DSP) — THRESHOLDS UNVALIDATED AGAINST REAL REPLAY RECORDINGS`

---

## MODEL 5: Intent Classifier

| Field | Value |
|---|---|
| **Model ID** | `intent_classifier_multi_token_v4` |
| **Type** | Rule-based regex pattern matching |
| **Categories** | 17 intent categories |
| **Languages** | English primary + multilingual keywords |

**No machine learning model.** Deterministic pattern matching.

### Scientific Status

`IMPLEMENTED — FPR/TPR UNVALIDATED AGAINST LABELED CONVERSATION CORPUS`

---

## MODEL 6: Social Engineering Detector

| Field | Value |
|---|---|
| **Model ID** | `social_eng_multi_turn_v4` |
| **Type** | Rule-based multilingual keyword/regex + state machine |
| **Tactics** | Authority, Urgency, Fear, Secrecy, Isolation, Verification Bypass, Financial Pressure |
| **Languages** | English, Hindi, Telugu, Tamil, Bengali, Marathi (keyword patterns) |

**No machine learning model.** Deterministic multilingual pattern matching + state machine.

### Scientific Status

`IMPLEMENTED — DETECTION RATE UNVALIDATED AGAINST LABELED VISHING CORPUS`
