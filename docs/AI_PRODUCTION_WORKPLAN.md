# VOXSHIELD SIH104 — AI PRODUCTION WORKPLAN

**Document Version:** 1.0.0  
**Date:** 2026-09-06  
**Status:** PROPOSED AUDIT WORKPLAN — PLANNING ONLY (NO CODE MODIFIED)  

---

## 1. Prioritization Criteria

- **P0 (Demo-Critical):** Essential to eliminate silent fallbacks on core demo paths, enable real neural acoustic inference, restore multilingual speech transcription, and ensure 100% clean test execution without synthetic skips.
- **P1 (Production Candidate):** Critical for real-world deployment credibility, including genuine speaker biometrics, resolving false positive replay detection on mobile microphones, and completing financial impact scoring.
- **P2 (Optional Enhancement):** Forward-looking research, localized Indic clone benchmarking, fine-grained audio splice forensics, and multi-node cluster synchronization.

---

## 2. P0 Tasks — Required for Credible Demo

### Task P0-1: PyTorch CPU Runtime & MiniAcousticCNN Activation [COMPLETED]
- **Objective:** Activate the frozen production acoustic model checkpoint (`robust_mini_acoustic_cnn_v1`) in the AI runtime without relying on DSP fallback.
- **Status:** **COMPLETED** (torch 2.14.0+cpu, torchaudio 2.11.0+cpu installed; checkpoint `best_robust_mini_acoustic_cnn.pt` loaded and verified).
- **Execution Evidence:**
  - `MODEL_BACKEND = neural` verified on real test audio fixtures.
  - `DeepfakeAcousticModel().is_neural_active == True`.
  - Architecture: MiniAcousticCNN (93,442 parameters) entering `eval()` mode.
  - Latency: ~6.5 ms CPU forward pass.
  - DSP fallback gracefully preserved on error.

---

### Task P0-2: Faster-Whisper Base INT8 Local Model Procurement [COMPLETED]
- **Objective:** Provision the official CTranslate2 INT8 quantized Whisper Base model files locally to enable live streaming speech-to-text.
- **Status:** **COMPLETED** (Downloaded 4 model files, total 141.03 MB to `ai/models/asr/faster-whisper-base/`).
- **Execution Evidence:**
  - `StreamingASREngine().is_neural_active == True`.
  - Live transcription verified on `OSR_us_000_0010_8k.wav` producing clear English text.
  - DSP energy/spectral fallback preserved on missing files or error.
  - Multilingual routing (hi, ta, te, mr, bn, en) functional.

---

### Task P0-3: Test Suite Normalization & Skip Reversal [COMPLETED]
- **Objective:** Safely revert temporary audit skips in `test_asr_engine.py` while preserving safe conditional skips in `test_speaker_verifier.py`.
- **Status:** **COMPLETED**.
- **Execution Evidence:**
  - `ai/tests/test_asr_engine.py` temporary skip removed; 17/17 tests passing naturally.
  - `ai/tests/test_speaker_verifier.py` condition evaluated safely with real neural anti-spoof screening active.
  - Pytest full AI suite: **128 passed, 0 failed, 0 skipped**.

---

### Task P0-4: Telephony Policy C Calibration & Threshold Switching [COMPLETED]
- **Objective:** Ensure automatic selection of operating point $\theta_{\text{wideband}} = 0.6850$ vs $\theta_{\text{telephony}} = 0.5250$ based on detected sampling rate and codec headers.
- **Status:** **COMPLETED** (Centralized `AcousticThresholdProfile` implemented; runtime switching verified across explicit channel type, telephony codec headers, narrowband 8 kHz sample rate, and acoustic bandwidth evidence).
- **Execution Evidence:**
  - `resolve_threshold` supports multi-tier precedence: explicit channel -> codec metadata -> sample rate (<= 8000 Hz) -> acoustic bandwidth -> default wideband.
  - Runtime switching verified: Wideband selects $\theta = 0.6850$; Telephony selects $\theta = 0.5250$.
  - Divergent decision test proven: Borderline score of $0.6000$ yields `AUTHENTIC` under wideband ($0.6000 < 0.6850$) but `SUSPICIOUS` under telephony ($0.6000 \ge 0.5250$).
  - Boundary value tests verified: wideband ($0.6849, 0.6850, 0.6851$) and telephony ($0.5249, 0.5250, 0.5251$).
  - Invalid scores (`NaN`, `+Inf`, `-Inf`, negative, `> 1.0`, `None`) safely degrade to `INCONCLUSIVE` without throwing.
  - Explainability audit trail includes applied channel type, applied threshold, profile name, and resolution reason without exposing private audio or conversation secrets.
  - Dedicated test suite: `ai/tests/test_p0_4_telephony_policy.py` (21/21 passed).
  - Full AI test suite: 149/149 passed. Backend: 354/354 passed. Frontend: clean build.

---

## 3. P1 Tasks — Important Production Candidates

### Task P1-1: SpeechBrain ECAPA-TDNN ONNX Asset Procurement & Calibration
- **Objective:** Procure the 192-dimensional ECAPA-TDNN ONNX model (`ecapa_tdnn.onnx`) and calibrate genuine vs. impostor cosine similarity thresholds.
- **Target Files:**
  - `ai/models/speaker/ecapa_tdnn.onnx`
  - `ai/app/speaker/embedding.py`
  - `ai/app/speaker/verifier.py`
- **Dependencies:** ONNX Runtime CPU.
- **Expected Output:** `SpeakerEmbeddingExtractor().is_neural_active == True`. 192-dimensional L2-normalized biometric vectors.
- **Tests Required:** `ai/tests/test_speaker_verifier.py`.
- **Validation Required:** Benchmark EER across paired enrollment/verification trials.
- **Estimated Complexity:** Medium (4–6 hours).
- **Model Weights Required:** YES — ~80 MB ONNX model.
- **External Dataset Required:** Recommended (VoxCeleb trial subset for threshold tuning).

---

### Task P1-2: Physical Replay Classifier (Replace Heuristic Rolloff)
- **Objective:** Replace the broken high-frequency decay ratio ($E_{>4\text{kHz}} / E_{\text{total}}$), which yields 100% false alarms on phone microphones, with a trained acoustic classifier.
- **Target Files:**
  - `ai/app/replay/detector.py`
  - `ai/app/replay/features.py`
  - `ai/models/replay/`
- **Dependencies:** Feature extraction pipeline on ASVspoof 2019 PA dataset.
- **Expected Output:** Mobile phone genuine voice false alarm rate reduced from 100% to $<10\%$.
- **Tests Required:** `ai/tests/test_replay_detector.py`.
- **Validation Required:** EER $<15\%$ on replayed vs bona-fide speech.
- **Estimated Complexity:** High (8–12 hours).
- **Model Weights Required:** YES — Lightweight model (<5 MB).
- **External Dataset Required:** YES (ASVspoof 2019 PA subset).

---

### Task P1-3: Quantitative Financial Action Risk Scorer
- **Objective:** Upgrade the placeholder `ActionRiskScorer` interface from `NOT_AVAILABLE` to a dynamic quantitative risk assessment module.
- **Target Files:**
  - `ai/app/action_risk/scorer.py`
  - `ai/app/core/types.py`
- **Dependencies:** Input mapping from `CallerClaimExtractor` and `ConversationalIntentClassifier`.
- **Expected Output:** Computes continuous action risk [0.0–1.0] evaluating transaction amount, beneficiary velocity, and account takeover risk.
- **Tests Required:** `ai/tests/test_phase4_conversational_intelligence.py`.
- **Validation Required:** Unit tests across high/medium/low financial threat scenarios.
- **Estimated Complexity:** Low (2–3 hours).
- **Model Weights Required:** NO.
- **External Dataset Required:** NO.

---

## 4. P2 Tasks — Optional Enhancements

### Task P2-1: Indic Cloned Voice Benchmark & Vernacular Tuning
- **Objective:** Evaluate MiniAcousticCNN detection performance on regional Indian languages (Hindi, Tamil, Telugu) synthesized via modern zero-shot TTS (e.g. Indic-TTS, Parler-TTS).
- **Target Files:**
  - `datasets/raw/indic_clones/`
  - `evaluation/evaluate_indic_deepfake.py`
- **Estimated Complexity:** High (12–16 hours).
- **External Dataset Required:** YES.

### Task P2-2: Audio Splicing & Local Manipulation Localization
- **Objective:** Implement frame-level acoustic artifact detection to pinpoint spliced words or inserted phrases in edited voice recordings.
- **Target Files:** `ai/app/audio/manipulation.py`.
- **Estimated Complexity:** High (16+ hours).
- **External Dataset Required:** YES.

### Task P2-3: Distributed Redis Conversation Context Store
- **Objective:** Persist multi-turn conversation state and sliding window audio features across distributed AI inference worker pods.
- **Target Files:** `ai/app/conversation/memory.py`, `backend/src/infrastructure/redis_pubsub.ts`.
- **Estimated Complexity:** Medium (4–6 hours).
- **External Dataset Required:** NO.

---

## 5. Execution Summary Matrix

| Task ID | Component | Priority | Weight Req.? | Ext. Data? | Complexity |
|---|---|---|---|---|---|
| **P0-1** | PyTorch & MiniAcousticCNN | **P0** | Present (1.1MB) | No | Low (1-2h) |
| **P0-2** | Faster-Whisper Base INT8 | **P0** | Download (140MB) | No | Medium (2-3h) |
| **P0-3** | Test Normalization | **P0** | No | No | Low (1h) |
| **P0-4** | Policy C Calibration | **P0** | No | No | Medium (3-4h) |
| **P1-1** | ECAPA-TDNN ONNX | **P1** | Download (80MB) | Optional | Medium (4-6h) |
| **P1-2** | Replay Model Replacement | **P1** | Train/Download (5MB) | Yes (PA) | High (8-12h) |
| **P1-3** | Action Risk Scorer | **P1** | No | No | Low (2-3h) |
| **P2-1** | Indic Clone Evaluation | **P2** | No | Yes | High (12-16h) |
| **P2-2** | Splicing Forensics | **P2** | Train (<10MB) | Yes | High (16h) |
| **P2-3** | Distributed Redis Context | **P2** | No | No | Medium (4-6h) |
