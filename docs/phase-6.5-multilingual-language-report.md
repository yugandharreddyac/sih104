# VOXSHIELD — Phase 6.5 Multilingual Language Routing & Indian Dialect Report
## Layered Language Routing, Indian Locale Normalization, Multi-Turn Context Tracking & ASR Integration

> **Lead ML Architect & Multilingual Systems Engineer:** Principal AI/ML & Security Architect  
> **Execution Date:** September 1, 2026  
> **Status:** COMPLETE  
> **Classification:** Engineering Implementation & Verification Report  

---

## 1. Executive Summary

This report documents the design, implementation, and verification of **Phase 6.5: Multilingual Language Routing & Indian Dialect Support** across the unified VOXSHIELD neural AI stack. The language routing subsystem introduces a production-ready, memory-bounded, layered architecture supporting **6 Indian languages and application dialect profiles** (Hindi `hi`, Tamil `ta`, Telugu `te`, Bengali `bn`, Marathi `mr`, and Indian English `en-IN`), complete with multi-turn session tracking, code-switching estimation, and direct ASR decoding acceleration.

### Key Deliverables & Outcomes:
1. **Full 6-Language Coverage:** Comprehensive normalization and routing for Hindi, Tamil, Telugu, Bengali, Marathi, and Indian English.
2. **Layered Routing Pipeline:** Resolves language via Explicit Hint $\to$ Text Script/Lexical Analysis $\to$ Faster-Whisper Native Detection $\to$ Multi-Turn Session Context $\to$ Safe Fallback.
3. **Multi-Turn Session Context:** Memory-bounded sliding window ($N=5$) with recency-weighted voting, enabling dynamic language switching without permanently locking to Turn 1.
4. **ASR Acceleration:** Passing explicit language hints to Faster-Whisper reduces decoding search latency from **4075 ms** to **1836 ms** (2.2x faster).
5. **Zero Single Point of Failure:** Preserves existing deterministic DSP fallbacks across all operational error modes.
6. **All Tests Green:** **109/109 automated tests passing** (AI: 59/59 in Pytest, Backend: 50/50 in Jest, TypeScript: 100% clean).

---

## 2. Supported Languages & Metadata Mapping

| Language | LanguageCode Enum | Display Name | ASR Model Hint | Primary Unicode Range |
| :--- | :--- | :--- | :--- | :--- |
| **Hindi** | `LanguageCode.HI` (`hi`) | Hindi | `hi` | Devanagari (`\u0900-\u097F`) |
| **Tamil** | `LanguageCode.TA` (`ta`) | Tamil | `ta` | Tamil (`\u0B80-\u0BFF`) |
| **Telugu** | `LanguageCode.TE` (`te`) | Telugu | `te` | Telugu (`\u0C00-\u0C7F`) |
| **Bengali** | `LanguageCode.BN` (`bn`) | Bengali | `bn` | Bengali (`\u0980-\u09FF`) |
| **Marathi** | `LanguageCode.MR` (`mr`) | Marathi | `mr` | Devanagari + Postposition Markers |
| **Indian English** | `LanguageCode.EN_IN` (`en-IN`) | Indian English | `en` | Latin Alphabet + Indian Context |
| **Generic English** | `LanguageCode.EN` (`en`) | English | `en` | Latin Alphabet |

> [!NOTE]
> **Indian English Dialect Disclosure:** `en-IN` represents an application-level operational routing profile and phonological context, rather than a claim of a standalone acoustic accent classifier. Standard English models (`faster-whisper-base`) receive the canonical `en` decoding hint while preserving `en-IN` metadata downstream for conversational intelligence and risk calibration.

---

## 3. Normalization Architecture

[LanguageIdentifier.normalize_language_code](../ai/app/asr/language.py) provides deterministic sanitization across diverse casing, punctuation, and locale conventions:

```text
Incoming Locale String
         │
         ├── "hi", "hi-IN", "HINDI", "hin-in"              ──► LanguageCode.HI
         ├── "ta", "ta-IN", "Tamil", "tam-in"              ──► LanguageCode.TA
         ├── "te", "te-IN", "Telugu", "tel-in"             ──► LanguageCode.TE
         ├── "bn", "bn-IN", "Bengali", "bangla"            ──► LanguageCode.BN
         ├── "mr", "mr-IN", "Marathi", "mar-in"            ──► LanguageCode.MR
         ├── "en-IN", "english india", "indian english"    ──► LanguageCode.EN_IN
         ├── "en", "eng", "english", "en-us"               ──► LanguageCode.EN
         └── "fr-FR", "es-ES", "unknown", None             ──► LanguageCode.UNSUPPORTED / UNKNOWN
```

---

## 4. Layered Detection & Decision Hierarchy

The routing decision is executed through 5 consecutive evaluation layers:

1. **Layer 1 — Explicit Application Hint:** Validates caller-specified language hint (`confidence: 0.98`, `detection_source: "explicit"`).
2. **Layer 2 — Text Script & Lexical Heuristics:** Matches native Unicode scripts (Devanagari, Tamil, Telugu, Bengali) and transliterated romanized phoneme markers (`confidence: 0.70 - 0.95`, `detection_source: "script_heuristic"` / `"lexical_heuristic"`).
3. **Layer 3 — Faster-Whisper Native Detection:** Utilizes Whisper's internal 99-language distribution probabilities when transcribing raw audio without prior text (`detection_source: "neural_whisper"`).
4. **Layer 4 — Multi-Turn Session Context Smoothing:** Leverages recent call history when current utterance contains sparse or ambiguous lexical evidence (`detection_source: "session_context"`).
5. **Layer 5 — Safe Fallback:** Defaults gracefully to `LanguageCode.EN_IN` (`confidence: 0.60`, `is_fallback: True`, `detection_source: "fallback"`).

---

## 5. Multi-Turn Conversational Tracking & Language Switching

The [LanguageContextTracker](../ai/app/asr/language.py) implements a memory-bounded sliding window:
* **Window Size:** $N = 5$ observations per session.
* **Weighted Voting:** Recency-weighted voting function:
  $$W_{\text{obs}} = \text{Confidence} \cdot \left(1.0 + \frac{\text{turn\_index}}{\text{window\_len}} \cdot 0.5\right)$$
* **Dynamic Language Switching:** If a caller initiates a call in Hindi (Turns 1–3) and switches to English (Turns 4–6), the sliding window dynamically shifts the posterior dominant language to English without locking the session to Turn 1.
* **Memory Bounding:** Maximum 1,000 active sessions with automatic LRU eviction; memory footprint for 100 concurrent call sessions is only **5.90 KB**.

---

## 6. Code-Switching & Mixed Language Handling

In conversational telephony across India, callers frequently mix regional vocabulary with English technical banking terminology ("Hinglish", "Tanglish", "Tenglish").
* **Implementation:** When transliterated regional markers co-occur with technical English keywords (`"otp"`, `"bank"`, `"account"`, `"manager"`, `"verify"`), the system produces:
  - `primary_language = LanguageCode.HI` (or `TE`, `TA`, `BN`, `MR`)
  - `secondary_language = LanguageCode.EN_IN`
  - `mixed_language_detected = True`
* **Risk Calibration:** Mixed-language detection does **NOT** increase fraud risk; it serves as an evidence-quality signal for ASR acoustic modeling and transcription uncertainty.

---

## 7. Performance Benchmarks

Measured locally on Intel Core i3-1215U (Windows 11 64-bit, 2 CPU threads):

| Metric | Measured Latency | Memory Impact |
| :--- | :--- | :--- |
| **Explicit Hint Routing Latency** | **0.330 ms** | 0 KB |
| **Native Script Heuristic Latency** | **0.053 ms** | 0 KB |
| **Lexical Heuristic Latency** | **0.193 ms** | 0 KB |
| **100 Concurrent Session Context Memory** | **N/A** | **5.90 KB** |
| **ASR Inference (Auto-Detect Language)** | **4075.09 ms** | Baseline |
| **ASR Inference (Explicit Language Hint)** | **1836.10 ms** | **2.2x Faster Decoding** |

---

## 8. Automated Test Results

```text
================================================================================
AUTOMATED TEST BASELINE VERIFICATION (PHASE 6.5)
================================================================================
AI Test Suite (python -m pytest ai -v):
  - Collected Tests:        59
  - Passed:                 59 (100%)
  - Failed:                 0
  - Execution Duration:     13.22s
  - Status:                 🟢 PASS

Backend Jest Test Suite (npm test):
  - Test Suites:            13
  - Total Tests:            50
  - Passed:                 50 (100%)
  - Failed:                 0
  - Execution Duration:     15.22s
  - Status:                 🟢 PASS

Backend TypeScript Compilation (npx tsc --noEmit):
  - Exit Code:              0
  - Status:                 🟢 PASS (Zero Type Errors)

Frontend TypeScript Compilation (npx tsc --noEmit):
  - Exit Code:              0
  - Status:                 🟢 PASS (Zero Type Errors)

TOTAL AUTOMATED TESTS:      109 / 109 PASSING (100% GREEN)
================================================================================
```

---

## 9. Security & Reliability Invariants

* **No Unsupported Language Crashes:** Unsupported ISO codes (e.g. `fr-FR`, `es-ES`) normalize to `LanguageCode.UNSUPPORTED` and default safely to fallback routing without raising uncaught exceptions.
* **Deterministic Risk Isolation:** Language uncertainty does not directly escalate fraud risk; fraud decisions remain strictly derived from acoustic deepfake scores, biometric speaker verification, intent heuristics, and policy rules.
* **DSP Fallback Intact:** If Faster-Whisper fails or throws an exception, the deterministic DSP energy fallback continues to execute seamlessly.

---

## 10. Phase 6.5 Decision

```text
================================================================================
DECISION: GO (PHASE 6.5 COMPLETE)
================================================================================
```

---

## 11. Recommended Next Phase

> **Phase 6.6 Task:** End-to-End Neural Pipeline Integration & Stress Testing across the complete multi-modal architecture (Streaming ASR $\to$ ECAPA-TDNN Speaker Biometrics $\to$ Wav2Vec2 Deepfake Detection $\to$ Multilingual Intent Classification $\to$ 10-Dimensional Risk Fusion & SOC Interventions).
