# VOXSHIELD Phase 2C.2 — Validation-Only Robust CNN Threshold Calibration Report

## 1. Methodology & Integrity Constraints

- **Model:** Frozen Robust MiniAcousticCNN (`best_robust_mini_acoustic_cnn.pt`, Epoch 10, 93,442 params).
- **Dataset:** Evaluated ONLY on the 300 validation samples from `source_disjoint_train_val_manifest.parquet` (6 disjoint speakers, 150 bona-fide, 150 spoof).
- **Unseen Test Isolation:** The held-out A07–A19 test set was **NOT accessed**.
- **Sweep:** Threshold range $[0.01, 0.99]$ with step $0.005$ (197 operating points per condition).

## 2. Per-Condition Threshold Sweep Results

| Condition | AUC | EER | EER θ | FPR<=5% θ | Achieved FPR | Achieved Rec | FPR<=10% θ | Achieved FPR | Achieved Rec | F1-max θ | Max F1 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C0: Clean 16 kHz** | 0.8684 | 0.2000 | 0.7280 | 0.8300 | 4.7% | 53.3% | 0.7950 | 10.0% | 63.3% | 0.6850 | 0.8088 |
| **C1: 8 kHz Round Trip** | 0.6881 | 0.3633 | 0.6541 | 0.8100 | 4.7% | 14.0% | 0.7550 | 10.0% | 27.3% | 0.4550 | 0.7018 |
| **C2: G.711 mu-law (PCMU)** | 0.7523 | 0.3233 | 0.6217 | 0.7700 | 4.7% | 22.7% | 0.7350 | 10.0% | 35.3% | 0.5900 | 0.7335 |
| **C3: G.711 A-law (PCMA)** | 0.7452 | 0.3333 | 0.6241 | 0.7700 | 4.7% | 19.3% | 0.7450 | 10.0% | 28.0% | 0.5350 | 0.7294 |
| **C4: Telephone Bandpass (300-3400 Hz)** | 0.7730 | 0.3267 | 0.7580 | 0.8650 | 4.7% | 46.7% | 0.8450 | 10.0% | 55.3% | 0.7100 | 0.7032 |
| **C5: Additive Noise (15 dB SNR)** | 0.5554 | 0.4733 | 0.7198 | 0.8850 | 2.7% | 8.7% | 0.8450 | 10.0% | 16.7% | 0.3850 | 0.6742 |

## 3. Policy D: Dual-Mode Calibration Analysis

Telephony audio channels (C1–C4) exhibit shared spectral bandwidth truncation and quantization characteristics. Pooling validation samples from C1, C2, C3, and C4 (1,200 evaluation points: 600 bona, 600 spoof) provides a robust basis for telephony threshold selection.

| Mode | Target | Recommended θ | Validation FPR | Validation Recall | Validation F1 |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Clean / Wideband (C0)** | High-Security (FPR<=5%) | 0.8300 | 4.7% | 53.3% | 0.6751 |
| **Telephony Pooled (C1-C4)** | High-Security (FPR<=5%) | 0.8300 | 4.8% | 21.2% | 0.3360 |
| **Clean / Wideband (C0)** | Balanced (FPR<=10%) | 0.7950 | 10.0% | 63.3% | 0.7308 |
| **Telephony Pooled (C1-C4)** | Balanced (FPR<=10%) | 0.7800 | 10.0% | 32.7% | 0.4579 |
| **Clean / Wideband (C0)** | Maximum F1 | 0.6850 | 26.7% | 86.0% | 0.8088 |
| **Telephony Pooled (C1-C4)** | Maximum F1 | 0.5250 | 61.0% | 87.7% | 0.7051 |

## 4. Scientific Caution

- All reported thresholds are **validation-derived** on 6 speakers from VCC2020/VCC2018.
- Achieving $\text{FPR} \le 5\%$ on validation does not guarantee exact $5\%$ FPR on held-out unseen attacks.
- Final held-out evaluation in Phase 2C.3 will test whether these frozen thresholds generalize to the unseen A07–A19 test set.