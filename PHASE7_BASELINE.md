# SIH104 — PHASE 7 AI/ML SCIENTIFIC BASELINE AUDIT

**Generated**: September 3, 2026  
**Auditor**: AI/ML Lead & Senior Production Engineer  
**Repository**: `yugandharreddyac/sih104`

---

## 1. Inventory of Existing AI/ML Assets

| Asset Name | Component Type | Physical Disk Path | File Size / Format | Ingress Input Contract | Output Logit / Score Contract | Provenance & Baseline Reality |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- |
| **Deepfake Model** | **Neural ONNX** | `ai/models/deepfake/deepfake_detector.onnx` | **85.69 MB** (ONNX) | Float32 `(1, sequence_length)` at $16\text{ kHz}$ | Logits `(1, 2)` $\to$ Softmax Spoof Prob ($0.0 - 1.0$) | Executable Wav2Vec2 backbone; uncalibrated on unseen generators |
| **Speaker Model** | **Neural ONNX** | `ai/models/speaker/ecapa_tdnn.onnx` | **80.24 MB** (ONNX) | Float32 `(1, time)` at $16\text{ kHz}$ | 192-dim normalized embedding | Executable ECAPA-TDNN embedder; requires enrollment profile |
| **ASR Engine** | **Neural CTranslate2** | `ai/models/asr/faster-whisper-base/` | **138.49 MB** (`model.bin`) | Float32 array at $16\text{ kHz}$ | Word tokens, text transcript, confidence | Faster-Whisper Base INT8; CPU execution bottleneck on short frames |
| **Replay Detector** | **DSP (SciPy FFT)** | `ai/app/replay/detector.py` | Code | 16 kHz PCM buffer | Spectral roll-off ratio ($0.0 - 1.0$) | Non-neural signal processing heuristic |
| **Intent Classifier** | **Rule-Based (Regex)**| `ai/app/intent/classifier.py` | Code | String transcript | 17-class taxonomy category + confidence | Deterministic pattern matching |
| **Social Engineering**| **Rule-Based (Keyword)**| `ai/app/social_engineering/detector.py` | Code | String transcript | Multi-turn progression state + attack score | Multilingual dictionary keyword matching |
| **Risk Fusion** | **Deterministic Matrix**| `ai/app/fusion/engine.py` | Code | CanonicalRiskSignal list | 10-D weighted score + uncertainty penalty | Deterministic linear combination formula |

---

## 2. Dataset Infrastructure & Current Status

* **Status**: Raw benchmark datasets (ASVspoof 2021 DF, IndicVoices, Indic Parler-TTS) have **NOT been downloaded to local disk** (`datasets/raw/` is currently empty).
* **Validation Modules Available**:
  - `ai/app/datasets/manifest.py`: Canonical manifest schema validator.
  - `ai/app/datasets/leakage.py`: Speaker, generator, and duplicate hash leakage detectors.
  - `ai/app/datasets/quality.py`: Audio format, SNR, and class balance reporter.
  - `ai/app/datasets/adapters.py`: Format adapters for ASVspoof, IndicVoices, and Parler-TTS.

---

## 3. Scientific Validation Baseline Status

* **Deepfake Generalization**: **UNVALIDATED ON INDEPENDENT EXTERNAL DATASETS** (Executable locally on CPU).
* **Speaker Verification EER**: **UNVALIDATED ON EXTERNAL BENCHMARK CORPORA**.
* **Multilingual Accuracy**: **CONFIGURED & TESTED WITH SYNTHETIC FIXTURES (SCIENTIFIC ACCURACY UNVALIDATED)**.
* **ASR Latency**: Continuous CPU Whisper execution on single 256 ms frames exhibits an $\approx 8.43\text{ s}$ bottleneck; requires async VAD speech buffering or GPU acceleration.
