# SIH104 — Phase 7 Final Scientific Validation Report

**Classification**: Restricted — Internal Technical Document  
**Date**: September 3, 2026  
**Phase**: Phase 7 — AI/ML Scientific Validation  
**Environment**: Windows 10 x64, Python 3.14.5, ONNX Runtime 1.20+, CTranslate2

---

## EXECUTIVE SUMMARY

Phase 7 of SIH104 conducted a reproducible, evidence-based scientific audit of all AI/ML components. The objective was to determine whether the system's AI outputs can serve as reliable security signals for the SIH104 threat intelligence platform.

### Key Findings

| Finding | Severity |
|---|---|
| Two pre-existing bugs in the pipeline orchestrator were discovered and fixed | MEDIUM |
| SHA-256 checksums for both ONNX models match their registry entries | POSITIVE |
| Both ONNX models load and execute without error | POSITIVE |
| Deepfake model outputs require softmax (correctly applied in code) | VERIFIED |
| Speaker model outputs require L2 normalization (correctly applied in code) | VERIFIED |
| ASR runs synchronously and blocks the acoustic path on voiced audio | HIGH |
| Zero datasets have been downloaded — no statistical validation is possible | CRITICAL |
| All 102 unit tests PASS after Phase 7 bug fixes | POSITIVE |
| Measured inference latencies are acceptable for the acoustic path | POSITIVE |

---

## 1. AUDIT SCOPE

| Scope Item | Covered |
|---|---|
| Model provenance and checksum verification | YES |
| ONNX model input/output contract verification | YES |
| Inference latency benchmarks | YES |
| Preprocessing pipeline correctness | YES |
| Failure isolation and uncertainty propagation | YES |
| Unit test coverage and results | YES |
| Dataset acquisition and integrity | YES (infrastructure only — no data) |
| Statistical performance (EER, AUC, WER) | NOT POSSIBLE — no labeled data |
| Real-world audio evaluation | NOT POSSIBLE — no labeled data |
| Threshold calibration | NOT COMPLETED |
| Adversarial robustness | NOT EVALUATED |

---

## 2. MODEL PROVENANCE VERIFICATION

| Model | Source | SHA-256 (Measured vs Registry) | Verdict |
|---|---|---|---|
| Deepfake (Wav2Vec2 ONNX) | `ai8shiro/deepfake-audio-wav2vec2-ONNX` | `8bf3d10c...0ca11` — MATCH | VERIFIED |
| Speaker (ECAPA-TDNN ONNX) | `MelissaJ/spkrec-ecapa-voxceleb-onnx` | `2ef890f0...cf3f9` — MATCH | VERIFIED |
| ASR (Faster-Whisper Base INT8) | OpenAI Whisper Base via CTranslate2 | Not independently re-hashed | FILES PRESENT |

---

## 3. LATENCY BENCHMARKS (MEASURED)

### Deepfake — Wav2Vec2 ONNX (CPUExecutionProvider, 2 threads)

| Audio | Median | Max |
|---|---|---|
| 256 ms | 94.1 ms | 103.4 ms |
| 512 ms | 140.6 ms | 162.1 ms |
| 1,000 ms | 196.3 ms | 259.0 ms |
| 2,000 ms | 345.6 ms | 368.7 ms |
| 3,000 ms | 516.0 ms | 539.7 ms |

**Assessment**: Acceptable for acoustic path. The system can analyze a 1-second audio chunk in ~200 ms median.

### Speaker — ECAPA-TDNN ONNX (CPUExecutionProvider)

| Audio | Median | Max |
|---|---|---|
| 500 ms | 61.8 ms | 71.9 ms |
| 1,000 ms | 108.1 ms | 120.8 ms |
| 2,000 ms | 208.5 ms | 254.1 ms |
| 3,000 ms | 290.0 ms | 333.8 ms |

**Assessment**: Acceptable for acoustic path.

### ASR — Faster-Whisper Base INT8 (CPU)

**Not benchmarked** — Known from architecture analysis and Phase 6 documentation: ~8,000–8,500 ms on CPU when Whisper processes voiced audio.

**Assessment**: UNACCEPTABLE for synchronous inline processing. Requires async architecture.

---

## 4. BUGS DISCOVERED AND FIXED

### Bug 1: ASR Failure Handler — Pydantic ValidationError (SEVERITY: HIGH)

| | |
|---|---|
| **File** | `ai/app/pipeline/orchestrator.py:201` |
| **Status Before Phase 7** | BROKEN (causes pipeline crash when ASR fails) |
| **Root Cause** | `ASRResult` constructed with `None` for required Pydantic v2 fields |
| **Fix Applied** | Replace `None` with valid defaults: `""`, `""`, `LanguageCode.EN` |
| **Test Before Fix** | `test_e2e_failure_isolation_asr_failure` — **FAILED** |
| **Test After Fix** | `test_e2e_failure_isolation_asr_failure` — **PASSED** |

### Bug 2: Risk Fusion Fallback — UnboundLocalError (SEVERITY: HIGH)

| | |
|---|---|
| **File** | `ai/app/pipeline/orchestrator.py:438` |
| **Status Before Phase 7** | BROKEN (causes pipeline crash when risk fusion fails) |
| **Root Cause** | Inner `from ... import PipelineStatus` inside ASR except block caused `PipelineStatus` to be treated as locally scoped in Python 3.14, making the reference in the fusion except block an UnboundLocalError |
| **Fix Applied** | Removed redundant inner import; use module-level `PipelineStatus` |
| **Test Before Fix** | `test_e2e_failure_isolation_risk_fusion_failure` — **FAILED** |
| **Test After Fix** | `test_e2e_failure_isolation_risk_fusion_failure` — **PASSED** |

> **Critical Safety Implication**: Before these fixes, if both ASR AND risk fusion failed simultaneously, the pipeline orchestrator would raise an unhandled exception — breaching the "strict failure isolation" guarantee stated in the orchestrator docstring. This is now fixed.

---

## 5. FULL TEST SUITE RESULTS

### Pre-Fix Baseline (102 tests)

| Result | Count |
|---|---|
| PASSED | 100 |
| FAILED | 2 |
| TOTAL | 102 |

### Post-Fix State (102 tests)

| Result | Count |
|---|---|
| PASSED | 102 |
| FAILED | 0 |
| TOTAL | 102 |

> Verified independently: task-183 confirmed the 2 previously failing tests now PASS after the Phase 7 fixes.

### Test Coverage by Module

| Module | Tests | Pass |
|---|---|---|
| ASR Engine | 10 | 10 |
| Dataset Foundation | 12 | 12 |
| Deepfake Detector | 12 | 12 |
| End-to-End Pipeline | 11 | 11 |
| Intent Classifier | 1 | 1 |
| Multilingual Routing | 7 | 7 |
| Phase 3 Temporal + Robustness | 6 | 6 |
| Phase 4 Conversational | 7 | 7 |
| Replay Detector | 8 | 8 |
| Risk Fusion | 3 | 3 |
| Sensitive Data Detector | 1 | 1 |
| Social Engineering Tactics | 3 | 3 |
| Speaker Verifier | 10 | 10 |
| **TOTAL** | **102** | **102** |

---

## 6. PREPROCESSING VERIFICATION

| Check | Result |
|---|---|
| Deepfake: int16 → float32 normalization correct | VERIFIED |
| Deepfake: tensor reshaped to [1, N] | VERIFIED |
| Deepfake: softmax applied to logits | VERIFIED |
| Speaker: audio reshaped to [1, N] | VERIFIED |
| Speaker: L2 normalization applied post-inference | VERIFIED |
| Speaker: raw embedding norm ≠ 1.0 (model does not normalize) | DOCUMENTED |
| ASR: float32 input at 16 kHz | VERIFIED |
| NaN/Inf sanitization | VERIFIED |

---

## 7. DATASET STATUS

| Dataset | Files Present | Leakage Checked | Statistical Eval |
|---|---|---|---|
| ASVspoof 2021 DF | 0 | NOT VERIFIABLE | NOT POSSIBLE |
| IndicVoices | 0 | NOT VERIFIABLE | NOT POSSIBLE |
| Indic Parler-TTS | 0 | NOT VERIFIABLE | NOT POSSIBLE |

The leakage detection infrastructure (manifest, validator, leakage detector, adapters) is IMPLEMENTED and FUNCTIONALLY TESTED. Waiting for data download.

---

## 8. SCIENTIFIC VALIDATION STATUS MATRIX

| Component | Implemented | Executable | Empirically Validated | Calibrated |
|---|---|---|---|---|
| Deepfake (Neural) | YES | YES | NO | NO |
| Deepfake (DSP Fallback) | YES | YES | NO | NO |
| Speaker (Neural) | YES | YES | NO | NO |
| Speaker (DSP Fallback) | YES | YES | NO | NO |
| ASR (Neural) | YES | YES | NO (known model, no local WER) | N/A |
| Replay (DSP) | YES | YES | NO | NO |
| Intent Classifier (Rules) | YES | YES | NO | N/A |
| Social Engineering (Rules) | YES | YES | NO | N/A |
| Multilingual Routing | YES | YES | NO | N/A |
| Risk Fusion (Deterministic) | YES | YES | PARTIAL (unit tests) | NO |

---

## 9. OUTSTANDING ITEMS (BLOCKING SCIENTIFIC CERTIFICATION)

| Item | Priority | Owner |
|---|---|---|
| Download ASVspoof 2021 DF evaluation set | P0 | Data Team |
| Run `evaluate_deepfake.py` and compute EER/AUC | P0 | AI Team |
| Calibrate deepfake thresholds at FPR = 1% | P0 | AI Team |
| Download IndicVoices 50h subset per language | P1 | Data Team |
| Evaluate ASR WER on HI/TE/TA/BN | P1 | AI Team |
| Implement async VAD-buffered ASR in orchestrator | P0 | Eng Team |
| Collect labeled Indian banking vishing recordings | P1 | Data/Ops Team |
| Evaluate SE/Intent FPR on legitimate call transcripts | P1 | AI Team |
| Speaker EER evaluation on Indian speaker corpus | P1 | AI Team |
| Telephone robustness study (8 kHz codec) | P2 | AI Team |
| Adversarial audio robustness evaluation | P2 | AI Team |

---

## 10. SIGN-OFF

**Phase 7 Scientific Validation Status**: `INCOMPLETE — EXECUTABLE BUT NOT EMPIRICALLY VALIDATED`

The SIH104 system is:
- **Architecturally sound** — dual-engine fallback, failure isolation, explicit uncertainty
- **Computationally correct** — preprocessing, normalization, softmax applied correctly
- **Model-provenance verified** — SHA-256 checksums match registry
- **Unit-test complete** — 102/102 tests pass after Phase 7 bug fixes
- **NOT scientifically validated** — no labeled dataset evaluation, no EER/AUC measurement

The system is appropriate for use as a **security research prototype**. It should NOT be deployed as a standalone production-grade vishing detection system without completing the scientific validation roadmap in Section 9.
