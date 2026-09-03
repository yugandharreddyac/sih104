# SIH104 — AI Limitations and Risk Disclosure

**Phase 7 Scientific Validation**  
**Version**: 1.0  
**Date**: September 3, 2026

---

## 1. PURPOSE

This document provides a factual, non-marketing disclosure of the limitations, risks, and scientifically unvalidated aspects of SIH104's AI/ML system. This document is intended for system integrators, auditors, and deployment decision-makers.

---

## 2. CRITICAL LIMITATIONS

### 2.1 No Real-Data Scientific Validation

> **The single most important limitation of SIH104 as of Phase 7 release is that NO AI/ML model has been evaluated on a real-world labeled audio dataset.**

All unit tests use synthetically generated audio fixtures (sine waves, simple tone generators). These do NOT represent real-world call recordings, real human speech, real TTS synthesis, or real voice cloning attacks.

The following metrics are UNKNOWN:
- Deepfake detector EER (Equal Error Rate)
- Deepfake detector AUC
- Deepfake detector FPR / FNR
- Speaker verifier FAR / FRR / EER
- ASR WER (Word Error Rate) on Indian languages
- Intent classifier precision / recall
- Social engineering detector FPR / FNR

---

### 2.2 Datasets Not Downloaded

All three required datasets (ASVspoof 2021, IndicVoices, Indic Parler-TTS) are currently absent from the repository. Until these are downloaded and evaluated against, no performance claims can be made.

---

### 2.3 Hardcoded Thresholds Without Calibration

The following thresholds are hardcoded design decisions with NO empirical backing:

| Threshold | Current Value | Source |
|---|---|---|
| Deepfake spoof trigger | 0.62 | Developer estimate |
| Deepfake authentic trigger | 0.36 | Developer estimate |
| Speaker neural match | 0.88 cosine | Developer estimate |
| Speaker DSP match | 0.70 cosine | Developer estimate |
| Replay HF rolloff | 0.04 | Developer estimate |
| Replay reverberation decay | 120 ms | Developer estimate |

A proper calibration study would set these thresholds to achieve a specific operating point (e.g., FPR = 1%) on a held-out labeled dataset.

---

### 2.4 ASR Synchronous Blocking

The pipeline orchestrator calls Whisper ASR synchronously on every 256 ms audio chunk. Whisper internally processes a 30-second window, causing approximately 8,000–8,500 ms blocking latency per voiced chunk. 

This effectively serializes the acoustic and NLP pipelines. The deepfake, speaker, and replay detectors (which together run in ~400–700 ms on a 1-second chunk) would be blocked waiting for ASR.

**Mitigation** (not yet implemented): VAD-buffered async ASR on 2–3 second segments.

---

### 2.5 Neural Model Domain Mismatch

#### Deepfake Detector (Wav2Vec2)
- Trained on ASVspoof 2021 (primarily English lab recordings)
- Performance on **Indian language speech** is UNKNOWN
- Performance on **Indian-accent English** is UNKNOWN
- Performance on **telephone-quality audio** (8 kHz, GSM codec) is UNKNOWN
- Performance on **Indian TTS systems** (Parler-TTS, Indic-TTS) is UNKNOWN

#### Speaker Verifier (ECAPA-TDNN)
- Trained on VoxCeleb (primarily English-speaking, studio conditions)
- Performance on **Indian language speakers** is UNKNOWN
- Performance on **telephone-quality audio** is UNKNOWN
- **VoxCeleb training corpus demographic composition** is not characterized

---

### 2.6 Replay Detector Is DSP-Only

The replay detection module does NOT use any trained neural model. It relies on 3 acoustic heuristics:
1. High-frequency roll-off
2. Reverberation decay time
3. Channel distortion

This approach can be defeated by:
- High-quality loudspeaker + anechoic environment (defeats cue 1 and 2)
- Voice cloning (plays through headset directly — defeats all 3 cues)
- Digital injection (bypasses physical channel — defeats all 3 cues)

---

### 2.7 Conversational Detection is Rule-Based

The intent classifier and social engineering detector use regex pattern matching and keyword lists — NOT any trained ML model.

Known limitations:
- New attack vocabulary not in the pattern library will be missed
- Paraphrased attacks (e.g., "can I get the verification number you received?") may not trigger OTP patterns
- Adversarial input designed to evade keyword matching will succeed
- FPR on legitimate banking call scripts is UNKNOWN

---

### 2.8 Multilingual Gaps

While 7 languages are configured (EN, EN-IN, HI, TE, TA, BN, MR):
- The ASR model is Whisper Base, which is known to have higher WER on low-resource Indian languages vs. English
- The SE and intent keyword patterns are more extensive for English than for regional languages
- Hindi code-switching (mixing Hindi and English mid-sentence) may confuse the ASR and intent classifier
- IndicVoices and Parler-TTS datasets have not been used for any evaluation

---

### 2.9 Memory and Session Limitations

- Session memory is bounded at `MAX_TURNS = 100` per call
- After 100 turns, the oldest turns are evicted
- This means very long calls may miss early-turn claim inconsistencies
- Session state is in-process memory only — no Redis/DB persistence

---

## 3. RESIDUAL RISKS FOR PRODUCTION DEPLOYMENT

| Risk | Likelihood | Impact | Mitigated By |
|---|---|---|---|
| High FPR (false alarms on legitimate calls) | UNKNOWN | HIGH — agent alert fatigue | Threshold calibration study needed |
| Missed voice cloning attacks | MODERATE | HIGH | Human-in-the-loop for HIGH risk |
| Missed Indian TTS attacks | HIGH (no validation) | HIGH | Indic dataset evaluation needed |
| ASR blocking acoustic path | HIGH | MEDIUM | Async ASR architecture needed |
| Replay detected on Bluetooth headset (false alarm) | MODERATE | MEDIUM | Field testing needed |
| Pattern-evading social engineering | MODERATE | HIGH | NLP model upgrade needed |
| Session state loss on process crash | HIGH | MEDIUM | Persistence layer needed |

---

## 4. WHAT IS PRODUCTION-READY

The following aspects of SIH104 are production-ready for a **security research prototype** (not a production vishing detection system):

- All AI/ML modules load without error
- SHA-256 model integrity is verified and matches registry
- All failure paths produce explicit error codes (no silent failures)
- Failure in one module does NOT crash the pipeline
- All uncertainty bounds are propagated and accessible
- Session isolation and memory bounding are enforced
- Adversarial inputs (malformed audio, NaN, Inf) are handled gracefully
- The risk fusion engine produces consistent output in all tested conditions
- All 102 unit tests PASS after Phase 7 bug fixes

---

## 5. RECOMMENDED VALIDATION ROADMAP

1. **Immediate**: Download ASVspoof 2021 DF evaluation set and run deepfake evaluation
2. **Immediate**: Compute EER, AUC, FPR@FNR thresholds, calibrate
3. **Short-term**: Download IndicVoices subset, evaluate ASR WER on HI/TE/TA/BN
4. **Short-term**: Collect Indian banking vishing call recordings for SE evaluation
5. **Medium-term**: Implement async VAD-buffered ASR in the orchestrator
6. **Medium-term**: Evaluate deepfake detector on Parler-TTS Indian TTS data
7. **Medium-term**: Speaker verification evaluation with Indian speaker corpus
8. **Long-term**: Replace rule-based intent/SE with fine-tuned multilingual NLP model
9. **Long-term**: Telephone-quality degradation robustness study
10. **Long-term**: Formal adversarial attack evaluation
