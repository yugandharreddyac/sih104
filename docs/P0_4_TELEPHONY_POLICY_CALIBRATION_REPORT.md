# VOXSHIELD SIH104 — P0-4 TELEPHONY POLICY CALIBRATION & RUNTIME THRESHOLD SWITCHING REPORT

**Date:** 2026-09-06  
**Starting Branch:** `integration/demo-ready`  
**Starting HEAD:** `5cbc12a6e891bd0ef6ea207c620b7b753c819e49`  
**Final Branch:** `integration/demo-ready`  
**Final HEAD:** `5cbc12a6e891bd0ef6ea207c620b7b753c819e49`  
**Status:** **PASS** (P0-4 Telephony Policy Calibration & Runtime Threshold Switching Fully Verified)

---

## 1. Scientific Calibration vs. Engineering Target Disclosure

> [!IMPORTANT]
> **Scientific Validation Statement:**  
> The operating thresholds deployed in this task ($\theta_{\text{wideband}} = 0.6850$ and $\theta_{\text{telephony}} = 0.5250$) are **engineering/calibration targets** established during the Phase 2C prototype evaluation (Policy C) on synthetic voice datasets and simulated G.711 round-trip conditions. **These thresholds are engineering/calibration targets and are not claimed to represent scientifically validated optimal thresholds.** They balance false-positive suppression against voice clone recall on evaluated test conditions, but do not represent unconstrained real-world PSTN field validation.

---

## 2. Threshold Logic & Configuration Architecture

### 2.1 Centralized Profile (`AcousticThresholdProfile`)
The threshold configuration has been formalized in `ai/app/deepfake/calibration.py`:
- `Profile Name`: `"Policy C (Dual-Mode Engineering Calibration)"`
- `Wideband Threshold`: `0.6850`
- `Telephony Threshold`: `0.5250`
- `Authentic Floor`: `0.5000`
- `Suspicious Min Confidence`: `0.5500`
- `Authentic Min Confidence`: `0.5000`
- `Poor Quality Uncertainty Penalty`: `0.8000`
- `Min Speech Duration`: `300.0 ms`

### 2.2 Decision Comparison Semantics
Decision boundaries in `DeepfakeCalibrator.calibrate`:
- **`SUSPICIOUS`**: `raw_score >= applied_threshold` AND `adjusted_confidence >= 0.55`
- **`AUTHENTIC`**: `raw_score < applied_threshold` AND `adjusted_confidence >= 0.50`
- **`INCONCLUSIVE`**: All intermediate scores, low-confidence predictions, or poor audio quality ratings

The comparison strictly uses `>=` for flagging suspicious deepfake audio and `<` for declaring authentic audio.

---

## 3. Runtime Operating Condition Resolution

The runtime selection of the operating threshold is deterministic and follows a strict multi-tier precedence order:

```
                          [ Incoming Audio Chunk ]
                                     |
                                     v
                  +--------------------------------------+
                  | 1. Explicit ChannelType in payload?  |
                  |    - WIDEBAND  --> theta = 0.6850    |
                  |    - TELEPHONY --> theta = 0.5250    |
                  +--------------------------------------+
                                     | (if AUTO or None)
                                     v
                  +--------------------------------------+
                  | 2. Known Telephony Codec Metadata?   |
                  |    (g711u/a, pcmu/a, alaw, amr, etc) |
                  |    --> TELEPHONY (theta = 0.5250)    |
                  +--------------------------------------+
                                     | (if non-telephony or None)
                                     v
                  +--------------------------------------+
                  | 3. Narrowband Sample Rate Metadata?  |
                  |    (sample_rate <= 8000 Hz)          |
                  |    --> TELEPHONY (theta = 0.5250)    |
                  +--------------------------------------+
                                     | (if > 8000 Hz or None)
                                     v
                  +--------------------------------------+
                  | 4. Acoustic Spectral Evidence?       |
                  |    (bandwidth <= 3800Hz, HF < 0.05)  |
                  |    --> TELEPHONY (theta = 0.5250)    |
                  +--------------------------------------+
                                     | (if ambiguous or wideband)
                                     v
                  +--------------------------------------+
                  | 5. Safe Default Fallback             |
                  |    --> WIDEBAND (theta = 0.6850)     |
                  +--------------------------------------+
```

---

## 4. Preprocessing & Duration Handling

### 4.1 Sample Rate Standardization
- The neural acoustic model (`MiniAcousticCNN`) and feature extractors operate natively on 16 kHz audio.
- When an inbound chunk specifies `sample_rate = 8000` (PSTN telephony rate), `DeepfakeDetector`:
  1. Computes exact duration using `effective_sr = chunk.sample_rate` (preventing duration halving bugs).
  2. Resamples linear PCM samples from 8 kHz to 16 kHz using `torchaudio.transforms.Resample(8000, 16000)` (with deterministic linear interpolation fallback).
  3. Feeds 16 kHz standardized samples to `AcousticFeatureExtractor` and `TwoChannelSpectrogramExtractor`.

### 4.2 Numerical Safety & Invalid Values
- `prediction.raw_spoof_score` is strictly validated against `NaN`, `+Infinity`, `-Infinity`, negative scores ($< 0.0$), out-of-range scores ($> 1.0$), and `None`.
- Any invalid score immediately triggers safe degradation to `DeepfakeStatus.INCONCLUSIVE` with `confidence = 0.0`, `uncertainty = 1.0`, and an audit explainability entry, preventing downstream NaN propagation into risk fusion.

---

## 5. Decision Divergence Proof

To prove that the selected threshold actively governs the decision point rather than merely being exposed as metadata, a borderline score of **`0.6000`** was tested:

| Operating Condition | Active Threshold $\theta$ | Raw Spoof Score | Comparison | Status Output |
|---|---|---|---|---|
| **Wideband Flow** | `0.6850` | `0.6000` | $0.6000 < 0.6850$ | **`AUTHENTIC`** |
| **Telephony Flow** | `0.5250` | `0.6000` | $0.6000 \ge 0.5250$ | **`SUSPICIOUS`** |

This proves that runtime switching directly influences security classifications. Under wideband VoIP, false alarms are suppressed by declaring 0.60 authentic; under narrowband telephony, sensitivity is heightened by declaring 0.60 suspicious.

---

## 6. Boundary Testing Results

| Test Condition | Score | Wideband ($\theta = 0.6850$) | Telephony ($\theta = 0.5250$) | Result |
|---|---|---|---|---|
| Wideband Boundary Below | `0.6849` | `AUTHENTIC` | N/A | **PASS** |
| Wideband Boundary Exact | `0.6850` | `SUSPICIOUS` | N/A | **PASS** |
| Wideband Boundary Above | `0.6851` | `SUSPICIOUS` | N/A | **PASS** |
| Telephony Boundary Below | `0.5249` | N/A | `AUTHENTIC` | **PASS** |
| Telephony Boundary Exact | `0.5250` | N/A | `SUSPICIOUS` | **PASS** |
| Telephony Boundary Above | `0.5251` | N/A | `SUSPICIOUS` | **PASS** |

---

## 7. Observability & Audit Trail

The decision pipeline enriches `DeepfakeAnalysisResult` with explicit, privacy-safe explainability metadata:
- `Applied channel type: <WIDEBAND | TELEPHONY>`
- `Applied spoof threshold: <0.6850 | 0.5250>`
- `Threshold profile: Policy C (Dual-Mode Engineering Calibration)`
- `Resolution reason: <e.g. Channel type resolved from telephony codec metadata (g711u)>`

No raw audio bytes, cryptographic secrets, or sensitive transcript information are written to explainability strings.

---

## 8. Test Execution & Regression Results

### 8.1 Focused P0-4 Test Suite (`ai/tests/test_p0_4_telephony_policy.py`)
- **Passed:** 21 / 21 tests
- **Failed:** 0
- **Duration:** 14.24 seconds

### 8.2 Full AI Pytest Suite (`pytest -o pythonpath=. ai/tests -v`)
- **Passed:** 149 / 149 tests (including 100-chunk neural stress benchmark)
- **Failed:** 0
- **Skipped:** 0
- **Duration:** 6m 39s

### 8.3 Backend Regression Test Suite (`npm test` in `backend/`)
- **Test Suites:** 33 passed / 33 total
- **Tests:** 354 passed / 354 total
- **Duration:** 70.75 seconds

### 8.4 TypeScript Compilation & Frontend Build
- **Backend TypeScript (`tsc`):** Clean compilation, 0 errors.
- **Frontend Build (`next build`):** Clean production bundle, 12 / 12 static pages generated.

---

## 9. Neural & Fallback Integrity Check

- **MiniAcousticCNN (Neural):** Remains 100% active as primary deepfake detector (`MODEL_BACKEND = neural`).
- **Faster-Whisper (ASR):** Remains 100% active as primary speech recognizer (`device="cpu", compute_type="int8"`).
- **DSP Acoustic Fallback:** Preserved intact; automatically activates if PyTorch forward pass raises an exception.
- **DSP Speaker Verification:** Preserved intact while awaiting ECAPA-TDNN in Phase P1.
- **Spectral Replay Fallback:** Preserved intact while awaiting physical replay classifier in Phase P1.

---

## 10. Remaining AI Work (Phases P1 & P2)

1. **P1-1: ECAPA-TDNN ONNX Asset Procurement & Calibration:** Procure `ai/models/speaker/ecapa_tdnn.onnx` (~80 MB) and calibrate genuine vs. impostor cosine thresholds.
2. **P1-2: Physical Replay Classifier:** Train/procure lightweight replay acoustic model to replace high-frequency roll-off heuristic.
3. **P1-3: Quantitative Financial Action Risk Scorer:** Implement live scoring logic in `ActionRiskScorer`.
4. **P2-1: Regional Indic Cloned Voice Benchmark & Vernacular Tuning.**
5. **P2-2: Audio Splicing & Local Manipulation Localization.**
6. **P2-3: Distributed Redis Conversation Context Store.**
