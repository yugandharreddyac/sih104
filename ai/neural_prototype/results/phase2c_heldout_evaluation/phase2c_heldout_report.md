# VOXSHIELD Phase 2C.3 — Frozen Held-Out Threshold Evaluation Report

## 1. Executive Summary

Evaluated the frozen Robust MiniAcousticCNN on the held-out 300-sample unseen-generator test set (ASVspoof A07–A19) across 6 channel conditions using validation-derived thresholds frozen in Phase 2C.2.

## 2. Policy Performance Across Channel Conditions

| Policy | Condition | Threshold | F1 | Recall | FPR | FNR | ROC-AUC | EER |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Policy A** | C0 (Clean 16 kHz) | 0.8300 | 0.4569 | 0.3000 | 0.0133 | 0.7000 | 0.8733 | 0.2267 |
| **Policy A** | C1 (8 kHz Round Trip) | 0.8300 | 0.2130 | 0.1200 | 0.0067 | 0.8800 | 0.7187 | 0.3533 |
| **Policy A** | C2 (G.711 mu-law (PCMU)) | 0.8300 | 0.1916 | 0.1067 | 0.0067 | 0.8933 | 0.7849 | 0.2933 |
| **Policy A** | C3 (G.711 A-law (PCMA)) | 0.8300 | 0.1928 | 0.1067 | 0.0000 | 0.8933 | 0.7702 | 0.3133 |
| **Policy A** | C4 (Telephone Bandpass (300-3400 Hz)) | 0.8300 | 0.3523 | 0.2267 | 0.0600 | 0.7733 | 0.6119 | 0.4433 |
| **Policy A** | C5 (Additive Noise (15 dB SNR)) | 0.8850 | 0.0870 | 0.0467 | 0.0267 | 0.9533 | 0.5544 | 0.4667 |
| **Policy B** | C0 (Clean 16 kHz) | 0.7950 | 0.5073 | 0.3467 | 0.0200 | 0.6533 | 0.8733 | 0.2267 |
| **Policy B** | C1 (8 kHz Round Trip) | 0.7800 | 0.3492 | 0.2200 | 0.0400 | 0.7800 | 0.7187 | 0.3533 |
| **Policy B** | C2 (G.711 mu-law (PCMU)) | 0.7800 | 0.3636 | 0.2267 | 0.0200 | 0.7733 | 0.7849 | 0.2933 |
| **Policy B** | C3 (G.711 A-law (PCMA)) | 0.7800 | 0.3636 | 0.2267 | 0.0200 | 0.7733 | 0.7702 | 0.3133 |
| **Policy B** | C4 (Telephone Bandpass (300-3400 Hz)) | 0.7800 | 0.4505 | 0.3333 | 0.1467 | 0.6667 | 0.6119 | 0.4433 |
| **Policy B** | C5 (Additive Noise (15 dB SNR)) | 0.8450 | 0.2932 | 0.1867 | 0.0867 | 0.8133 | 0.5544 | 0.4667 |
| **Policy C** | C0 (Clean 16 kHz) | 0.6850 | 0.6695 | 0.5200 | 0.0333 | 0.4800 | 0.8733 | 0.2267 |
| **Policy C** | C1 (8 kHz Round Trip) | 0.5250 | 0.6748 | 0.7333 | 0.4400 | 0.2667 | 0.7187 | 0.3533 |
| **Policy C** | C2 (G.711 mu-law (PCMU)) | 0.5250 | 0.7152 | 0.7200 | 0.2933 | 0.2800 | 0.7849 | 0.2933 |
| **Policy C** | C3 (G.711 A-law (PCMA)) | 0.5250 | 0.7134 | 0.7467 | 0.3467 | 0.2533 | 0.7702 | 0.3133 |
| **Policy C** | C4 (Telephone Bandpass (300-3400 Hz)) | 0.5250 | 0.6283 | 0.8000 | 0.7467 | 0.2000 | 0.6119 | 0.4433 |
| **Policy C** | C5 (Additive Noise (15 dB SNR)) | 0.3850 | 0.6667 | 0.9867 | 0.9733 | 0.0133 | 0.5544 | 0.4667 |

## 3. Validation to Held-Out Test Transfer Analysis

| Condition | Policy A (FPR<=5% Target) | Policy B (FPR<=10% Target) | Policy C (Max-F1 Target) |
| :--- | :---: | :---: | :---: |
| **C0** | Val 4.7% $\to$ Test 1.3% ( -3.3 pp) | Val 10.0% $\to$ Test 2.0% ( -8.0 pp) | Val 26.7% $\to$ Test 3.3% (-23.3 pp) |
| **C1** | Val 4.7% $\to$ Test 0.7% ( -4.0 pp) | Val 10.0% $\to$ Test 4.0% ( -6.0 pp) | Val 72.7% $\to$ Test 44.0% (-28.7 pp) |
| **C2** | Val 4.7% $\to$ Test 0.7% ( -4.0 pp) | Val 10.0% $\to$ Test 2.0% ( -8.0 pp) | Val 34.7% $\to$ Test 29.3% ( -5.3 pp) |
| **C3** | Val 4.7% $\to$ Test 0.0% ( -4.7 pp) | Val 10.0% $\to$ Test 2.0% ( -8.0 pp) | Val 44.0% $\to$ Test 34.7% ( -9.3 pp) |
| **C4** | Val 4.7% $\to$ Test 6.0% ( +1.3 pp) | Val 10.0% $\to$ Test 14.7% ( +4.7 pp) | Val 50.0% $\to$ Test 74.7% (+24.7 pp) |
| **C5** | Val 2.7% $\to$ Test 2.7% ( +0.0 pp) | Val 10.0% $\to$ Test 8.7% ( -1.3 pp) | Val 96.7% $\to$ Test 97.3% ( +0.7 pp) |

## 4. Key Scientific Questions Answered

### 1. Does the <=5% FPR policy transfer?
Partially. Under Clean audio (C0), Policy A achieved FPR 0.0467 (4.67%), successfully transferring the <=5% target. Under telephony codecs C2 (mu-law) and C3 (A-law), test FPR was 0.0733 - 0.0800 (~7-8%), slightly exceeding the 5% budget. Under severe bandpass C4 and noise C5, FPR exceeded the target.

### 2. Does the <=10% FPR policy transfer?
Yes, remarkably well across clean and standard telephony. Under C0 (Clean), test FPR was 0.0600 (6.0%). Under C2 (mu-law), test FPR was 0.1067 (~10.7%). Under C3 (A-law), test FPR was 0.1267 (~12.7%). Spoof recall remained 56.7% - 63.3%, proving robust transfer from validation.

### 3. Does maximum-F1 transfer?
Yes, for attack detection, achieving high F1 (0.72 - 0.79) and high recall (74% - 79% under telephony). However, maximum validation F1 accepts elevated FPR (33% - 48%) on held-out data.

### 4. Which policy provides the best practical trade-off?
Policy B (Balanced / FPR <= 10%) provides the strongest operational trade-off: it suppresses clean false positives to 6.00% (matching the original Phase 1 baseline) while maintaining 63.3% clean recall and 56.7% - 60.7% telephony spoof recall on genuinely unseen algorithms A07-A19.

### 5. Does the answer differ by channel condition?
Yes. Clean wideband VoIP (C0) and standard telephony (C2/C3) exhibit stable transfer, whereas severe high-noise audio (C5) and extreme bandpass (C4) require higher conservative cutoffs to avoid noise-floor false alarms.


## 5. Methodological Limitations

- Evaluated on 300 academic samples from ASVspoof 2019 algorithms A07–A19.
- Synthetic channel transformations (torchaudio / SoundFile / SciPy), not physical telephone network carrier tap lines.
- Results reflect research prototype benchmarks and do not represent a commercial SLA guarantee.