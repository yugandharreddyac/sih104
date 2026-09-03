# SIH104 — Phase 7 AI/ML Scientific Validation Report

**Date**: September 3, 2026  
**Auditor**: Phase 7 Scientific Validation Agent  
**Repository**: `yugandharreddyac/sih104`  
**Python**: 3.14.5  
**Platform**: Windows x64

---

## 1. SCOPE AND METHODOLOGY

This document records the scientific validation of SIH104's AI/ML subsystems.  
All measurements are from direct execution using monotonic timestamps (`time.perf_counter`).  
**No metrics are fabricated. Where evidence does not exist, the status is explicitly marked.**

---

## 2. AI SYSTEM INVENTORY

| Model ID | Type | File | Size | Framework | Status |
|---|---|---|---|---|---|
| `deepfake_aasist_spectral_v3` | Neural ONNX | `ai/models/deepfake/deepfake_detector.onnx` | 85.69 MB | ONNX Runtime | EXECUTABLE |
| `speaker_xvector_biometric_v3` | Neural ONNX | `ai/models/speaker/ecapa_tdnn.onnx` | 80.24 MB | ONNX Runtime | EXECUTABLE |
| `whisper_streaming_conformer_v4` | CTranslate2 | `ai/models/asr/faster-whisper-base/model.bin` | 138.49 MB | CTranslate2 INT8 | EXECUTABLE |
| `replay_spectral_decay_v3` | DSP | `ai/app/replay/detector.py` | Code | NumPy DSP | EXECUTABLE |
| `intent_classifier_multi_token_v4` | Rule/Regex | `ai/app/intent/classifier.py` | Code | Pattern Matching | EXECUTABLE |
| `social_eng_multi_turn_v4` | Rule/Keyword | `ai/app/social_engineering/` | Code | Multilingual Regex | EXECUTABLE |
| `unified_risk_fusion_v5` | Deterministic | `ai/app/fusion/engine.py` | Code | Weighted Matrix | EXECUTABLE |

---

## 3. MODEL PROVENANCE AND CHECKSUMS

### Deepfake Detector (Wav2Vec2 ONNX)

| Field | Value |
|---|---|
| **HuggingFace Source** | `ai8shiro/deepfake-audio-wav2vec2-ONNX` |
| **Base Architecture** | `facebook/wav2vec2-base` + classification head |
| **Training Data** | Balanced ASVspoof 2021 PA/LA (per README) |
| **Quantization** | INT4/INT8 Quantized |
| **Input Name** | `input_values` |
| **Input Shape** | `[batch_size, sequence_length]` (float32) |
| **Sample Rate** | 16,000 Hz |
| **Output Name** | `logits` |
| **Output Shape** | `[batch_size, 2]` |
| **Output Semantics** | Raw logits → Softmax → `[p_bona_fide, p_spoof]` |
| **Measured SHA-256** | `8bf3d10c3dcfc5a485396998453e2474da6bf498fe01b4403ceb76e9a4a0ca11` |
| **Registry SHA-256 Match** | VERIFIED |
| **License** | MIT |

### Speaker Verifier (ECAPA-TDNN ONNX)

| Field | Value |
|---|---|
| **HuggingFace Source** | `MelissaJ/spkrec-ecapa-voxceleb-onnx` |
| **Base Architecture** | SpeechBrain ECAPA-TDNN |
| **Training Data** | VoxCeleb 1 & 2 |
| **Input Name** | `audio_input` |
| **Output Name** | `embedding_output` |
| **Output Shape** | `[1, 1, 192]` |
| **Output Norm (measured)** | ~368.0 (NOT L2-normalized by model) |
| **Code normalization** | Applied in `embedding.py` post-inference |
| **Measured SHA-256** | `2ef890f0212dbeb5684622c42c03b4df80ef4cc171da004d2ec754247a3cf3f9` |
| **Registry SHA-256 Match** | VERIFIED |
| **License** | Apache-2.0 |

> NOTE: The model README states "spherical L2-normalized" — but the model outputs raw un-normalized embeddings (norm ~368). Normalization is applied correctly in code.

### ASR (Faster-Whisper Base)

| Field | Value |
|---|---|
| **Quantization** | INT8 (CTranslate2) |
| **model.bin** | 145,217,532 bytes |
| **Languages** | 99 languages |
| **Compute** | CPU, 2 threads |

---

## 4. MEASURED LATENCY BENCHMARKS

Measured using `time.perf_counter()`, 5 warm repetitions.

### Deepfake (Wav2Vec2) — Warm Inference

| Audio Duration | Min | Median | Max |
|---|---|---|---|
| 256 ms | 88.8 ms | 94.1 ms | 103.4 ms |
| 512 ms | 134.0 ms | 140.6 ms | 162.1 ms |
| 1,000 ms | 175.9 ms | 196.3 ms | 259.0 ms |
| 2,000 ms | 332.4 ms | 345.6 ms | 368.7 ms |
| 3,000 ms | 491.1 ms | 516.0 ms | 539.7 ms |

### Speaker (ECAPA-TDNN) — Warm Inference

| Audio Duration | Min | Median | Max |
|---|---|---|---|
| 500 ms | 56.9 ms | 61.8 ms | 71.9 ms |
| 1,000 ms | 103.0 ms | 108.1 ms | 120.8 ms |
| 2,000 ms | 200.6 ms | 208.5 ms | 254.1 ms |
| 3,000 ms | 249.6 ms | 290.0 ms | 333.8 ms |

### ASR — Architecture Issue

**CRITICAL**: When ASR is called synchronously on every 256 ms chunk, Faster-Whisper base processes internally over a 30-second window, resulting in ~8,000-8,500 ms latency per call (documented in `PHASE6_BASELINE.md`).

ASR architecture status in orchestrator: `SYNCHRONOUS — NOT VAD-BUFFERED`  
The `process_chunk` calls `self.asr.transcribe(chunk, ...)` inline. Energy gating (`rms_energy > 0.005`) avoids Whisper on silence, but the latency bottleneck exists on voiced audio.

---

## 5. DEEPFAKE PREPROCESSING VERIFICATION

**Normalization**: Code checks if `max(abs(audio)) > 1.0` and divides by 32768.0. This correctly handles int16 raw values.

**Input shape**: `audio_float.reshape(1, -1)` → `[1, sequence_length]`. Matches model spec.

**Postprocessing**: Softmax applied to logits. `p_spoof = probs[1]`. Scientifically correct.

**Ensemble**: `combined_spoof = 0.60 × p_neural + 0.40 × p_dsp`  
No empirical evidence that this 60/40 weighting is optimal.

**Thresholds** (hardcoded, unvalidated):
- `spoof_threshold = 0.62` (SUSPICIOUS trigger)
- `authentic_threshold = 0.36` (AUTHENTIC trigger)

---

## 6. DATASET STATUS

| Dataset | Status | Local Files |
|---|---|---|
| ASVspoof 2021 DF | NOT DOWNLOADED | 0 |
| IndicVoices | NOT DOWNLOADED | 0 |
| Indic Parler-TTS | NOT DOWNLOADED | 0 |
| dataset_manifest.csv | HEADER ONLY | 0 records |

**Speaker leakage**: NOT VERIFIABLE — no data  
**Generator leakage**: NOT VERIFIABLE — no data  
**Duplicate detection**: NOT VERIFIABLE — no data  
**Data splits**: NOT ESTABLISHED — no data  

The leakage detection code infrastructure IS functional and tested (all 12 dataset foundation unit tests pass).

---

## 7. DEEPFAKE SCIENTIFIC VALIDATION

**Status**: `IMPLEMENTED / EXECUTABLE — SCIENTIFIC VALIDATION INCOMPLETE`

Unit tests pass on synthetic audio fixtures. No evaluation on:
- Real ASVspoof 2021 DF evaluation set
- Real human speech samples
- Real TTS/voice-cloning samples  
- Telephone-quality audio

Metrics EER, AUC, FPR, FNR: `NOT VERIFIED`

---

## 8. SPEAKER VERIFICATION SCIENTIFIC VALIDATION

**Status**: `IMPLEMENTED / EXECUTABLE — SCIENTIFIC VALIDATION INCOMPLETE`

No real speaker corpus. No enrollment/verification evaluation.

FAR, FRR, EER: `NOT VERIFIED`

---

## 9. REPLAY DETECTION EVALUATION

**Status**: `IMPLEMENTED (DSP) / EXECUTABLE — SCIENTIFIC VALIDATION INCOMPLETE`

DSP heuristic with 3 acoustic cues. No real replay recordings evaluated.

---

## 10. ASR VALIDATION

**Model**: Faster-Whisper Base INT8 — present and executable.

**Accuracy (WER)**: `NOT VERIFIED` — no labeled test set.

**Multilingual**: All 7 languages configured and executable. None scientifically validated.

---

## 11. CONVERSATIONAL THREAT DETECTION

All 11 SE/intent tests pass. The system correctly flags:
- OTP requests
- Authority impersonation
- Fear/threat tactics
- Financial pressure
- Credential harvesting

Critical principle verified: A low deepfake score does NOT suppress credential theft alerts.

**Quantitative FPR/TPR**: `NOT VERIFIED` — no labeled conversation corpus.

---

## 12. UNCERTAINTY AND FAILURE BEHAVIOR

All failure paths verified:
- Short audio → `INSUFFICIENT_AUDIO`
- POOR quality → `INCONCLUSIVE` + high uncertainty
- ASR crash → empty transcript, uncertainty=1.0, pipeline continues
- Model crash → `MODEL_UNAVAILABLE`, pipeline continues
- `NOT_AVAILABLE` is NEVER silently converted to `NOT_DETECTED`

---

## 13. PHASE 7 BUG FIXES (Pre-existing Phase 6 Bugs)

### Bug 1: ASR Fallback ValidationError
- **Location**: `orchestrator.py` lines 193-213
- **Cause**: `ASRResult` constructed with `None` for required Pydantic v2 str/enum fields
- **Fix**: Replaced with valid defaults (`""`, `""`, `LanguageCode.EN`)
- **Previously failing test**: `test_e2e_failure_isolation_asr_failure`
- **After fix**: PASS

### Bug 2: Risk Fusion UnboundLocalError
- **Location**: `orchestrator.py` lines 200, 438
- **Cause**: Local `from ... import ASRResult, PipelineStatus` inside ASR except block caused Python 3.14 to treat `PipelineStatus` as local in the function, making `PipelineStatus.ERROR` raise `UnboundLocalError` in the fusion except block
- **Fix**: Removed redundant inner import; used module-level `PipelineStatus`
- **Previously failing test**: `test_e2e_failure_isolation_risk_fusion_failure`
- **After fix**: PASS

---

## 14. FINAL ACCEPTANCE MATRIX

| Component | Implemented | Executable | Unit Tested | Scientifically Validated | Production Confidence |
|---|---|---|---|---|---|
| Deepfake | YES | YES | YES (synthetic fixtures) | NO | LOW — no real-data validation |
| Speaker | YES | YES | YES (synthetic fixtures) | NO | LOW — no EER measurement |
| Replay | YES (DSP) | YES | YES | NO | LOW — no real replay recordings |
| ASR | YES | YES | YES | NO | MEDIUM — model is Whisper Base, well-known |
| Intent Classifier | YES | YES | YES | PARTIAL — no FPR/FNR | MEDIUM |
| Social Engineering | YES | YES | YES | PARTIAL — no labeled corpus FPR | MEDIUM |
| Sensitive Data | YES | YES | YES | PARTIAL | MEDIUM |
| Multilingual | CONFIGURED | YES | YES (routing only) | NO | LOW — no real multilingual audio |
| Robustness | PARTIAL | PARTIAL | YES (edge cases) | NO | NOT ASSESSED |
| Calibration | IMPLEMENTED | YES | NO | NO | NOT ASSESSED |
| Temporal Stability | IMPLEMENTED | YES | YES | PARTIAL | MEDIUM |
| AI Latency | N/A | YES | YES | YES (measured) | ACCEPTABLE for acoustic path |
