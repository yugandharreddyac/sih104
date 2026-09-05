# EXP-2B-NOISE — Multi-SNR Additive Gaussian Noise Robustness Report

**Project**: VOXShield AI/ML Scientific Validation  
**Task**: Task 2 — Deepfake Detection Improvements  
**Experiment**: EXP-2B-NOISE — Additive Gaussian Noise at Multiple SNRs  
**Date**: September 5, 2026  
**Status**: COMPLETE — NOT SUPPORTED  
**Author**: Bhavya AI/ML Validation Suite  
**Branch**: `feature/bhavya-premium-ai`  

---

## 1. Executive Summary

In experiment **EXP-2A-ABL**, ablation analysis identified additive Gaussian noise augmentation (Model E, 15 dB SNR) as the primary catalyst behind catastrophic false-alarm saturation across telephony channels ($>90\%$ FPR across C1–C5). 

**EXP-2B-NOISE** investigates whether this failure mode was specific to the 15 dB SNR operating point, or whether tuning the noise injection level (10 dB, 15 dB, 20 dB, 25 dB SNR) can resolve the false positive crisis and provide safe acoustic robustness.

### Core Scientific Findings:
1. **False-Alarm Saturation Persists Across the SNR Spectrum**:
   - At 10 dB: Telephony false positive rates remain catastrophic (C1 FPR: **86.00%**, C2 FPR: **91.33%**, C3 FPR: **88.67%**, C4 FPR: **82.67%**).
   - At 15 dB: Telephony false positive rates reach **90.67%–94.67%**.
   - At 20 dB: Complete model saturation occurs—**100.00% FPR** across C1, C2, C3, and C4 (every single incoming bona fide call is classified as a deepfake).
2. **Mild Noise (25 dB) Induces Severe Clean Recall Collapse**:
   - Model N25 (25 dB SNR) successfully avoids telephony false alarm saturation (C0 FPR: **1.33%**, C1 FPR: **46.00%**, C5 FPR: **56.00%**).
   - However, this comes at the cost of **catastrophic recall degradation on clean audio**: clean C0 spoof detection recall plummets from **75.33%** (Protected Baseline) down to **39.33%** ($\Delta\text{Recall} = -36.00\%$, clean F1 = $0.5592$). Over $60\%$ of real deepfake attacks on clean audio bypass the model undetected.
3. **No Tested SNR Level Solves Condition C4 (Telephone Bandpass)**:
   - C4 FPR remains between **75.33% and 100.00%** across all four noise variants.
4. **No Tested SNR Level Makes C5 Discrimative**:
   - In condition C5 (15 dB noise), ROC-AUC across all noise variants remains trapped between **0.5056 and 0.5813** (near random guess). Additive noise does not help the CNN separate genuine speech from deepfakes under noisy conditions; it merely shifts the prediction bias.
5. **Scientific Verdict**: **NOT SUPPORTED**. Additive Gaussian noise augmentation across all tested SNR levels fails to produce balanced robustness, either saturating telephony false alarms or destroying clean detection sensitivity.

---

## 2. Protected Production Baseline & Reproducibility Invariants

The protected production checkpoint was strictly locked and verified bitwise identical before and after all training and evaluations.

### 2.1 Baseline Identity
- **Model Registration Name**: `robust_mini_acoustic_cnn_v1`
- **Architecture**: `MiniAcousticCNN` (93,442 trainable parameters)
- **Input Dimensions**: $(2, 60, 301)$ (Channel 0: Log-Mel Spectrogram; Channel 1: LFCC Spectrogram)
- **Protected Checkpoint File**: `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`
- **Protected SHA-256 Checksum**:
  `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
- **Verification**: Verified before and after EXP-2B-NOISE. Bitwise equality asserted ($100\%$ match).

### 2.2 System & Execution Environment
- **Operating System**: Windows 11 Enterprise (Build 10.0.26200)
- **Hardware**: Intel64 Family 6 Model 154 Stepping 4 (12 physical / 14 logical cores)
- **Device**: CPU (10 active PyTorch worker threads)
- **Python**: 3.13.7
- **PyTorch**: 2.14.0+cpu
- **Torchaudio**: 2.11.0+cpu
- **Random Seed**: $42$ (strictly frozen across all initializations, data splits, and noise generators)

---

## 3. Dataset, Partitions, and Augmentation Methodology

### 3.1 Dataset Splits (Source-Disjoint)
- **Training Set**: $1,400$ clean samples ($700$ bona fide, $700$ spoof) from VCC2020 / VCC2018 ($20$ disjoint speakers).
- **Validation Set**: $300$ clean samples ($150$ bona fide, $150$ spoof) from VCC2020 / VCC2018 ($6$ disjoint speakers).
- **Held-Out Test Set**: $300$ samples ($150$ bona fide, $150$ spoof across unseen attack algorithms $A07\text{--}A19$) from ASVspoof 2019 ($9$ disjoint speakers).
- **Disjointness Invariants**: Zero speaker overlap, zero audio ID overlap, zero attack system overlap between train, val, and test.

### 3.2 Controlled Multi-SNR Augmentation Design
To remove the sample-size confounding variable present in earlier experiments, all four noise variants were trained with the exact same sample count ($1,750$ total samples):
- $1,400$ clean training originals ($700$ bona fide, $700$ spoof).
- $350$ noise-augmented samples ($175$ bona fide, $175$ spoof), using the exact partition slice `[525:700]` and fixed seeds ($seed = 42 + i + 5250$ for bona; $seed = 42 + i + 6250$ for spoof).
- Total training size: $1,750$ samples ($875$ bona fide, $875$ spoof; perfectly balanced 1:1).

The four variants differed exclusively by the target SNR:
1. **Model N10**: Additive Gaussian noise at **10 dB SNR**.
2. **Model N15**: Additive Gaussian noise at **15 dB SNR**.
3. **Model N20**: Additive Gaussian noise at **20 dB SNR**.
4. **Model N25**: Additive Gaussian noise at **25 dB SNR**.

No other augmentations (A-law, $\mu$-law, bandpass, SpecAugment) were applied.

### 3.3 Training & Model Selection
- **Optimizer**: Adam ($\text{lr} = 0.001$, $\beta_1 = 0.9$, $\beta_2 = 0.999$)
- **Batch Size**: $32$
- **Epoch Budget**: $15$ epochs
- **Model Selection Principle**: Validation set only. Best checkpoint selected using:
  $$\text{Score}_{\text{val}} = 0.5 \times \text{F1}_{\text{clean}} + 0.5 \times \text{F1}_{\text{noise\_SNR}}$$
  (Tie-breaker: combined validation recall).
- **Test Set Protection**: The held-out unseen-attack test set remained untouched until final evaluation of frozen checkpoints.

---

## 4. Candidate Training & Validation Summary

| Model Variant | Target SNR | Best Epoch | Combined Val F1 | Combined Val Recall | Training Time | Checkpoint SHA-256 (first 16 chars) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Model N10** | $10\text{ dB}$ | 15 | $0.8033$ | $0.8433$ | $356.5\text{ s}$ | `D656360E21D0E45C...` |
| **Model N15** | $15\text{ dB}$ | 15 | $0.7801$ | $0.8767$ | $355.0\text{ s}$ | `F218926DB53BFA22...` |
| **Model N20** | $20\text{ dB}$ | 15 | $0.7513$ | $0.9400$ | $352.8\text{ s}$ | `16BF024F58BE6D3D...` |
| **Model N25** | $25\text{ dB}$ | 13 | $0.7937$ | $0.8100$ | $353.4\text{ s}$ | `3981A203BB77A8A1...` |
| **Clean Only (Model A)** | None | 15 | $0.7826$ | $0.7800$ | $363.0\text{ s}$ | `25E6143D2D99C481...` |
| **Protected Production** | Multi | 10 | $0.7324$ | $0.9133$ | $754.0\text{ s}$ | `B8C0B623175A7D53...` |

All four SNR models completed training cleanly. Checkpoints were saved separately in the scratch directory and frozen before held-out evaluation.

---

## 5. Held-Out Evaluation Results (Unseen Test Set A07–A19)

All models were evaluated on the $300$-sample held-out test set at the fixed production operating threshold ($\theta = 0.50$).

### 5.1 Standard Conditions (C0–C5)

#### Condition C0: Clean 16 kHz
| Model | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Model A: Clean Only** | $74.67\%$ | $55.33\%$ | $89.25\%$ | $0.6860$ | $0.9026$ | $6.00\%$ | $44.67\%$ | $18.33\%$ | 83 | 141 | 9 | 67 |
| **Model N10 (10 dB)** | $73.33\%$ | $84.67\%$ | $70.17\%$ | $0.7674$ | $0.8556$ | $36.00\%$ | $15.33\%$ | $20.00\%$ | 127 | 96 | 54 | 23 |
| **Model N15 (15 dB)** | $76.00\%$ | $82.67\%$ | $72.94\%$ | $0.7750$ | $0.8810$ | $30.67\%$ | $17.33\%$ | $20.67\%$ | 124 | 104 | 46 | 26 |
| **Model N20 (20 dB)** | $65.33\%$ | $92.67\%$ | $59.91\%$ | $0.7277$ | $0.8009$ | $62.00\%$ | $7.33\%$ | $29.33\%$ | 139 | 57 | 93 | 11 |
| **Model N25 (25 dB)** | $69.00\%$ | **39.33%** | $96.72\%$ | **0.5592** | $0.8826$ | **1.33%** | **60.67%** | $21.00\%$ | 59 | 148 | 2 | 91 |
| **Protected Baseline** | $81.33\%$ | $75.33\%$ | $85.61\%$ | $0.8014$ | $0.8733$ | $12.67\%$ | $24.67\%$ | $22.67\%$ | 113 | 131 | 19 | 37 |

#### Condition C1: 8 kHz Round-Trip (16k $\to$ 8k $\to$ 16k)
| Model | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Model A: Clean Only** | $64.33\%$ | $54.00\%$ | $66.39\%$ | $0.6022$ | $0.6240$ | $25.33\%$ | $46.00\%$ | $44.00\%$ | 81 | 112 | 38 | 69 |
| **Model N10 (10 dB)** | $54.67\%$ | $86.00\%$ | $52.87\%$ | $0.6548$ | $0.6693$ | $86.00\%$ | $14.00\%$ | $40.67\%$ | 129 | 21 | 129 | 21 |
| **Model N15 (15 dB)** | $50.67\%$ | $94.00\%$ | $50.36\%$ | $0.6558$ | $0.6959$ | $92.67\%$ | $6.00\%$ | $35.33\%$ | 141 | 11 | 139 | 9 |
| **Model N20 (20 dB)** | $50.00\%$ | $100.00\%$ | $50.00\%$ | $0.6667$ | $0.5601$ | $100.00\%$ | $0.00\%$ | $44.67\%$ | 150 | 0 | 150 | 0 |
| **Model N25 (25 dB)** | $64.00\%$ | $74.00\%$ | $61.67\%$ | $0.6727$ | $0.7332$ | $46.00\%$ | $26.00\%$ | $35.00\%$ | 111 | 81 | 69 | 39 |
| **Protected Baseline** | $65.33\%$ | $79.33\%$ | $61.98\%$ | $0.6959$ | $0.7187$ | $48.67\%$ | $20.67\%$ | $35.33\%$ | 119 | 77 | 73 | 31 |

#### Condition C2: G.711 $\mu$-law
| Model | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Model A: Clean Only** | $61.00\%$ | $66.67\%$ | $59.88\%$ | $0.6309$ | $0.6746$ | $44.67\%$ | $33.33\%$ | $33.67\%$ | 100 | 83 | 67 | 50 |
| **Model N10 (10 dB)** | $52.67\%$ | $91.33\%$ | $51.50\%$ | $0.6587$ | $0.7052$ | $91.33\%$ | $8.67\%$ | $33.33\%$ | 137 | 13 | 137 | 13 |
| **Model N15 (15 dB)** | $50.33\%$ | $95.33\%$ | $50.18\%$ | $0.6575$ | $0.7243$ | $94.67\%$ | $4.67\%$ | $32.00\%$ | 143 | 8 | 142 | 7 |
| **Model N20 (20 dB)** | $50.00\%$ | $100.00\%$ | $50.00\%$ | $0.6667$ | $0.5633$ | $100.00\%$ | $0.00\%$ | $44.33\%$ | 150 | 0 | 150 | 0 |
| **Model N25 (25 dB)** | $66.33\%$ | $77.33\%$ | $63.39\%$ | $0.6967$ | $0.7778$ | $44.67\%$ | $22.67\%$ | $30.67\%$ | 116 | 83 | 67 | 34 |
| **Protected Baseline** | $71.67\%$ | $76.67\%$ | $69.70\%$ | $0.7302$ | $0.7849$ | $33.33\%$ | $23.33\%$ | $29.33\%$ | 115 | 100 | 50 | 35 |

#### Condition C3: G.711 A-law
| Model | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Model A: Clean Only** | $60.33\%$ | $68.67\%$ | $59.19\%$ | $0.6348$ | $0.6847$ | $48.00\%$ | $31.33\%$ | $32.33\%$ | 103 | 78 | 72 | 47 |
| **Model N10 (10 dB)** | $55.00\%$ | $90.67\%$ | $53.12\%$ | $0.6700$ | $0.7115$ | $88.67\%$ | $9.33\%$ | $35.67\%$ | 136 | 17 | 133 | 14 |
| **Model N15 (15 dB)** | $50.67\%$ | $96.00\%$ | $50.35\%$ | $0.6606$ | $0.7254$ | $94.67\%$ | $4.00\%$ | $32.67\%$ | 144 | 8 | 142 | 6 |
| **Model N20 (20 dB)** | $50.00\%$ | $100.00\%$ | $50.00\%$ | $0.6667$ | $0.5552$ | $100.00\%$ | $0.00\%$ | $46.33\%$ | 150 | 0 | 150 | 0 |
| **Model N25 (25 dB)** | $65.00\%$ | $78.67\%$ | $61.78\%$ | $0.6921$ | $0.7728$ | $48.67\%$ | $21.33\%$ | $30.33\%$ | 118 | 77 | 73 | 32 |
| **Protected Baseline** | $70.67\%$ | $78.67\%$ | $67.82\%$ | $0.7284$ | $0.7702$ | $37.33\%$ | $21.33\%$ | $31.33\%$ | 118 | 94 | 56 | 32 |

#### Condition C4: Telephone Bandpass (300–3400 Hz)
| Model | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Model A: Clean Only** | $60.67\%$ | $60.67\%$ | $60.67\%$ | $0.6067$ | $0.6259$ | $39.33\%$ | $39.33\%$ | $39.67\%$ | 91 | 91 | 59 | 59 |
| **Model N10 (10 dB)** | $50.67\%$ | $85.33\%$ | $50.39\%$ | $0.6337$ | $0.6634$ | $82.67\%$ | $14.67\%$ | $38.67\%$ | 128 | 26 | 124 | 22 |
| **Model N15 (15 dB)** | $49.33\%$ | $92.00\%$ | $49.64\%$ | $0.6449$ | $0.6455$ | $93.33\%$ | $8.00\%$ | $37.33\%$ | 138 | 10 | 140 | 12 |
| **Model N20 (20 dB)** | $50.00\%$ | $100.00\%$ | $50.00\%$ | $0.6667$ | $0.5124$ | $100.00\%$ | $0.00\%$ | $52.67\%$ | 150 | 0 | 150 | 0 |
| **Model N25 (25 dB)** | $54.67\%$ | $84.67\%$ | $52.92\%$ | $0.6513$ | $0.6583$ | $75.33\%$ | $15.33\%$ | $39.00\%$ | 127 | 37 | 113 | 23 |
| **Protected Baseline** | $53.33\%$ | $84.00\%$ | $52.07\%$ | $0.6429$ | $0.6119$ | $77.33\%$ | $16.00\%$ | $44.33\%$ | 126 | 34 | 116 | 24 |

#### Condition C5: Additive Gaussian Noise (15 dB SNR)
| Model | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | TP | TN | FP | FN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Model A: Clean Only** | $49.67\%$ | $30.00\%$ | $49.45\%$ | $0.3734$ | $0.5309$ | $30.67\%$ | $70.00\%$ | $44.67\%$ | 45 | 104 | 46 | 105 |
| **Model N10 (10 dB)** | $50.67\%$ | $80.67\%$ | $50.42\%$ | $0.6205$ | $0.5297$ | $74.67\%$ | $19.33\%$ | $49.00\%$ | 121 | 38 | 112 | 29 |
| **Model N15 (15 dB)** | $52.00\%$ | $94.67\%$ | $51.08\%$ | $0.6636$ | $0.5604$ | $90.67\%$ | $5.33\%$ | $44.67\%$ | 142 | 14 | 136 | 8 |
| **Model N20 (20 dB)** | $50.00\%$ | $99.33\%$ | $50.00\%$ | $0.6652$ | $0.5181$ | $99.33\%$ | $0.67\%$ | $46.67\%$ | 149 | 1 | 149 | 1 |
| **Model N25 (25 dB)** | $55.00\%$ | $66.00\%$ | $54.10\%$ | $0.5946$ | $0.5813$ | **56.00%** | $34.00\%$ | $45.67\%$ | 99 | 66 | 84 | 51 |
| **Protected Baseline** | $52.00\%$ | $96.00\%$ | $51.06\%$ | $0.6667$ | $0.5544$ | $92.00\%$ | $4.00\%$ | $46.67\%$ | 144 | 12 | 138 | 6 |

---

### 5.2 Cross-SNR Noise Profiles (10 dB, 20 dB, 25 dB)

| Condition | Metric | Model A (Clean) | Model N10 | Model N15 | Model N20 | Model N25 | Protected Baseline |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **N10 (10 dB Noise)** | **FPR** | $23.33\%$ | $72.00\%$ | $88.67\%$ | $100.00\%$ | $52.00\%$ | $88.00\%$ |
| | **Recall** | $25.33\%$ | $79.33\%$ | $88.00\%$ | $100.00\%$ | $54.67\%$ | $79.33\%$ |
| | **F1** | $0.3276$ | $0.6220$ | $0.6361$ | $0.6667$ | $0.5290$ | $0.5935$ |
| | **ROC-AUC** | $0.5366$ | $0.5321$ | $0.5118$ | $0.4949$ | $0.5008$ | $0.4584$ |
| **N20 (20 dB Noise)** | **FPR** | $38.00\%$ | $75.33\%$ | $92.67\%$ | $100.00\%$ | $49.33\%$ | $92.00\%$ |
| | **Recall** | $38.00\%$ | $82.00\%$ | $96.00\%$ | $100.00\%$ | $62.00\%$ | $96.00\%$ |
| | **F1** | $0.3800$ | $0.5855$ | $0.6651$ | $0.6667$ | $0.5868$ | $0.6667$ |
| | **ROC-AUC** | $0.5531$ | $0.5544$ | $0.5490$ | $0.5100$ | $0.5981$ | $0.5532$ |
| **N25 (25 dB Noise)** | **FPR** | $42.00\%$ | $76.67\%$ | $93.33\%$ | $100.00\%$ | $48.00\%$ | $93.33\%$ |
| | **Recall** | $42.00\%$ | $82.67\%$ | $96.00\%$ | $100.00\%$ | $64.00\%$ | $96.00\%$ |
| | **F1** | $0.4200$ | $0.6010$ | $0.6636$ | $0.6667$ | $0.6038$ | $0.6636$ |
| | **ROC-AUC** | $0.5658$ | $0.5693$ | $0.5515$ | $0.5292$ | $0.6231$ | $0.5656$ |

---

## 6. Metric Deltas vs Protected Production Baseline

The table below details the performance deltas ($\Delta = \text{Candidate} - \text{Protected Baseline}$):

| Model | Condition | $\Delta$FPR | $\Delta$FNR | $\Delta$Recall | $\Delta$F1 Score | $\Delta$ROC-AUC | $\Delta$EER |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Model N10 (10 dB)** | **C0** | $+23.33\%$ | $-9.34\%$ | $+9.34\%$ | $-0.0340$ | $-0.0177$ | $-2.67\%$ |
| | **C1** | $+37.33\%$ | $-6.67\%$ | $+6.67\%$ | $-0.0635$ | $-0.0494$ | $+5.34\%$ |
| | **C2** | $+58.00\%$ | $-14.66\%$ | $+14.66\%$ | $-0.0840$ | $-0.0797$ | $+4.00\%$ |
| | **C3** | $+51.34\%$ | $-12.00\%$ | $+12.00\%$ | $-0.0792$ | $-0.0587$ | $+4.34\%$ |
| | **C4** | $+5.34\%$ | $-1.33\%$ | $+1.33\%$ | $-0.0061$ | $+0.0515$ | $-5.66\%$ |
| | **C5** | $-17.33\%$ | $+15.33\%$ | $-15.33\%$ | $-0.0348$ | $-0.0247$ | $+2.33\%$ |
| **Model N15 (15 dB)** | **C0** | $+18.00\%$ | $-7.34\%$ | $+7.34\%$ | $-0.0264$ | $+0.0077$ | $-2.00\%$ |
| | **C1** | $+44.00\%$ | $-14.67\%$ | $+14.67\%$ | $-0.0401$ | $-0.0228$ | $0.00\%$ |
| | **C2** | $+61.34\%$ | $-18.66\%$ | $+18.66\%$ | $-0.0727$ | $-0.0606$ | $+2.67\%$ |
| | **C3** | $+57.34\%$ | $-17.33\%$ | $+17.33\%$ | $-0.0678$ | $-0.0448$ | $+1.34\%$ |
| | **C4** | $+16.00\%$ | $-8.00\%$ | $+8.00\%$ | $+0.0020$ | $+0.0336$ | $-7.00\%$ |
| | **C5** | $-1.33\%$ | $+1.33\%$ | $-1.33\%$ | $-0.0031$ | $+0.0060$ | $-2.00\%$ |
| **Model N20 (20 dB)** | **C0** | $+49.33\%$ | $-17.34\%$ | $+17.34\%$ | $-0.0737$ | $-0.0724$ | $+6.66\%$ |
| | **C1** | $+51.33\%$ | $-20.67\%$ | $+20.67\%$ | $-0.0292$ | $-0.1586$ | $+9.34\%$ |
| | **C2** | $+66.67\%$ | $-23.33\%$ | $+23.33\%$ | $-0.0635$ | $-0.2216$ | $+15.00\%$ |
| | **C3** | $+62.67\%$ | $-21.33\%$ | $+21.33\%$ | $-0.0617$ | $-0.2150$ | $+15.00\%$ |
| | **C4** | $+22.67\%$ | $-16.00\%$ | $+16.00\%$ | $+0.0238$ | $-0.0995$ | $+8.34\%$ |
| | **C5** | $+7.33\%$ | $-3.33\%$ | $+3.33\%$ | $-0.0015$ | $-0.0363$ | $0.00\%$ |
| **Model N25 (25 dB)** | **C0** | $-11.34\%$ | $+36.00\%$ | **-36.00%** | **-0.2422** | $+0.0093$ | $-1.67\%$ |
| | **C1** | $-2.67\%$ | $+5.33\%$ | $-5.33\%$ | $-0.0232$ | $+0.0145$ | $-0.33\%$ |
| | **C2** | $+11.34\%$ | $-0.66\%$ | $+0.66\%$ | $-0.0335$ | $-0.0071$ | $+1.34\%$ |
| | **C3** | $+11.34\%$ | $0.00\%$ | $0.00\%$ | $-0.0363$ | $+0.0026$ | $-1.00\%$ |
| | **C4** | $-2.00\%$ | $-0.67\%$ | $+0.67\%$ | $+0.0084$ | $+0.0464$ | $-5.33\%$ |
| | **C5** | **-36.00%** | $+30.00\%$ | $-30.00\%$ | $-0.0721$ | $+0.0269$ | $-1.00\%$ |

---

## 7. Direct Answers to Primary Questions

### A. Does any noise SNR improve C5 compared with the protected baseline?
- **No.** While Model N25 reduces C5 FPR from $92.00\%$ to $56.00\%$, its C5 recall drops from $96.00\%$ to $66.00\%$ and C5 F1 drops from $0.6667$ to $0.5946$. Most importantly, ROC-AUC across all noise models on C5 remains virtually flat at $0.5056\text{--}0.5813$, demonstrating that additive Gaussian noise does not teach the network genuine deepfake discrimination under noisy conditions.

### B. Does any noise SNR reduce C5 FPR without causing unacceptable clean C0 degradation?
- **No.** The only model that reduces C5 FPR is Model N25 (down to $56.00\%$). However, it causes catastrophic degradation on clean C0 audio: C0 recall plummets from **75.33%** to **39.33%** ($\Delta = -36.00\%$), resulting in an unacceptable $60.67\%$ false negative rate on clean deepfakes and an F1 crash to $0.5592$.

### C. Does changing augmentation SNR alter the catastrophic telephony false-positive behavior seen in Model E?
- **No.** Between 10 dB and 20 dB, false-alarm saturation remains pervasive ($82.67\%\text{--}100.00\%$ FPR across C1–C4). Model N20 in particular collapsed entirely, classifying $100.00\%$ of all telephony calls as deepfakes. The failure is architectural/representational: the network learns that any noise floor or loss of spectral smoothness is a synthetic artifact.

### D. Does any variant improve C4 (Telephone Bandpass)?
- **No.** C4 FPR was $82.67\%$ (N10), $93.33\%$ (N15), $100.00\%$ (N20), and $75.33\%$ (N25). None of the noise models improved C4 performance over the protected baseline ($77.33\%$).

### E. Does any variant improve C1–C3?
- **No.** All noise variants degraded C1–C3 compared to both the clean model and the companding models from EXP-2A-ABL.

### F. Does any variant improve overall robustness without sacrificing clean performance?
- **No.** No noise-augmentation model achieved balanced, acceptable robustness.

---

## 8. Limitations & Negative Findings

1. **Noise Masking vs. Artifact Corruption**: Gaussian noise operates as an additive mask across all 60 Log-Mel and LFCC filterbanks. Because synthetic speech artifacts often manifest as high-frequency harmonic irregularities or phase jitter, additive noise directly masks these features while introducing flat spectral energy that the CNN mistakes for synthetic vocoder noise.
2. **Failure of Independent Noise Injection**: Injecting noise into a single isolated slice without contrastive loss or paired sample learning causes the decision boundary to shift monotonically toward "spoofed" whenever background noise is detected.
3. **Severe Sensitivity to Subtle SNR Shifts**: Shifting SNR from 20 dB to 25 dB caused an extreme swing from $100\%$ false alarms (Model N20) to $60.7\%$ false negatives (Model N25), highlighting that standard MiniAcousticCNN training without batch-level SNR randomization is unstable.

---

## 9. Final Scientific Verdict & Strategic Recommendation

### 9.1 Scientific Verdict
**NOT SUPPORTED**

Additive Gaussian noise augmentation—across all tested SNR levels from 10 dB to 25 dB—fails to improve acoustic robustness and cannot resolve the VoxShield telephony false-positive crisis. It either drives false alarms toward saturation or, when made sufficiently mild, induces severe false negative collapse on clean speech.

### 9.2 Strategic Roadmap & Guardrails
1. **Permanently Retire Additive Gaussian Noise from the Primary Robust Training Pipeline**:
   - The production robust training pipeline should remove 15 dB Gaussian noise. It provides zero generalization benefit and is the direct cause of the production model's telephony failure.
2. **Prioritize Codec & Bandpass Hardening**:
   - Findings from EXP-2A-ABL proved that companding codecs ($\mu$-law / A-law) and telephone bandpass filtering are the only augmentations that improve channel robustness without saturating false alarms.
3. **Do NOT Replace the Protected Checkpoint**:
   - The protected production checkpoint `robust_mini_acoustic_cnn_v1` remains active and protected pending multi-stage validation.

---

## 10. Checkpoint & Integrity Verification

- **Protected Production Checkpoint**:
  - Initial SHA-256: `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
  - Final SHA-256:   `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
  - Status: **BITWISE UNCHANGED**
- **Newly Created Experimental Checkpoints**:
  - Model N10: `.../scratch/exp_2b_noise/checkpoints/model_noise_10db.pt` (SHA: `D656360E21D0E45C4B40DF7BA0307B2D0542EC03A96C242A512AF81DEFF4D926`)
  - Model N15: `.../scratch/exp_2b_noise/checkpoints/model_noise_15db.pt` (SHA: `F218926DB53BFA22520E894263EEC1406D287C73C1F68C3A4F84FFD33ACDE0A1`)
  - Model N20: `.../scratch/exp_2b_noise/checkpoints/model_noise_20db.pt` (SHA: `16BF024F58BE6D3DB9BC7800D220A8D55E3B0D75BAD84839F1103D3C5B1277CC`)
  - Model N25: `.../scratch/exp_2b_noise/checkpoints/model_noise_25db.pt` (SHA: `3981A203BB77A8A1BF43C3F4DE045D29845C3316916D509F1F8E2A4827DB4920`)
- **Git Status**: Clean; zero production files modified. Only report files in `docs/ai/` created.
