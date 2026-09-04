# VOXSHIELD Phase 2A.2 — Telephony & Channel Robustness Evaluation Report

## 1. Executive Summary

Evaluated the frozen source-disjoint `MiniAcousticCNN` (trained on VCC2020+VCC2018, 0 exposure to A07-A19) across 6 controlled channel and telephony distortion conditions on the 300-sample unseen-generator test set.
Operating threshold was strictly frozen at **0.50** without tuning on corrupted data.

## 2. Condition-by-Condition Results Table

| Condition | Accuracy | Precision | Recall | F1 | ROC-AUC | FPR | FNR | EER | Mean Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C0: Clean 16 kHz Baseline** | 0.7467 | 0.9022 | 0.5533 | 0.6860 | 0.9026 | 0.0600 | 0.4467 | 0.1833 | 12.82 ms |
| **C1: 8 kHz Round Trip** | 0.6433 | 0.6807 | 0.5400 | 0.6022 | 0.6240 | 0.2533 | 0.4600 | 0.4400 | 15.40 ms |
| **C2: G.711 mu-law (PCMU)** | 0.6100 | 0.5988 | 0.6667 | 0.6309 | 0.6746 | 0.4467 | 0.3333 | 0.3367 | 15.30 ms |
| **C3: G.711 A-law (PCMA)** | 0.6033 | 0.5886 | 0.6867 | 0.6338 | 0.6847 | 0.4800 | 0.3133 | 0.3233 | 14.36 ms |
| **C4: Telephone Bandpass (300-3400 Hz)** | 0.6067 | 0.6067 | 0.6067 | 0.6067 | 0.6259 | 0.3933 | 0.3933 | 0.3967 | 12.38 ms |
| **C5: Additive Noise (15 dB SNR)** | 0.4967 | 0.4945 | 0.3000 | 0.3734 | 0.5309 | 0.3067 | 0.7000 | 0.4467 | 13.96 ms |

## 3. Degradation Relative to Clean Baseline (Percentage Points)

| Distorted Condition | $\Delta$ Accuracy | $\Delta$ Precision | $\Delta$ Recall | $\Delta$ F1 | $\Delta$ ROC-AUC | $\Delta$ FPR | $\Delta$ FNR | $\Delta$ EER |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C1: 8 kHz Round Trip** | -10.34 pp | -22.15 pp | -1.33 pp | -8.38 pp | -27.86 pp | +19.33 pp | +1.33 pp | +25.67 pp |
| **C2: G.711 mu-law (PCMU)** | -13.67 pp | -30.34 pp | +11.34 pp | -5.51 pp | -22.80 pp | +38.67 pp | -11.34 pp | +15.34 pp |
| **C3: G.711 A-law (PCMA)** | -14.34 pp | -31.36 pp | +13.34 pp | -5.22 pp | -21.79 pp | +42.00 pp | -13.34 pp | +14.00 pp |
| **C4: Telephone Bandpass (300-3400 Hz)** | -14.00 pp | -29.55 pp | +5.34 pp | -7.93 pp | -27.67 pp | +33.33 pp | -5.34 pp | +21.34 pp |
| **C5: Additive Noise (15 dB SNR)** | -25.00 pp | -40.77 pp | -25.33 pp | -31.26 pp | -37.17 pp | +24.67 pp | +25.33 pp | +26.34 pp |

## 4. Key Scientific Findings

1. **Nyquist Frequency Cutoff Impact:** 8 kHz downsampling (C1) and bandpass filtering (C4) remove upper-band vocoder harmonics (>4 kHz). This alters the high-frequency LFCC/Mel bins.
2. **G.711 Telephony Quantization:** Companding under mu-law (C2) and A-law (C3) introduces non-linear quantization noise on top of 8 kHz bandlimiting.
3. **Additive Background Noise (C5):** White Gaussian noise at 15 dB SNR alters low-energy spectral frames.

## 5. Methodological Limitations

- Synthetic channel transformations rather than in-the-wild telephony carrier captures.
- Evaluation size is 300 samples.
- The underlying samples remain ASVspoof academic data.
- Commercial zero-shot cloners and Indian language audio are not yet evaluated.
- Zero threshold calibration was performed on the corrupted data.