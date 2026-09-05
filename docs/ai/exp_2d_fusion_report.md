# EXP-2D-FUSE — CNN + Deterministic DSP Score Fusion Report

**Project**: VOXShield AI/ML Scientific Validation  
**Task**: Task 2 — Deepfake Detection Improvements  
**Experiment**: EXP-2D-FUSE — CNN + Deterministic DSP Score Fusion  
**Date**: September 5, 2026  
**Status**: COMPLETE — NOT SUPPORTED FOR PRODUCTION INTEGRATION  
**Author**: Bhavya AI/ML Validation Suite  
**Branch**: `feature/bhavya-premium-ai`  

---

## 1. Executive Summary

In Task 2, experiments **EXP-2A-ABL**, **EXP-2B-NOISE**, and **EXP-2B-SW** identified that while the frozen production model `robust_mini_acoustic_cnn_v1` maintains solid clean performance ($81.33\%$ accuracy, $85.61\%$ precision, $0.8733$ ROC-AUC on C0), it experiences severe false-positive degradation under telephone-band filtering (C4 FPR: $77.33\%$) and additive Gaussian noise (C5 FPR: $92.00\%$).

**EXP-2D-FUSE** tests whether fusing existing deterministic digital signal processing (DSP) and acoustic indicators with the frozen CNN classifier can mitigate these false alarms without degrading clean detection or causing unacceptable recall collapse.

```
===================================================================================================
                                      SCIENTIFIC VERDICT
===================================================================================================
                       NOT SUPPORTED — DO NOT INTEGRATE CNN+DSP FUSION
===================================================================================================
1. Deterministic DSP scores do NOT provide true discriminative gain over degraded audio:
   - On C4 (Telephone Bandpass), ROC-AUC remains stagnant (0.6120 vs 0.6119 CNN-only).
   - On C5 (Additive Noise), ROC-AUC collapses below random guessing (0.4791 vs 0.5544 CNN-only).
2. Apparent FPR reductions are purely artifacts of downward threshold shifting:
   - In Linear Production Fusion (SYS4), C4 FPR drops from 77.3% to 45.3% (-32.0 pp), but Recall
     plunges from 84.0% to 58.7% (-25.3 pp), and C0 clean Recall collapses from 75.3% to 56.7% (-18.7 pp).
3. DSP heuristics exhibit catastrophic channel conflation:
   - Narrowband filtering removes high frequencies, and Gaussian noise inflates spectral flatness,
     causing bona fide human speech to trigger synthetic DSP artifacts.
4. Production recommendation: KEEP PROTECTED PRODUCTION MODEL STANDALONE. Do not integrate.
===================================================================================================
```

---

## 2. Protected Production Model & Integrity Invariants

The production model remained strictly read-only and frozen throughout all evaluations.

### 2.1 Model Identity
- **Registration Name**: `robust_mini_acoustic_cnn_v1`
- **Architecture**: `MiniAcousticCNN` ($93{,}442$ parameters)
- **Input Shape**: $(2, 60, 301)$ (Channel 0: Log-Mel Spectrogram; Channel 1: LFCC Spectrogram)
- **Protected Checkpoint**: `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`
- **Protected Checkpoint Size**: $382{,}217\text{ bytes}$
- **Protected SHA-256 Checksum**:
  `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
- **Integrity Assertion**: Checksum verified bitwise identical before and after experiment execution.

### 2.2 Baseline Operating Rule
- **Threshold**: Strictly frozen at production baseline $\theta = 0.50$.
- **Mode**: Inference only (`torch.no_grad()`, `eval()`). Zero weights updated.

---

## 3. Dataset & Data Processing Provenance

### 3.1 Unseen-Attack Held-Out Evaluation Dataset (Frozen Test Set)
Evaluations were performed on the exact same held-out benchmark dataset established in Task 1 and reused in EXP-2A, EXP-2B, and EXP-2B-SW:
- **Manifest**: `ai/neural_prototype/results/unseen_attack_eval_manifest.parquet`
- **Total Samples**: $300$ held-out utterances
- **Class Balance**: Exactly balanced — $150$ bona fide human speech / $150$ deepfake spoof speech
- **Speakers**: $9$ unseen speakers ($4$ female, $5$ male)
- **Attacks**: Exclusively unseen ASVspoof 2019 algorithms: **A07 through A19**
- **Disjoint Guarantee**: Zero train/test speaker overlap; zero train/test attack system overlap.

### 3.2 Evaluation Channel Conditions (C0–C5)
Each of the $300$ audio files was evaluated across 6 conditions ($1{,}800$ scoring trials per system):
- **C0 (Clean Reference)**: $16\text{ kHz}$ lossless linear PCM.
- **C1 (8 kHz Round-Trip)**: Resampled $16\text{ kHz} \to 8\text{ kHz} \to 16\text{ kHz}$.
- **C2 (G.711 $\mu$-law)**: 8-bit ITU-T G.711 $\mu$-law compression round-trip.
- **C3 (G.711 A-law)**: 8-bit ITU-T G.711 A-law compression round-trip.
- **C4 (Telephone Bandpass)**: 8th-order Chebyshev Type I bandpass filter ($300\text{--}3400\text{ Hz}$).
- **C5 (Additive Noise)**: Additive white Gaussian noise at $15\text{ dB SNR}$.

> [!CAUTION]
> **Scientific Limitation Notice**: Synthetic C1–C5 transformations are deterministic digital simulations. They do **not** emulate non-linear transducer distortion, physical acoustic room reverberation, multi-path echo, or carrier-grade VoIP packet loss. Real-world telephony performance cannot be inferred solely from digital transforms.

---

## 4. Deterministic DSP Features & Extraction

To strictly adhere to scientific validation requirements, candidate DSP signals were reused directly from existing repository implementations in [ai/app/deepfake/features.py](file:///d:/sih_hackathon/sih104/ai/app/deepfake/features.py) and [ai/neural_prototype/features.py](file:///d:/sih_hackathon/sih104/ai/neural_prototype/features.py). No artificial heuristics were invented.

### 4.1 Feature Definitions
1. **Wiener Spectral Flatness** ($\mathcal{F}$):
   $$\mathcal{F} = \frac{\exp\left(\frac{1}{K}\sum_{k=1}^K \ln S(k)\right)}{\frac{1}{K}\sum_{k=1}^K S(k)}$$
   Measures tonal structure vs noise-like dispersion in the power spectrum.
2. **High-Frequency Energy Ratio** ($\mathcal{R}_{\text{HF}}$):
   $$\mathcal{R}_{\text{HF}} = \frac{\sum_{f \ge 4000\text{Hz}} S(f)}{\sum_{f < 4000\text{Hz}} S(f) + \epsilon}$$
   Quantifies upper-band energy relative to the fundamental formant region.
3. **Temporal RMS Energy Variance** ($\mathcal{V}_{\text{temp}}$):
   $$\mathcal{V}_{\text{temp}} = \mathrm{Var}\left(\sqrt{\frac{1}{W}\sum_{n=1}^W x^2[n + mH]}\right)$$
   Measures dynamic syllabic intensity modulation across short-time frames ($25\text{ ms}$ window, $10\text{ ms}$ hop).
4. **Vocoder Phase Distortion / Jitter** ($\mathcal{J}_{\phi}$):
   Frame-to-frame complex phase difference variance across spectrogram bins, identifying neural vocoder phase reconstruction discontinuities.

### 4.2 The Feature Inversion Discovery
Inspection of clean training/validation data revealed a fundamental flaw in the production DSP heuristic:
- The production implementation in `ai/app/deepfake/model.py` (`_predict_dsp`) assumed that deepfakes exhibit *higher* flatness, *higher* high-frequency ratio, and *higher* temporal variance:
  $$\text{flatness} > 0.40 \quad\land\quad \text{hf\_ratio} > 0.15 \quad\land\quad \text{temporal\_variance} > 0.25$$
- **Empirical Validation Reality**:
  On the source-disjoint clean validation set ($140$ samples, $70$ bona / $70$ spoof):
  - Bona fide speech: $\text{Flatness} = 0.463$, $\text{HF Ratio} = 1.072$, $\text{Temp Var} = 0.518$
  - Spoof speech: $\text{Flatness} = 0.355$, $\text{HF Ratio} = 0.442$, $\text{Temp Var} = 0.152$
- **Result**: Bona fide human expressive speech naturally has richer harmonics, wider bandwidth, and more syllabic pause dynamics than early-generation TTS/VC speech. Consequently, the production DSP heuristic achieved an **inverted** ROC-AUC of **$0.3323$** (worse than random guessing) on clean validation data.

---

## 5. Fusion Architectures & Validation-Only Calibration

To give DSP features the strongest scientifically valid evaluation, parameter selection was conducted strictly on the **clean validation split** (`val_clean`, $140$ samples, zero speaker overlap, zero test overlap). The held-out test set remained completely frozen.

### 5.1 Evaluated Systems
1. **SYS1: `SYS1_CNN_ONLY` (Production Baseline)**:
   Frozen `MiniAcousticCNN` score with threshold $\theta = 0.50$.
2. **SYS2: `SYS2_DSP_PROD_ONLY`**:
   Existing uncalibrated production heuristic: $S_{\text{DSP}} \in [0.0, 1.0]$ based on threshold matches.
3. **SYS3: `SYS3_DSP_CAL_ONLY`**:
   Logistic regression fitted exclusively on validation Z-score normalized features:
   $$\mathbf{z} = \frac{\mathbf{x} - \boldsymbol{\mu}_{\text{val}}}{\boldsymbol{\sigma}_{\text{val}}}$$
   Weights $\mathbf{w} = [-0.3790, -0.7108, -0.2747, +0.3544]$, Intercept $b = -0.0255$.
   Validation Clean ROC-AUC: $0.7108$.
4. **SYS4: `SYS4_LINEAR_PROD_FUSE`**:
   Weighted linear combination of CNN score and production DSP score:
   $$S_{\text{fuse}} = (1 - \alpha) S_{\text{CNN}} + \alpha S_{\text{DSP\_prod}}, \quad \alpha = 0.30$$
5. **SYS5: `SYS5_LINEAR_CAL_FUSE`**:
   Weighted linear combination of CNN score and calibrated DSP score:
   $$S_{\text{fuse}} = (1 - \alpha) S_{\text{CNN}} + \alpha S_{\text{DSP\_cal}}, \quad \alpha = 0.30$$
6. **SYS6: `SYS6_LOGISTIC_FUSE`**:
   Validation-calibrated multivariate logistic fusion:
   $$S_{\text{fuse}} = \sigma(w_{\text{cnn}} S_{\text{CNN}} + w_{\text{dsp}} S_{\text{DSP\_cal}} + b_0)$$
   Parameters fitted on clean validation set:
   $w_{\text{cnn}} = 5.0188$, $w_{\text{dsp}} = 2.5065$, $b_0 = -4.7633$.

---

## 6. Comprehensive Held-Out Test Results (C0–C5)

The table below reports all performance metrics across all $6$ conditions evaluated on the $300$-sample held-out unseen-attack evaluation set ($150$ bona fide, $150$ spoof; ASVspoof 2019 A07–A19).

### 6.1 Condition C0: Clean 16 kHz Reference

| System | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | Latency (ms) | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SYS1_CNN_ONLY** | **81.3%** | **75.3%** | **85.6%** | **0.8014** | **0.8733** | **12.7%** | **24.7%** | **22.7%** | 8.79 | 113 | 131 | 19 | 37 |
| **SYS2_DSP_PROD_ONLY** | 50.0% | 0.0% | 0.0% | 0.0000 | 0.6672 | 0.0% | 100.0% | 36.3% | 5.51 | 0 | 150 | 0 | 150 |
| **SYS3_DSP_CAL_ONLY** | 41.0% | 52.7% | 42.7% | 0.4716 | 0.3612 | 70.7% | 47.3% | 60.0% | 5.51 | 79 | 44 | 106 | 71 |
| **SYS4_LINEAR_PROD_FUSE** | 75.7% | 56.7% | 91.4% | 0.6996 | 0.8785 | 5.3% | 43.3% | 18.7% | 14.58 | 85 | 142 | 8 | 65 |
| **SYS5_LINEAR_CAL_FUSE** | 76.7% | 73.3% | 78.6% | 0.7586 | 0.8437 | 20.0% | 26.7% | 24.0% | 14.58 | 110 | 120 | 30 | 40 |
| **SYS6_LOGISTIC_FUSE** | 71.3% | 44.7% | 95.7% | 0.6091 | 0.8367 | 2.0% | 55.3% | 25.3% | 14.58 | 67 | 147 | 3 | 83 |

---

### 6.2 Condition C1: 8 kHz Round-Trip Resampling

| System | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | Latency (ms) | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SYS1_CNN_ONLY** | **65.3%** | **79.3%** | **62.0%** | **0.6959** | **0.7187** | **48.7%** | **20.7%** | **35.3%** | 8.42 | 119 | 77 | 73 | 31 |
| **SYS2_DSP_PROD_ONLY** | 50.0% | 0.0% | 0.0% | 0.0000 | 0.5034 | 0.0% | 100.0% | 55.3% | 6.05 | 0 | 150 | 0 | 150 |
| **SYS3_DSP_CAL_ONLY** | 50.0% | 100.0% | 50.0% | 0.6667 | 0.2304 | 100.0% | 0.0% | 73.0% | 6.05 | 150 | 0 | 150 | 0 |
| **SYS4_LINEAR_PROD_FUSE** | 61.0% | 45.3% | 66.0% | 0.5375 | 0.7188 | 23.3% | 54.7% | 35.7% | 17.59 | 68 | 115 | 35 | 82 |
| **SYS5_LINEAR_CAL_FUSE** | 64.0% | 92.0% | 59.0% | 0.7188 | 0.7053 | 64.0% | 8.0% | 36.7% | 17.59 | 138 | 54 | 96 | 12 |
| **SYS6_LOGISTIC_FUSE** | 63.7% | 68.0% | 62.6% | 0.6518 | 0.7026 | 40.7% | 32.0% | 36.0% | 17.59 | 102 | 89 | 61 | 48 |

---

### 6.3 Condition C2: G.711 $\mu$-law Compression

| System | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | Latency (ms) | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SYS1_CNN_ONLY** | **71.7%** | **76.7%** | **69.7%** | **0.7302** | **0.7849** | **33.3%** | **23.3%** | **29.3%** | 7.50 | 115 | 100 | 50 | 35 |
| **SYS2_DSP_PROD_ONLY** | 50.0% | 0.0% | 0.0% | 0.0000 | 0.5072 | 0.0% | 100.0% | 55.0% | 5.73 | 0 | 150 | 0 | 150 |
| **SYS3_DSP_CAL_ONLY** | 50.0% | 100.0% | 50.0% | 0.6667 | 0.2289 | 100.0% | 0.0% | 73.3% | 5.73 | 150 | 0 | 150 | 0 |
| **SYS4_LINEAR_PROD_FUSE** | 65.0% | 45.3% | 74.7% | 0.5643 | 0.7850 | 15.3% | 54.7% | 28.7% | 16.11 | 68 | 127 | 23 | 82 |
| **SYS5_LINEAR_CAL_FUSE** | 68.0% | 88.7% | 62.7% | 0.7348 | 0.7760 | 52.7% | 11.3% | 30.0% | 16.11 | 133 | 71 | 79 | 17 |
| **SYS6_LOGISTIC_FUSE** | 70.0% | 67.3% | 71.1% | 0.6918 | 0.7744 | 27.3% | 32.7% | 30.3% | 16.11 | 101 | 109 | 41 | 49 |

---

### 6.4 Condition C3: G.711 A-law Compression

| System | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | Latency (ms) | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SYS1_CNN_ONLY** | **70.7%** | **78.7%** | **67.8%** | **0.7284** | **0.7702** | **37.3%** | **21.3%** | **31.3%** | 7.45 | 118 | 94 | 56 | 32 |
| **SYS2_DSP_PROD_ONLY** | 50.0% | 0.0% | 0.0% | 0.0000 | 0.5074 | 0.0% | 100.0% | 55.0% | 5.80 | 0 | 150 | 0 | 150 |
| **SYS3_DSP_CAL_ONLY** | 50.0% | 100.0% | 50.0% | 0.6667 | 0.2293 | 100.0% | 0.0% | 73.3% | 5.80 | 150 | 0 | 150 | 0 |
| **SYS4_LINEAR_PROD_FUSE** | 63.3% | 45.3% | 70.8% | 0.5528 | 0.7707 | 18.7% | 54.7% | 31.3% | 16.13 | 68 | 122 | 28 | 82 |
| **SYS5_LINEAR_CAL_FUSE** | 66.7% | 91.3% | 61.2% | 0.7326 | 0.7610 | 58.0% | 8.7% | 31.7% | 16.13 | 137 | 63 | 87 | 13 |
| **SYS6_LOGISTIC_FUSE** | 68.3% | 68.7% | 68.2% | 0.6844 | 0.7589 | 32.0% | 31.3% | 31.7% | 16.13 | 103 | 102 | 48 | 47 |

---

### 6.5 Condition C4: Telephone Bandpass (300–3400 Hz)

| System | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | Latency (ms) | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SYS1_CNN_ONLY** | **53.3%** | **84.0%** | **52.1%** | **0.6429** | **0.6119** | **77.3%** | **16.0%** | **44.3%** | 7.72 | 126 | 34 | 116 | 24 |
| **SYS2_DSP_PROD_ONLY** | 50.0% | 0.0% | 0.0% | 0.0000 | 0.4902 | 0.0% | 100.0% | 49.3% | 5.84 | 0 | 150 | 0 | 150 |
| **SYS3_DSP_CAL_ONLY** | 50.0% | 100.0% | 50.0% | 0.6667 | 0.2244 | 100.0% | 0.0% | 74.0% | 5.84 | 150 | 0 | 150 | 0 |
| **SYS4_LINEAR_PROD_FUSE** | 56.7% | 58.7% | 56.4% | 0.5752 | 0.6120 | 45.3% | 41.3% | 41.7% | 14.62 | 88 | 82 | 68 | 62 |
| **SYS5_LINEAR_CAL_FUSE** | 51.0% | 94.7% | 50.5% | 0.6589 | 0.5951 | 92.7% | 5.3% | 44.7% | 14.62 | 142 | 11 | 139 | 8 |
| **SYS6_LOGISTIC_FUSE** | 53.3% | 76.0% | 52.3% | 0.6196 | 0.5924 | 69.3% | 24.0% | 45.3% | 14.62 | 114 | 46 | 104 | 36 |

---

### 6.6 Condition C5: Additive Gaussian Noise (15 dB SNR)

| System | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | Latency (ms) | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SYS1_CNN_ONLY** | **52.0%** | **96.0%** | **51.1%** | **0.6667** | **0.5544** | **92.0%** | **4.0%** | **46.7%** | 7.56 | 144 | 12 | 138 | 6 |
| **SYS2_DSP_PROD_ONLY** | 56.0% | 84.0% | 53.8% | 0.6562 | 0.5917 | 72.0% | 16.0% | 44.0% | 5.63 | 126 | 42 | 108 | 24 |
| **SYS3_DSP_CAL_ONLY** | 49.0% | 0.7% | 20.0% | 0.0129 | 0.2752 | 2.7% | 99.3% | 66.3% | 5.63 | 1 | 146 | 4 | 149 |
| **SYS4_LINEAR_PROD_FUSE** | 52.0% | 98.0% | 51.0% | 0.6712 | 0.5919 | 94.0% | 2.0% | 44.0% | 15.63 | 147 | 9 | 141 | 3 |
| **SYS5_LINEAR_CAL_FUSE** | 51.7% | 78.7% | 51.1% | 0.6194 | 0.4791 | 75.3% | 21.3% | 52.0% | 15.63 | 118 | 37 | 113 | 32 |
| **SYS6_LOGISTIC_FUSE** | 46.0% | 6.0% | 30.0% | 0.1000 | 0.4687 | 14.0% | 94.0% | 52.0% | 15.63 | 9 | 129 | 21 | 141 |

---

## 7. Comparative Delta Analysis vs Frozen CNN Baseline

The tables below quantify the exact delta of each fused candidate relative to the frozen production baseline `SYS1_CNN_ONLY`.

### 7.1 SYS4: Linear Production Fusion ($0.70 S_{\text{CNN}} + 0.30 S_{\text{DSP\_prod}}$)
*Evaluates whether adding the existing production heuristic improves robustness:*

| Condition | $\Delta$ Acc | $\Delta$ Recall | $\Delta$ Precision | $\Delta$ F1 | $\Delta$ ROC-AUC | $\Delta$ FPR | $\Delta$ FNR | $\Delta$ EER |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C0 (Clean)** | $-5.7\%$ | **$-18.7\%$** | $+5.8\%$ | **$-0.1018$** | $+0.0052$ | $-7.3\%$ | $+18.7\%$ | $-4.0\%$ |
| **C1 (8 kHz)** | $-4.3\%$ | **$-34.0\%$** | $+4.0\%$ | **$-0.1584$** | $+0.0001$ | $-25.3\%$ | $+34.0\%$ | $+0.3\%$ |
| **C2 ($\mu$-law)** | $-6.7\%$ | **$-31.3\%$** | $+5.0\%$ | **$-0.1659$** | $+0.0001$ | $-18.0\%$ | $+31.3\%$ | $-0.7\%$ |
| **C3 (A-law)** | $-7.3\%$ | **$-33.3\%$** | $+3.0\%$ | **$-0.1756$** | $+0.0005$ | $-18.7\%$ | $+33.3\%$ | $+0.0\%$ |
| **C4 (Bandpass)** | $+3.3\%$ | **$-25.3\%$** | $+4.3\%$ | **$-0.0677$** | **$+0.0001$** | **$-32.0\%$** | $+25.3\%$ | $-2.7\%$ |
| **C5 (Noise)** | $+0.0\%$ | $+2.0\%$ | $-0.0\%$ | $+0.0045$ | $+0.0375$ | **$+2.0\%$** | $-2.0\%$ | $-2.7\%$ |

> [!CRITICAL]
> **Diagnostic Finding on SYS4**:
> While C4 FPR drops by $32.0$ percentage points ($77.3\% \to 45.3\%$), this is **not** a true discriminative gain:
> 1. ROC-AUC is completely unchanged ($\Delta\text{AUC} = +0.0001$).
> 2. The FPR decrease comes at the expense of a severe **$25.3$ percentage point collapse in Recall** ($84.0\% \to 58.7\%$) and a loss in F1 score ($0.6429 \to 0.5752$).
> 3. C0 clean recall collapses by **$18.7$ percentage points** ($75.3\% \to 56.7\%$).
> 4. C5 noise FPR **worsens** to $94.0\%$.

---

### 7.2 SYS5: Linear Calibrated Fusion ($0.70 S_{\text{CNN}} + 0.30 S_{\text{DSP\_cal}}$)
*Evaluates linear combination with validation-calibrated DSP scores:*

| Condition | $\Delta$ Acc | $\Delta$ Recall | $\Delta$ Precision | $\Delta$ F1 | $\Delta$ ROC-AUC | $\Delta$ FPR | $\Delta$ FNR | $\Delta$ EER |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C0 (Clean)** | $-4.7\%$ | $-2.0\%$ | $-7.0\%$ | $-0.0428$ | **$-0.0296$** | **$+7.3\%$** | $+2.0\%$ | $+1.3\%$ |
| **C1 (8 kHz)** | $-1.3\%$ | $+12.7\%$ | $-3.0\%$ | $+0.0229$ | $-0.0134$ | $+15.3\%$ | $-12.7\%$ | $+1.3\%$ |
| **C2 ($\mu$-law)** | $-3.7\%$ | $+12.0\%$ | $-7.0\%$ | $+0.0046$ | $-0.0089$ | $+19.3\%$ | $-12.0\%$ | $+0.7\%$ |
| **C3 (A-law)** | $-4.0\%$ | $+12.7\%$ | $-6.7\%$ | $+0.0042$ | $-0.0092$ | $+20.7\%$ | $-12.7\%$ | $+0.3\%$ |
| **C4 (Bandpass)** | $-2.3\%$ | $+10.7\%$ | $-1.5\%$ | $+0.0160$ | **$-0.0168$** | **$+15.3\%$** | $-10.7\%$ | $+0.3\%$ |
| **C5 (Noise)** | $-0.3\%$ | $-17.3\%$ | $+0.0\%$ | $-0.0473$ | **$-0.0753$** | **$-16.7\%$** | $+17.3\%$ | $+5.3\%$ |

> [!CRITICAL]
> **Diagnostic Finding on SYS5**:
> 1. On C4, FPR actually **worsens** by $+15.3$ percentage points ($77.3\% \to 92.7\%$), falsely classifying almost all bona fide telephone speech as deepfakes.
> 2. On C5, ROC-AUC drops from $0.5544$ down to **$0.4791$** (worse than random guessing).
> 3. On C0, clean FPR worsens from $12.7\%$ to $20.0\%$ ($+7.3$ pp), degrading baseline clean reliability.

---

### 7.3 SYS6: Logistic Fusion ($\sigma(w_1 S_{\text{CNN}} + w_2 S_{\text{DSP}} + b)$)
*Evaluates non-linear logistic calibration trained on clean validation data:*

| Condition | $\Delta$ Acc | $\Delta$ Recall | $\Delta$ Precision | $\Delta$ F1 | $\Delta$ ROC-AUC | $\Delta$ FPR | $\Delta$ FNR | $\Delta$ EER |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C0 (Clean)** | $-10.0\%$ | **$-30.7\%$** | $+10.1\%$ | **$-0.1923$** | $-0.0366$ | $-10.7\%$ | $+30.7\%$ | $+2.7\%$ |
| **C1 (8 kHz)** | $-1.7\%$ | $-11.3\%$ | $+0.6\%$ | $-0.0441$ | $-0.0161$ | $-8.0\%$ | $+11.3\%$ | $+0.7\%$ |
| **C2 ($\mu$-law)** | $-1.7\%$ | $-9.3\%$ | $+1.4\%$ | $-0.0384$ | $-0.0105$ | $-6.0\%$ | $+9.3\%$ | $+1.0\%$ |
| **C3 (A-law)** | $-2.3\%$ | $-10.0\%$ | $+0.4\%$ | $-0.0440$ | $-0.0113$ | $-5.3\%$ | $+10.0\%$ | $+0.3\%$ |
| **C4 (Bandpass)** | $+0.0\%$ | $-8.0\%$ | $+0.2\%$ | $-0.0233$ | $-0.0195$ | $-8.0\%$ | $+8.0\%$ | $+1.0\%$ |
| **C5 (Noise)** | $-6.0\%$ | **$-90.0\%$** | $-21.1\%$ | **$-0.5667$** | **$-0.0857$** | **$-78.0\%$** | $+90.0\%$ | $+5.3\%$ |

> [!CRITICAL]
> **Diagnostic Finding on SYS6**:
> 1. Logistic calibration induces catastrophic sensitivity collapse: on C5, Recall drops to **$6.0\%$** ($\text{FNR} = 94.0\%$, F1 collapses from $0.6667$ to $0.1000$).
> 2. On C0, clean Recall collapses from $75.3\%$ to **$44.7\%$** ($\text{FNR} = 55.3\%$). Over half of clean deepfakes go undetected.
> 3. ROC-AUC is universally degraded across all 6 conditions.

---

## 8. Detailed C4 & C5 Analysis

### 8.1 The C4 (Telephone Bandpass) Problem
- **Acoustic Mechanism**: Bandpass filtering strictly suppresses energy below $300\text{ Hz}$ and above $3400\text{ Hz}$.
- **Effect on DSP Features**: High-Frequency Energy Ratio ($\mathcal{R}_{\text{HF}}$) drops to zero for both bona fide and spoof speech. Because the calibrated DSP model associates low $\mathcal{R}_{\text{HF}}$ with synthesis, every telephone audio file receives a high spoof score ($S_{\text{DSP}} \approx 0.80$).
- **Fusion Consequence**: Fusing this corrupted feature directly increases false alarms (SYS5 C4 FPR: $92.7\%$) or, if inverted, indiscriminately suppresses scores and blinds the detector to real attacks (SYS4 C4 Recall: $58.7\%$).

### 8.2 The C5 (Additive Noise) Problem
- **Acoustic Mechanism**: Adding white Gaussian noise at $15\text{ dB SNR}$ raises the spectral floor across all frequencies.
- **Effect on DSP Features**: Spectral Flatness ($\mathcal{F}$) increases significantly ($>0.60$). In SYS3, this triggers extreme miscalibration where noise overrides speech dynamics, driving the calibrated DSP model's ROC-AUC down to **$0.2752$**.
- **Fusion Consequence**: Adding noise corrupts the DSP features far more severely than it corrupts the log-mel/LFCC spectrograms of the CNN. Consequently, fusing DSP features degrades the CNN's discriminative ability, driving fused ROC-AUC down to $0.4791$ (SYS5) and $0.4687$ (SYS6).

---

## 9. Latency Impact

Mean inference and scoring latency was measured over $1{,}800$ trials on CPU ($10$ threads, Windows 11):

| System | Preprocessing & Feature Extraction | Model Forward Pass / Scoring | Total Latency | Latency Penalty vs Baseline |
| :--- | :---: | :---: | :---: | :---: |
| **SYS1_CNN_ONLY** | Spectrogram Extractor ($2\text{ ch}$) | MiniAcousticCNN forward | **$7.90\text{ ms}$** | Baseline ($1.00\times$) |
| **SYS2_DSP_PROD_ONLY** | FFT & Statistical Moments | Rule matching | **$5.76\text{ ms}$** | $-27.1\%$ |
| **SYS3_DSP_CAL_ONLY** | FFT, Flatness, RMS, Flux | Logistic dot product | **$5.76\text{ ms}$** | $-27.1\%$ |
| **SYS4_LINEAR_PROD_FUSE** | Spectrogram + DSP FFT | CNN + DSP + Linear sum | **$15.77\text{ ms}$** | **$+99.6\%$ ($1.99\times$)** |
| **SYS5_LINEAR_CAL_FUSE** | Spectrogram + DSP FFT | CNN + Calibrated DSP + Sum | **$15.77\text{ ms}$** | **$+99.6\%$ ($1.99\times$)** |
| **SYS6_LOGISTIC_FUSE** | Spectrogram + DSP FFT | CNN + Calibrated DSP + Sigmoid | **$15.77\text{ ms}$** | **$+99.6\%$ ($1.99\times$)** |

**Latency Finding**: Fusing DSP features doubles the inference latency from $\approx 7.9\text{ ms}$ to $\approx 15.8\text{ ms}$ because two independent feature pipelines (multi-channel STFT/LFCC and temporal statistical moment extraction) must execute on every audio window.

---

## 10. Scientific Conclusion & Integration Recommendation

```
===================================================================================================
                                      SCIENTIFIC CONCLUSION
===================================================================================================
1. HYPOTHESIS FALSIFIED:
   The hypothesis that deterministic DSP/acoustic features can be fused with the frozen CNN
   classifier to resolve C4/C5 false alarms without degrading clean/degraded performance is
   CONVENTUS NON EST (Empirically Falsified).

2. DISCRIMINATION FAILURE:
   In no condition did score fusion yield a balanced, statistically significant improvement
   in ROC-AUC or EER. Under C5 noise, fusion actively destroyed classifier discrimination
   (AUC dropped below 0.50).

3. THRESHOLD ARTIFACT:
   Observed FPR reductions in linear fusion were solely the result of artificial downward score
   compression, which simultaneously caused unacceptable 18-34 percentage point recall collapses.

4. PRODUCTION INTEGRATION DECISION:
   Integration is EXPLICITLY NOT SUPPORTED.
   The protected production model `robust_mini_acoustic_cnn_v1` must remain standalone.
   No production code, thresholds, or checkpoints should be modified to incorporate DSP fusion.
===================================================================================================
```

---

## 11. Reproducibility & Environment Details

- **Python Version**: `3.13.7`
- **PyTorch**: `2.14.0+cpu`
- **Torchaudio**: `2.11.0+cpu`
- **Scipy**: `1.18.1` | **NumPy**: `2.5.2` | **SoundFile**: `0.14.0`
- **Host OS**: `Windows 11 (10.0.26200-SP0)`
- **Evaluation Script**: `run_exp_2d_fuse.py` (executed via `.venv-neural`)
- **Execution Log**: `exp_2d_run.log`
- **Results Artifact**: `exp_2d_results.json`
- **Integrity Re-Verification**:
  - Checkpoint SHA-256: `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
  - Git Branch: `feature/bhavya-premium-ai`
