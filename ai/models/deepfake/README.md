# VOXSHIELD Model Staging: Acoustic Deepfake & Anti-Spoofing

## Active Production Model
* **Model Name:** `Robustness-Augmented MiniAcousticCNN (Source-Disjoint)`
* **Active Checkpoint Path:** `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`
* **Framework / Runtime:** PyTorch CPU (`torch`)
* **Architecture:** 2-channel log-Mel + LFCC Spectrogram CNN (93,442 parameters)
* **Storage Size:** 1,141,462 bytes (~1.14 MB)
* **Cryptographic Hash (SHA-256):** `b8c0b623175a7d53204004690aab3e1cbed921517189c80ad888ea5a3b7cbbc5`
* **Training Corpus:** VCC2020 + VCC2018 Robustness-Augmented Balanced Corpus
* **Inference Latency:** 6.57 ms (forward pass on CPU) / ~13-15 ms full evaluation pipeline
* **Operating Thresholds (Policy C):** Wideband VoIP ($\theta = 0.6850$), Telephony G.711 ($\theta = 0.5250$)

## Directory Staging Status (`ai/models/deepfake/`)
* **Directory Contents:** `.gitkeep`, `README.md` (No ONNX model weights files present on disk)
* **Historical / Intended ONNX Model:** `deepfake_detector.onnx` (Wav2Vec2 quantized ONNX)
  - *Status:* Historical/intended design; **NOT physically present on disk**.
  - *Claimed Upstream Checkpoint Size:* ~85.69 MB (89,855,582 bytes — unverified locally; file absent)
  - *Claimed Upstream SHA-256:* `8bf3d10c3dcfc5a485396998453e2474da6bf498fe01b4403ceb76e9a4a0ca11` (historical target hash; file absent)

## Runtime Loading & Dual-Engine Fallback
* **Primary Path:** [DeepfakeAcousticModel](../../app/deepfake/model.py) directly loads the verified PyTorch `best_robust_mini_acoustic_cnn.pt` checkpoint on CPU.
* **Secondary Fallback:** If PyTorch fails or audio is shorter than 300 ms, execution seamlessly routes to the deterministic LFCC higher-order variance, vocoder phase distortion, and Wiener spectral flatness DSP math.
* **Anti-Spoof Enrollment Gate:** All speaker biometric registrations are pre-screened through [DeepfakeDetector](../../app/deepfake/detector.py) to prevent enrollment poisoning.
