# VOXSHIELD — AI/ML Architecture Audit Report

**Audit Date:** 2026-09-07  
**Subsystem:** VOXSHIELD AI & Biometric Intelligence  
**Runtime:** Python 3.14.5 + PyTorch 2.14.0 CPU + ONNX Runtime 1.29.0 + CTranslate2  

---

## 1. AI/ML Subsystem Inventory

VOXSHIELD combines acoustic neural modeling, speaker biometrics, streaming speech recognition, and natural language conversational intelligence into a 10-dimensional risk fusion engine:

| Component | Model / Algorithm Type | Input Representation | Feature Extraction | Latency (Median) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Acoustic Deepfake Detector** | `MiniAcousticCNN` (93.4k params) / Wav2Vec2 ONNX | 16 kHz Mono PCM audio | 60-bin Log-Mel Spectrogram + 60-bin LFCC | 6.57 ms (CNN) / 57.7 ms (ONNX 256ms chunk) | **TRAINED & VALIDATED** |
| **Speaker Biometrics** | `ECAPA-TDNN` ONNX (192-D embeddings) | 16 kHz Mono PCM audio | Filterbank & Time-Delay Neural Tensor | 62.8 ms (500ms audio) | **PRETRAINED & VALIDATED** |
| **Multilingual ASR Engine** | `Faster-Whisper` (CTranslate2) | 16 kHz Audio Chunks | Neural Mel-Encoder & Beam Search | 120-180 ms (Streaming chunk) | **PRETRAINED & TESTED** |
| **Language & Locale Router** | Heuristic + Script-aware Classifier | Unicode transcript & phonetic stream | Native Indic script Unicode range detection | < 1.0 ms | **DETERMINISTIC & TESTED** |
| **Intent & Threat Classifier** | Semantic Keyword + Pattern Classifier | Redacted ASR Transcript | Regulatory threat taxonomy & urgency vectors | 1.2 ms | **HEURISTIC / HYBRID** |
| **Sensitive Data Redactor** | RegEx & Contextual Token Masker | Streaming Text Tokens | Financial PII pattern matching (OTP, CVV, Card) | < 0.5 ms | **DETERMINISTIC & TESTED** |
| **10D Risk Fusion Aggregator**| Dynamic Multi-Vector Weighted Tensor | 10 Input Signals (Acoustic, Biometric, NLP) | Cross-modal corroboration & confidence weighting | < 1.0 ms | **HYBRID & VALIDATED** |

---

## 2. Component Deep-Dive

### A. Acoustic Deepfake Engine (`ai/app/deepfake/detector.py`)
- **Primary Model:** `MiniAcousticCNN` (8 convolutional layers + adaptive average pooling, 93,442 parameters, 1.11 MB checkpoint).
- **Secondary / ONNX Model:** `deepfake_detector.onnx` (85.69 MB, SHA-256: `8bf3d10c...`).
- **Channel Compensation:** Dual-mode thresholding (Clean wideband $\theta=0.6850$, Telephony G.711 $\theta=0.5250$).
- **Fallback:** DSP spectral flux + zero-crossing rate fallback if ONNX runtime faults.

### B. Speaker Biometrics (`ai/app/speaker/verifier.py`)
- **Model:** `ecapa_tdnn.onnx` (80.24 MB, SHA-256: `2ef890f0...`).
- **Inference:** Extracts 192-dimensional vector embedding, applies L2 normalization, computes cosine similarity against enrolled enterprise voiceprint.
- **Anti-Spoofing Gate:** Enrollment rejects audio if synthetic probability exceeds 0.50.

### C. Conversational Intelligence & Privacy Firewall (`ai/app/conversation/`, `backend/src/security/privacy_firewall.ts`)
- **Redaction:** Sanitizes 4-6 digit numeric OTPs, 3-4 digit CVVs, 16-digit credit card numbers, Aadhaar, and PAN cards before persisting or streaming to SOC dashboard.
- **Threat Detection:** Detects high-urgency language, executive authority impersonation, coercion, and suspicious beneficiary alteration.

### D. 10-Dimensional Multi-Modal Risk Fusion (`ai/app/fusion/engine.py`)
Outputs composite risk score $[0.0, 1.0]$ across 10 distinct threat dimensions:
1. `acoustic_deepfake_risk`
2. `biometric_mismatch_risk`
3. `telephony_replay_risk`
4. `packet_manipulation_risk`
5. `conversational_urgency_risk`
6. `authority_impersonation_risk`
7. `credential_harvesting_risk`
8. `action_risk_financial`
9. `contradiction_inconsistency_risk`
10. `historical_session_risk`

---

## 3. Architecture Verdict
- **Status:** VALIDATED
- Model layers, contracts, fallback mechanisms, and numeric safety bounds are verified by 128 passing automated tests in `ai/tests/`.
