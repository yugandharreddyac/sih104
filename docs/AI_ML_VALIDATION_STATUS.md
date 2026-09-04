# VOXSHIELD AI/ML Subsystem Validation Status Report

**Document Version:** 1.0.0  
**Status:** FROZEN FOR INTEGRATION & FINAL REVIEW  
**Scope:** Strict evidence-based accounting of all AI/ML models, datasets, benchmarks, and fallbacks.  

---

## 1. Executive Summary & Four-Tier Categorization

To maintain complete scientific and engineering integrity, VOXSHIELD subsystems are categorized into four unambiguous tiers. No heuristic, mock, or unit test is presented as scientific validation.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    TIER 1: SCIENTIFICALLY VALIDATED                        │
│  • Robustness-Augmented MiniAcousticCNN (Source-Disjoint VCC2020/2018)      │
│  • Channel-Aware Operating Thresholds (Policy C: VoIP vs Telephony)        │
│  • Traditional Random Forest Acoustic Feature Baseline                     │
├────────────────────────────────────────────────────────────────────────────┤
│                    TIER 2: FUNCTIONALLY TESTED                             │
│  • Faster-Whisper Base INT8 Streaming ASR (CTranslate2 CPU)                │
│  • Deterministic Policy Engine & Step-Up Intervention Orchestration        │
│  • WebSocket Streaming Sequence Guards, Deduplication & Codec Validation   │
│  • 10-Session Bounded Concurrency & Multi-Call Isolation Benchmark         │
│  • Privacy Redaction Firewall (PII/OTP/PCI masking)                        │
├────────────────────────────────────────────────────────────────────────────┤
│                    TIER 3: IMPLEMENTED (FALLBACK / HEURISTIC)              │
│  • Deterministic 64-Band FFT Random Projection Biometric Embedder          │
│  • Multilingual Heuristic Script & Lexical Identification (Indic/EN)       │
│  • VAD Multi-Feature Acoustic Gate (Energy, ZCR, Spectral Centroid)        │
│  • Spectral Decay Physical Replay Heuristic                                │
│  • Inter-Chunk Variance Manipulation Detector                              │
├────────────────────────────────────────────────────────────────────────────┤
│                    TIER 4: BLOCKED / NOT VALIDATED                         │
│  • Genuine ECAPA-TDNN Neural Speaker Verification (Weights absent)         │
│  • Physical Acoustic Replay Detection (No labeled replay dataset)          │
│  • Audio Splicing / Manipulation Detection (No labeled splice dataset)     │
│  • Indic Cloned Voice Detection (No authorized Hindi/Tamil/Telugu attack)  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Production Model Freeze: Robust MiniAcousticCNN

* **Production Model ID:** `robust_mini_acoustic_cnn_v1`
* **Artifact Path:** `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`
* **Architecture:** 2-Channel MiniAcousticCNN (60-bin log-Mel + 60-bin LFCC spectrogram input, 4 convolutional blocks, adaptive average pooling, dropout 0.3)
* **Parameters:** 93,442 float32 parameters (~1.14 MB on disk)
* **Cryptographic SHA-256:** `b8c0b623175a7d53204004690aab3e1cbed921517189c80ad888ea5a3b7cbbc5`
* **Execution Framework:** PyTorch CPU (`torch`) with zero GPU requirement
* **Runtime Status:** **FROZEN PRODUCTION MODEL** (Active in `DeepfakeAcousticModel` & `DeepfakeDetector`)
* **Historical Disclaimer:** The previously planned `deepfake_detector.onnx` (Wav2Vec2 quantized ONNX) represents a historical design and is **NOT present on disk**. The production detector uses `robust_mini_acoustic_cnn_v1`.

---

## 3. Scientifically Validated Subsystems & Empirical Metrics

### A. Robust MiniAcousticCNN vs. Traditional Random Forest Baseline
Evaluated on **300 held-out academic test utterances** (150 bona-fide human speech, 150 unseen attacks across 13 synthesis/conversion algorithms A07–A19 from ASVspoof 2021 DF):

| Model & Evaluation Condition | Parameters | Operating Threshold ($\theta$) | Accuracy | Precision | Recall | F1 Score | ROC-AUC | False Positive Rate | Equal Error Rate (EER) | Inference Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Random Forest Baseline** (In-Domain) | 100 trees | 0.5000 | 64.33% | 77.92% | 40.00% | 0.5286 | 0.8106 | 11.33% | 27.00% | 0.59 ms |
| **MiniAcousticCNN Clean** (Unseen A07–A19) | 93,442 | 0.5000 | 74.67% | 90.22% | 55.33% | 0.6860 | 0.9026 | 6.00% | 18.33% | 6.57 ms |
| **MiniAcousticCNN Robust** (C0 Clean VoIP) | 93,442 | 0.5000 | **81.33%** | 85.61% | **75.33%** | **0.8014** | 0.8733 | 12.67% | 22.67% | 6.57 ms |
| **MiniAcousticCNN Robust** (C0 VoIP, Policy C) | 93,442 | **0.6850** | **74.33%** | **93.98%** | **52.00%** | **0.6695** | 0.8733 | **3.33%** | 22.67% | 6.57 ms |
| **MiniAcousticCNN Robust** (C3 G.711 A-law) | 93,442 | 0.5000 | 70.67% | 67.82% | 78.67% | 0.7284 | 0.7702 | 37.33% | 31.33% | 6.57 ms |
| **MiniAcousticCNN Robust** (C3 Telephony, Policy C) | 93,442 | **0.5250** | **70.00%** | **68.29%** | **74.67%** | **0.7134** | 0.7702 | **34.67%** | 31.33% | 6.57 ms |

### B. Channel-Aware Threshold Calibration (Policy C)
A universal threshold across communication channels causes either catastrophic false alarms on telephony or missed attacks on VoIP:
* **Clean / Wideband VoIP ($\ge 16\text{ kHz}$):** Operating point $\theta_{\text{wideband}} = \mathbf{0.6850}$. Suppresses false alarms to **3.33%** (5 false alarms in 150 innocent callers) with **93.98% precision**.
* **Telephony PSTN / Cellular (G.711 A-law / $\mu$-law):** Operating point $\theta_{\text{telephony}} = \mathbf{0.5250}$. Achieves **74.67% spoof recall** and **0.7134 F1** under 8-bit companding noise.
* **Safety Gate:** Audio duration $<300\text{ ms}$ yields `INSUFFICIENT_AUDIO`; severe clipping/low SNR yields `POOR` quality penalty (elevating uncertainty without fabricating false positives).

### C. Network Robustness & Packet Degradation
Evaluated under simulated network transport anomalies:
* **In-Order Baseline:** 100% packet delivery, accurate sequence assembly.
* **Single Packet Loss & Burst Loss:** Sequence forward gap detected; pipeline flags gap for downstream interpolation without audio truncation.
* **Duplicates:** Exact duplicate sequence numbers rejected immediately (`DUPLICATE_OR_OUT_OF_ORDER`).
* **Out-of-Order Packets:** Stale packets arriving behind current high-water mark are dropped.
* **Codec Safety Guard:** Explicit compressed telephony (G.729, AMR) and wideband (Opus, AAC) payloads are rejected before misinterpretation as 16-bit PCM (`UNSUPPORTED_CODEC_REQUIRES_PCM`).

### D. Concurrency & Performance Profile
* **Pure Neural Forward Pass:** **6.57 ms** on standard laptop CPU (Intel Core i5-1235U / i3-1215U).
* **Full Pipeline Latency (Decode + Resample + Features + Inference):** **13.35 ms** (Clean VoIP), **15.25 ms** (G.711 Telephony).
* **Real-Time Factor (RTF):** $\text{RTF} \approx 0.0051$ (~196x faster than real-time for 3.0s window).
* **Bounded Stress Benchmark:** 10 concurrent calls $\times$ 10 sequential chunks (100 total operations) executed cleanly on CPU without memory leaks or inter-session state contamination.

---

## 4. Subsystems NOT Scientifically Validated & Specific Negative Findings

The following subsystems are implemented as engineering fallbacks or heuristics only. **Scientific validation must NOT be claimed for them:**

### A. Physical Replay Detection
* **Actual Negative Finding:** In cross-domain validation, **25 out of 25 bona-fide Hindi mobile speech controls were misclassified as `LIKELY_REPLAY` (100% false positive rate)**.
* **Root Cause:** The heuristic high-frequency decay energy ratio ($E_{>4\text{kHz}} / E_{\text{total}}$) assumes unattenuated studio acoustics. Typical smartphone microphones and ambient Indian room acoustics naturally attenuate frequencies above 4 kHz, triggering the heuristic replay threshold on genuine human speech.
* **Dataset Limitation:** The repository contains **zero labeled physical acoustic replay attack datasets** (e.g. ASVspoof 2019 PA).
* **Status:** Experimental heuristic fallback only; not scientifically validated.

### B. Speaker Biometric Verification
* **Actual Negative Finding:** **No genuine ECAPA-TDNN neural checkpoint weights exist on disk** in `ai/models/speaker/`.
* **Runtime Fallback:** The active biometric pipeline operates on a deterministic 64-band FFT filterbank with temporal statistics pooling and fixed random projection matrix (128-dimensional L2-normalized vector).
* **Dataset Limitation:** No paired speaker verification trial protocol (genuine vs impostor pairs with ground truth) is present in the repository.
* **Status:** Functional engineering fallback only; biometric error rates (EER, FAR, FRR) remain unvalidated.

### C. Audio Splicing & Manipulation Detection
* **Limitation:** Inter-chunk spectral variance and energy discontinuity checks are implemented in code, but **no labeled splicing/manipulation dataset** exists to validate true positive detection rates.
* **Status:** Functional heuristic only; not scientifically validated.

### D. Cloned Indic-Language Attack Evaluation
* **Limitation:** While authentic Indic speech (Hindi, Tamil, Telugu, Marathi, Bengali from IndicVoices) was used to verify language identification, **no authorized dataset of cloned/synthesized Indian-language speech** is available.
* **Status:** Scientific robustness against vernacular deepfake clones remains unverified.

---

## 5. Critical Technical Limitations

1. **Academic vs. Commercial Synthesis Domain Shift:**  
   The MiniAcousticCNN was trained on VCC2020/VCC2018 and evaluated on ASVspoof 2021 DF academic vocoders (A07–A19). While generalization across these 13 unseen systems is proven ($0.8733$ AUC), performance against closed-source commercial zero-shot voice cloning engines (e.g. ElevenLabs, Cartesia, OpenAI Voice Engine) has not been evaluated due to lack of public benchmark sets.

2. **ASR Accuracy & Dialect Limitations:**  
   Faster-Whisper Base INT8 is operational and functional. However, word error rate (WER) and character error rate (CER) across non-standard Indian dialects, rural accents, and heavy code-switching have not been scientifically benchmarked against ground-truth corpora.

3. **CPU ASR Latency Constraint:**  
   While the MiniAcousticCNN runs in 6.57 ms, Faster-Whisper Base INT8 CPU inference requires ~250–450 ms on multi-second speech chunks, making ASR single-flight scheduling mandatory during live call streaming.

4. **Telephony Results Are Experimental:**  
   The G.711 A-law/$\mu$-law findings were produced via deterministic software companding emulation ($C3$ / $C2$). Real-world cellular networks introduce variable packet loss concealment, non-linear vocoding (AMR-WB), and cell-tower handoff jitter that may alter operational operating curves.

5. **Concurrency Baseline Hardware Dependency:**  
   The 50-call benchmark and 10-call stress tests reflect measurements on a specific 12th-Gen Intel CPU host. Real-world deployment concurrency depends on available core count, memory bandwidth, and Node.js event loop scheduling.

---

## 6. Architecture & Risk Policy Invariants

* **Risk Policy Architecture Unmodified:** Deterministic security rules (`BLOCK_DISCLOSURE`, `REQUIRE_STEP_UP_VERIFICATION`, OTP protection) remain untouched and enforce safety regardless of AI uncertainty.
* **Zero Fake AI Scores:** When an engine is unavailable or uninitialized, explicit `NOT_AVAILABLE` flags and `is_fallback: True` indicators are produced; synthetic scores are never generated.
* **Isolated Failure Boundaries:** Acoustic failure, ASR timeout, or biometric mismatch in any sub-engine never crashes active call WebSocket streams.
