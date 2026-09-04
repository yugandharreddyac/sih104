# VOXSHIELD Phase 1B.1 — Standalone Neural Training Prototype

## 1. Overview
Phase 1B.1 establishes an isolated neural prototype for voice deepfake detection. It trains a lightweight 2D Convolutional Neural Network (**MiniAcousticCNN**) on the 2,000-sample ASVspoof 2021 DF benchmark partition.

This prototype does **not** alter the production application runtime, the traditional Random Forest model, or any existing API contracts.

---

## 2. Feature Formulation
* **Input Waveform:** Raw 16,000 Hz mono PCM, normalized to $[-1.0, 1.0]$.
* **Deterministic Preprocessing:**
  - DC offset removal: $x[t] - \mu_x$
  - Pre-emphasis filter: $y[t] = x[t] - 0.97 \cdot x[t-1]$
  - Fixed 3.0-second window (48,000 samples). Deterministic prefix crop if $\ge 48,000$, zero-padding if $< 48,000$.
* **Time-Frequency Stacking:**
  - **Channel 0 (Log-Mel Spectrogram):** 60 Mel triangular filterbanks (80 Hz – 8,000 Hz), $N_{\text{FFT}}=512$, window=400, hop=160, log-power, per-sample standard score normalized.
  - **Channel 1 (LFCC Spectrogram):** 60 linear triangular filterbanks (0 Hz – 8,000 Hz), $N_{\text{FFT}}=512$, window=400, hop=160, log-power, DCT-II decorrelation across filter dimension, per-sample standard score normalized.
* **Output Tensor Shape:** `(2, 60, 301)` (2 channels, 60 frequency/cepstral bins, 301 time frames).

---

## 3. MiniAcousticCNN Architecture
```text
Input: (batch, 2, 60, 301)
  │
  ├── Block 1: Conv2D(2 -> 32, 3x3, pad 1, bias False) + BatchNorm2D(32) + ReLU + MaxPool2D(2x2)
  │            Output: (batch, 32, 30, 150)
  │
  ├── Block 2: Conv2D(32 -> 64, 3x3, pad 1, bias False) + BatchNorm2D(64) + ReLU + MaxPool2D(2x2)
  │            Output: (batch, 64, 15, 75)
  │
  ├── Block 3: Conv2D(64 -> 128, 3x3, pad 1, bias False) + BatchNorm2D(128) + ReLU
  │            Output: (batch, 128, 15, 75)
  │
  ├── AdaptiveAvgPool2D((1, 1)) -> Output: (batch, 128, 1, 1)
  ├── Flatten -> (batch, 128)
  ├── Dropout(p=0.3)
  └── Linear(128 -> 2) -> Logits: [bonafide, spoof]
```
* **Total Trainable Parameters:** **93,442** (~375 KB checkpoint size).
* **Target Execution:** 100% CPU inference ($< 10\text{ ms}$ on Intel Core i5-1235U).

---

## 4. Dataset Partitioning & Leakage Invariants
* **Dataset:** `datasets/processed/asvspoof_benchmark_2000.parquet`
* **Splits:**
  - Training: 1,400 samples (700 bonafide, 700 spoof; 64 speakers)
  - Validation: 300 samples (150 bonafide, 150 spoof; 14 speakers)
  - Held-out Test: 300 samples (150 bonafide, 150 spoof; 14 speakers)
* **Speaker Isolation:** Zero speaker overlap between train and test.
* **Model Selection:** Best epoch is selected using **Validation Recall (primary)** and **Validation F1 (secondary)**. The test set is evaluated exactly once after training.

---

## 5. Baseline Comparison Targets (Random Forest Test Reference)
The neural model's final test metrics will be compared against the existing Random Forest baseline evaluated on the identical 300-sample test set:

| Metric | Random Forest Baseline | Neural Prototype Target |
| :--- | :--- | :--- |
| **Recall (Sensitivity)** | **0.4000** | **$> 0.5500$ (Primary Goal: Reduce FNR)** |
| **False Negative Rate (FNR)**| **0.6000** | **$< 0.4500$** |
| **Accuracy** | 0.6433 | $\ge 0.6500$ |
| **F1 Score** | 0.5286 | $\ge 0.5500$ |
| **ROC-AUC** | 0.8106 | $\ge 0.8000$ |
| **Equal Error Rate (EER)** | 0.2700 | $\le 0.2500$ |
| **Inference Latency** | 0.59 ms | $< 15.0$ ms |

---

## 6. Execution Commands
Using the dedicated `.venv-neural` environment:

```bash
# Run the smoke test
.\.venv-neural\Scripts\python.exe ai/neural_prototype/smoke_test.py

# Run full 15-epoch training and test evaluation
.\.venv-neural\Scripts\python.exe ai/neural_prototype/train.py --epochs 15 --batch-size 32
```
