# VOXSHIELD: Evaluation Plan & Benchmark Strategy

## 1. Evaluation Objectives
The objective of the VOXSHIELD evaluation framework is to rigorously assess the detection accuracy, latency, false-alarm rates, and adversarial robustness of the complete defensive pipeline across synthetic speech, voice conversion, replay, and multi-modal social engineering attacks.

---

## 2. Benchmark Datasets & Corpus Strategy

| Corpus / Dataset | Category | Attack Types Covered | Purpose |
| :--- | :--- | :--- | :--- |
| **ASVspoof 2019 / 2021 (LA & PA)** | Standard Benchmark | Logical Access (TTS, VC) & Physical Access (Replay) | Baseline acoustic spoofing detection benchmarking |
| **In-the-Wild Audio Deepfake Dataset** | Real-World Synthesis | Modern diffusion/neural TTS (ElevenLabs, Bark, XTTS) | Evaluation against modern zero-shot cloned audio |
| **VoxCeleb 1 & 2** | Clean Acoustic Baseline | Genuine multi-speaker conversational speech | False Positive Rate (FPR) calibration & Speaker biometrics |
| **VOXSHIELD-SE Benchmark (Custom)** | Social Engineering Corpus | High-urgency, credential-harvesting, authority impersonation | Evaluation of NLP intent, urgency markers, and action risk |
| **Telephony Codec Perturbation Set** | Channel Robustness | G.711u/a, G.729, Opus, AMR-WB transcoding | Testing degradation under legacy telecom networks |

---

## 3. Evaluation Metrics

### A. Acoustic & Biometric Detection Metrics
1. **Equal Error Rate (EER)**: Operating point where False Acceptance Rate (FAR) equals False Rejection Rate (FRR).
2. **min t-DCF (Tandem Detection Cost Function)**: Primary metric assessing joint performance of biometrics and countermeasure systems.
3. **Detection Accuracy & F1-Score**: Evaluated across SNR regimes (0dB, 10dB, 20dB) and compression codecs.

### B. Social Engineering & Intent Metrics
1. **Precision / Recall / AUC-ROC**: Specific to urgency, authority impersonation, and secret solicitation classes.
2. **Entity Redaction Accuracy**: Percentage of sensitive tokens (OTP, CVV, passwords) successfully identified and redacted without leaking in plaintext.

### C. System Operational Metrics
1. **Chunk Processing Latency**: Wall-clock time to ingest, transcribe, analyze, and return risk scores for a 500ms audio window (Target: < 200ms).
2. **Pipeline End-to-End Latency**: Time from caller uttering a phrase to SOC dashboard alert rendering (Target: < 400ms).
3. **System Resource Utilization**: CPU, GPU VRAM, and memory consumption under 100 concurrent call streams.

---

## 4. Adversarial Testing Scenarios
- **Real-Time Voice Conversion Stress Test**: Live speaker driving a VC model during interactive dialogue.
- **Audio Injection Attack Simulation**: Direct digital injection into WebRTC peer connections bypassing acoustic air gaps.
- **Evasion via Noise & Music Masking**: Injecting background ambient office sounds or music to disrupt neural spectral artifact detection.
- **Multi-Turn Social Engineering Escalation**: Attackers progressively increasing psychological pressure across a 5-minute call.
