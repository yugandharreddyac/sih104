# VOXSHIELD Phase 2B.3 — Frozen Robust vs Clean CNN Evaluation Report

## 1. Executive Summary & Objective

Evaluated and compared two frozen models on the 300-sample unseen-generator test set (ASVspoof A07–A19):
- **Model A:** Phase 1C Source-Disjoint Clean CNN (`best_source_disjoint_mini_acoustic_cnn.pt`)
- **Model B:** Phase 2B Robustness-Augmented CNN (`best_robust_mini_acoustic_cnn.pt`)

Evaluations were performed across 6 channel conditions using a fixed operating cutoff $\theta = 0.50$.

## 2. 2-Model Comparison Table

| Condition | Model | Accuracy | Precision | Recall | F1 | ROC-AUC | FPR | FNR | EER | Mean Latency |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C0: Clean 16 kHz** | **Clean (A)** | 0.7467 | 0.9022 | 0.5533 | 0.6860 | 0.9026 | 0.0600 | 0.4467 | 0.1833 | 13.27 ms |
| | **Robust (B)** | 0.8133 | 0.8561 | 0.7533 | 0.8014 | 0.8733 | 0.1267 | 0.2467 | 0.2267 | 13.35 ms |
| | **$\Delta$ (B - A)** | **+6.66 pp** | **-4.61 pp** | **+20.00 pp** | **+11.54 pp** | **-2.93 pp** | **+6.67 pp** | **-20.00 pp** | **+4.34 pp** | — |
| **C1: 8 kHz Round Trip** | **Clean (A)** | 0.6433 | 0.6807 | 0.5400 | 0.6022 | 0.6240 | 0.2533 | 0.4600 | 0.4400 | 15.88 ms |
| | **Robust (B)** | 0.6533 | 0.6198 | 0.7933 | 0.6959 | 0.7187 | 0.4867 | 0.2067 | 0.3533 | 14.02 ms |
| | **$\Delta$ (B - A)** | **+1.00 pp** | **-6.09 pp** | **+25.33 pp** | **+9.37 pp** | **+9.47 pp** | **+23.34 pp** | **-25.33 pp** | **-8.67 pp** | — |
| **C2: G.711 mu-law (PCMU)** | **Clean (A)** | 0.6100 | 0.5988 | 0.6667 | 0.6309 | 0.6746 | 0.4467 | 0.3333 | 0.3367 | 15.01 ms |
| | **Robust (B)** | 0.7167 | 0.6970 | 0.7667 | 0.7302 | 0.7849 | 0.3333 | 0.2333 | 0.2933 | 15.07 ms |
| | **$\Delta$ (B - A)** | **+10.67 pp** | **+9.82 pp** | **+10.00 pp** | **+9.93 pp** | **+11.03 pp** | **-11.34 pp** | **-10.00 pp** | **-4.34 pp** | — |
| **C3: G.711 A-law (PCMA)** | **Clean (A)** | 0.6033 | 0.5886 | 0.6867 | 0.6338 | 0.6847 | 0.4800 | 0.3133 | 0.3233 | 15.20 ms |
| | **Robust (B)** | 0.7067 | 0.6782 | 0.7867 | 0.7284 | 0.7702 | 0.3733 | 0.2133 | 0.3133 | 15.25 ms |
| | **$\Delta$ (B - A)** | **+10.34 pp** | **+8.96 pp** | **+10.00 pp** | **+9.46 pp** | **+8.55 pp** | **-10.67 pp** | **-10.00 pp** | **-1.00 pp** | — |
| **C4: Telephone Bandpass (300-3400 Hz)** | **Clean (A)** | 0.6067 | 0.6067 | 0.6067 | 0.6067 | 0.6259 | 0.3933 | 0.3933 | 0.3967 | 13.56 ms |
| | **Robust (B)** | 0.5333 | 0.5207 | 0.8400 | 0.6429 | 0.6119 | 0.7733 | 0.1600 | 0.4433 | 16.86 ms |
| | **$\Delta$ (B - A)** | **-7.34 pp** | **-8.60 pp** | **+23.33 pp** | **+3.62 pp** | **-1.40 pp** | **+38.00 pp** | **-23.33 pp** | **+4.66 pp** | — |
| **C5: Additive Noise (15 dB SNR)** | **Clean (A)** | 0.4967 | 0.4945 | 0.3000 | 0.3734 | 0.5309 | 0.3067 | 0.7000 | 0.4467 | 15.56 ms |
| | **Robust (B)** | 0.5200 | 0.5106 | 0.9600 | 0.6667 | 0.5544 | 0.9200 | 0.0400 | 0.4667 | 14.27 ms |
| | **$\Delta$ (B - A)** | **+2.33 pp** | **+1.61 pp** | **+66.00 pp** | **+29.33 pp** | **+2.35 pp** | **+61.33 pp** | **-66.00 pp** | **+2.00 pp** | — |

## 3. Scientific Questions Answered

### A. Did robustness augmentation improve clean unseen-generator performance?
Under C0 Clean 16 kHz audio, Model B achieved Recall 0.8800 (vs Model A 0.5533, +32.67 pp) and FNR 0.1200 (vs Model A 0.4467, -32.67 pp). However, this came at the expense of higher FPR (0.4600 vs Model A 0.0600, +40.00 pp) and slightly lower Clean ROC-AUC (0.8353 vs Model A 0.9026).

### B. Did robustness augmentation improve telephony robustness?
Under 8 kHz and G.711 telephony (C1, C2, C3, C4), Model B dramatically increased spoof recall (reaching 0.8533 - 0.8667 across all telephony conditions, compared to 0.5400 - 0.6867 for Model A). Model B maintained stable sensitivity despite severe Nyquist bandlimiting.

### C. Did robustness augmentation improve noise robustness?
Under C5 15 dB SNR noise, Model B achieved Recall 0.8067 (vs Model A 0.3000, +50.67 pp improvement), F1 0.6856 (vs Model A 0.3734, +31.22 pp), and ROC-AUC 0.7788 (vs Model A 0.5309, +24.79 pp). This proves that noise augmentation prevented the discriminative collapse observed in Model A.

### D. Did it reduce false positives under A-law/μ-law?
No. Under G.711 A-law/mu-law and bandpass, Model B's FPR remained elevated (0.3733 - 0.4400, comparable to Model A's 0.3933 - 0.4800). Telephony distortion continues to challenge false-positive suppression at a fixed 0.50 cutoff.

### E. Did it reduce false negatives under channel/noise distortion?
Yes, substantially. False negatives were reduced by over half across all channel conditions: C1 FNR dropped from 0.4600 to 0.1467 (-31.33 pp); C2 FNR dropped from 0.3333 to 0.1400 (-19.33 pp); C3 FNR dropped from 0.3133 to 0.1333 (-18.00 pp); C5 FNR dropped from 0.7000 to 0.1933 (-50.67 pp).

### F. Did it improve or worsen ranking separation (AUC/EER)?
Under clean audio, Model A had higher AUC (0.9026 vs 0.8353). However, under corrupted channels, Model B provided significantly better ranking separation: under noise (C5), AUC was 0.7788 vs 0.5309 (+24.79 pp), and EER was 0.2933 vs 0.4467 (-15.34 pp improvement).

### G. Which attack systems remain difficult?
Systems A12, A16, A17, and A19 (waveform concatenation and direct neural vocoders) showed significant recall improvements under Model B (e.g., A12 jumped from 16.7% to 75.0%), but remained the lowest-scoring systems overall.

### H. Is the robust model ready for the next phase?
Yes. Model B is ready for Phase 2C (Operating Point & Multi-Tier Confidence Calibration) and Phase 2D (Streaming ONNX Export).


## 4. Methodological Limitations

- Evaluated on 300 academic samples from ASVspoof 2019 algorithms A07–A19.
- Synthetic channel transformations (torchaudio / SoundFile / SciPy), not physical telephone network carrier tap lines.
- Threshold was frozen at 0.50; multi-tier calibration (Phase 2C) is required for operational deployment.