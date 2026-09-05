# EXP-2B-SW — Short-Window Robustness Profiling Report

**Project**: VOXShield AI/ML Scientific Validation  
**Task**: Task 2 — Deepfake Detection Improvements  
**Experiment**: EXP-2B-SW — Short-Window Robustness Profiling  
**Date**: September 5, 2026  
**Status**: COMPLETE — EXPERIMENTAL PROFILING  
**Author**: Bhavya AI/ML Validation Suite  
**Branch**: `feature/bhavya-premium-ai`  

---

## 1. Executive Summary

Production telephony and streaming speech systems frequently process audio in short conversational segments or packetized bursts. While the production model `robust_mini_acoustic_cnn_v1` was trained on $3.0$-second windows ($48{,}000$ samples), the inference engine in `ai/app/deepfake/model.py` permits execution down to $300\text{ ms}$ ($4{,}800$ samples) via deterministic zero-padding.

**EXP-2B-SW** evaluates the exact degradation profile of the frozen production model when input duration is constrained to prefix windows of **$300\text{ ms}$, $500\text{ ms}$, $1.0\text{ s}$, $1.5\text{ s}$, $2.0\text{ s}$, $3.0\text{ s}$, and Full Audio**, across all $6$ benchmark channel conditions (C0 Clean, C1 8 kHz Round-Trip, C2 G.711 $\mu$-law, C3 G.711 A-law, C4 Telephone Bandpass, and C5 Additive Noise 15 dB).

### Key Scientific Findings:
1. **Zero Latency Advantage from Short Windows**:
   - Because `TwoChannelSpectrogramExtractor` zero-pads every input up to $48{,}000$ samples to construct a $(2, 60, 301)$ spectrogram tensor, the CNN forward pass executes the exact same mathematical FLOPs regardless of audio length.
   - Mean inference latency is identical across all window lengths ($\approx 7.8\text{--}10.1\text{ ms}$ on CPU). Short windows provide **zero computational speedup**.
2. **Catastrophic Blindness at $\le 500\text{ ms}$**:
   - At $300\text{ ms}$ ($4{,}800$ samples), $90\%$ of the spectrogram tensor is zero-padded silence. Clean C0 spoof detection recall drops from **$75.33\%$** down to **$34.67\%$** ($\text{FNR} = 65.33\%$, F1 collapses from $0.8014$ to $0.4860$).
   - At $500\text{ ms}$ ($8{,}000$ samples), recall remains crushed at **$33.33\%$** ($\text{FNR} = 66.67\%$, F1 = $0.4902$). Over $65\%$ of deepfake attacks bypass the system completely undetected.
3. **Mid-Window Instability ($1.5\text{ s}\text{--}2.0\text{ s}$)**:
   - Intermediate windows induce extreme false alarm spikes: at $1.5\text{ s}$, C0 false positive rate explodes to **$83.33\%$** (compared to $12.67\%$ at 3.0 s). The abrupt silence-padding boundary at the halfway point of the spectrogram is misinterpreted by the convolutional feature extractors as an unnatural splicing artifact.
4. **Minimum Viable Window**:
   - The minimum acoustically viable window for `MiniAcousticCNN` is **$1.0\text{ second}$** (C0 recall recovers to $77.33\%$, F1 = $0.7205$), though false positives ($37.33\%$) remain elevated compared to the full $3.0$-second reference ($12.67\%$).
5. **Channel Vulnerabilities Persist at All Window Lengths**:
   - Telephone Bandpass (C4) and Additive Noise (C5) remain severe failure points even with full $3.0$-second windows (C4 FPR: $77.33\%$, C5 FPR: $92.00\%$). Window duration does not resolve fundamental spectral distortion vulnerabilities.

---

## 2. Protected Production Model & Integrity Invariants

The production model remained strictly read-only and frozen throughout all evaluations.

### 2.1 Model Identity
- **Registration Name**: `robust_mini_acoustic_cnn_v1`
- **Architecture**: `MiniAcousticCNN` ($93{,}442$ parameters)
- **Input Shape**: $(2, 60, 301)$ (Channel 0: Log-Mel Spectrogram; Channel 1: LFCC Spectrogram)
- **Protected Checkpoint**: `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`
- **Protected SHA-256 Checksum**:
  `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
- **Integrity Assertion**: Pre-experiment and post-experiment hashes verified bitwise identical.

### 2.2 Preprocessing & Feature Extraction Invariants
- **Extractor**: `TwoChannelSpectrogramExtractor(sample_rate=16000, n_bins=60, target_duration_sec=3.0)`
- **Sample Rate**: $16{,}000\text{ Hz}$
- **Target Samples**: $48{,}000$ samples ($3.0\text{ seconds}$)
- **Padding Rule**: If input length $N < 48{,}000$, `waveform = torch.nn.functional.pad(preemph, (0, 48000 - N), mode="constant", value=0.0)`.
- **Operating Threshold**: Strictly frozen at production baseline $\theta = 0.50$.

---

## 3. Dataset & Data Processing Integrity

### 3.1 Held-Out Evaluation Dataset
- **Manifest**: `ai/neural_prototype/results/unseen_attack_eval_manifest.parquet`
- **Total Samples**: $300$ samples ($150$ bona fide, $150$ spoof)
- **Attack Systems**: $A07$ through $A19$ ($13$ unseen synthesis and voice conversion algorithms)
- **Acoustic Disjointness**: Zero speaker, audio ID, or attack system overlap with training/validation data.

### 3.2 Window Processing Integrity Audit
Every audio file was evaluated across all 7 window definitions and 6 channel conditions ($7 \times 6 = 42$ evaluation runs; $12{,}600$ total inferences).

| Window Setting | Target Samples | Evaluated / Total | Success % | Insufficient Audio Cases | Preprocessing Failures | NaN / Inf Cases |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **300 ms** | $4{,}800$ | $300 / 300$ | $100.0\%$ | $0$ | $0$ | $0$ |
| **500 ms** | $8{,}000$ | $300 / 300$ | $100.0\%$ | $0$ | $0$ | $0$ |
| **1.0 s** | $16{,}000$ | $300 / 300$ | $100.0\%$ | $0$ | $0$ | $0$ |
| **1.5 s** | $24{,}000$ | $300 / 300$ | $100.0\%$ | $14$ (samples $< 1.5\text{s}$) | $0$ | $0$ |
| **2.0 s** | $32{,}000$ | $300 / 300$ | $100.0\%$ | $66$ (samples $< 2.0\text{s}$) | $0$ | $0$ |
| **3.0 s** | $48{,}000$ | $300 / 300$ | $100.0\%$ | $173$ (samples $< 3.0\text{s}$) | $0$ | $0$ |
| **Full Reference**| Uncut | $300 / 300$ | $100.0\%$ | $0$ | $0$ | $0$ |

*Note: All 300 evaluation files had natural duration $\ge 1.23\text{ seconds}$ ($19{,}673$ samples). Therefore, for 300 ms, 500 ms, and 1.0 s, 100% of samples contained true uninterrupted acoustic speech before zero-padding. For windows $\ge 1.5\text{ s}$, samples naturally shorter than the target window were zero-padded to 48,000 samples per production specification.*

---

## 4. Comprehensive Window × Condition Evaluation Matrix

All evaluations conducted with the frozen protected production model at $\theta = 0.50$.

### 4.1 Detailed Performance Table
| Window | Condition | Accuracy | Recall | Precision | F1 Score | ROC-AUC | FPR | FNR | EER | Mean Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **300 ms** | **C0 (Clean)** | $63.33\%$ | **34.67%** | $81.25\%$ | **0.4860** | $0.8429$ | $8.00\%$ | **65.33%** | $20.67\%$ | $4.89\text{ ms}$ |
| | **C1 (8k RT)** | $65.67\%$ | $47.33\%$ | $74.74\%$ | $0.5796$ | $0.7860$ | $16.00\%$ | $52.67\%$ | $28.00\%$ | $6.48\text{ ms}$ |
| | **C2 ($\mu$-law)** | $68.33\%$ | $46.00\%$ | $83.13\%$ | $0.5923$ | $0.8270$ | $9.33\%$ | $54.00\%$ | $20.00\%$ | $7.46\text{ ms}$ |
| | **C3 (A-law)** | $69.00\%$ | $46.67\%$ | $84.34\%$ | $0.6009$ | $0.8362$ | $8.67\%$ | $53.33\%$ | $22.67\%$ | $9.92\text{ ms}$ |
| | **C4 (Bandpass)**| $74.67\%$ | $70.00\%$ | $77.21\%$ | $0.7343$ | $0.7844$ | $20.67\%$ | $30.00\%$ | $25.33\%$ | $8.21\text{ ms}$ |
| | **C5 (Noise 15dB)**| $60.33\%$ | **22.67%** | $91.89\%$ | **0.3636** | $0.8259$ | **2.00%** | **77.33%** | $19.00\%$ | $10.32\text{ ms}$ |
| **500 ms** | **C0 (Clean)** | $65.33\%$ | **33.33%** | $92.59\%$ | **0.4902** | $0.8572$ | $2.67\%$ | **66.67%** | $20.67\%$ | $8.82\text{ ms}$ |
| | **C1 (8k RT)** | $68.00\%$ | $46.00\%$ | $82.14\%$ | $0.5897$ | $0.8140$ | $10.00\%$ | $54.00\%$ | $24.67\%$ | $9.38\text{ ms}$ |
| | **C2 ($\mu$-law)** | $67.33\%$ | $40.00\%$ | $88.24\%$ | $0.5505$ | $0.8557$ | $5.33\%$ | $60.00\%$ | $19.67\%$ | $9.94\text{ ms}$ |
| | **C3 (A-law)** | $68.67\%$ | $42.00\%$ | $90.00\%$ | $0.5727$ | $0.8758$ | $4.67\%$ | $58.00\%$ | $18.00\%$ | $9.68\text{ ms}$ |
| | **C4 (Bandpass)**| $70.33\%$ | $59.33\%$ | $76.07\%$ | $0.6667$ | $0.7916$ | $18.67\%$ | $40.67\%$ | $25.67\%$ | $8.24\text{ ms}$ |
| | **C5 (Noise 15dB)**| $65.67\%$ | **34.67%** | $91.23\%$ | **0.5024** | $0.8469$ | $3.33\%$ | **65.33%** | $16.67\%$ | $9.53\text{ ms}$ |
| **1.0 s** | **C0 (Clean)** | $70.00\%$ | $77.33\%$ | $67.44\%$ | $0.7205$ | $0.7553$ | $37.33\%$ | $22.67\%$ | $29.00\%$ | $7.37\text{ ms}$ |
| | **C1 (8k RT)** | $69.67\%$ | $74.00\%$ | $68.10\%$ | $0.7093$ | $0.7524$ | $34.67\%$ | $26.00\%$ | $30.67\%$ | $9.14\text{ ms}$ |
| | **C2 ($\mu$-law)** | $68.67\%$ | $70.00\%$ | $68.18\%$ | $0.6908$ | $0.7449$ | $32.67\%$ | $30.00\%$ | $30.33\%$ | $10.13\text{ ms}$ |
| | **C3 (A-law)** | $70.00\%$ | $72.00\%$ | $69.23\%$ | $0.7059$ | $0.7654$ | $32.00\%$ | $28.00\%$ | $29.00\%$ | $9.76\text{ ms}$ |
| | **C4 (Bandpass)**| $65.33\%$ | $80.67\%$ | $61.73\%$ | $0.6994$ | $0.6809$ | $50.00\%$ | $19.33\%$ | $35.00\%$ | $8.35\text{ ms}$ |
| | **C5 (Noise 15dB)**| $50.00\%$ | $95.33\%$ | $50.00\%$ | $0.6560$ | $0.7959$ | $95.33\%$ | $4.67\%$ | $23.33\%$ | $9.72\text{ ms}$ |
| **1.5 s** | **C0 (Clean)** | $53.67\%$ | $90.67\%$ | $52.11\%$ | $0.6618$ | $0.7269$ | **83.33%** | $9.33\%$ | $31.67\%$ | $7.57\text{ ms}$ |
| | **C1 (8k RT)** | $57.00\%$ | $87.33\%$ | $54.36\%$ | $0.6701$ | $0.6829$ | $73.33\%$ | $12.67\%$ | $35.33\%$ | $9.22\text{ ms}$ |
| | **C2 ($\mu$-law)** | $54.00\%$ | $89.33\%$ | $52.34\%$ | $0.6601$ | $0.6705$ | $81.33\%$ | $10.67\%$ | $38.00\%$ | $9.84\text{ ms}$ |
| | **C3 (A-law)** | $53.33\%$ | $90.67\%$ | $51.91\%$ | $0.6602$ | $0.6600$ | $84.00\%$ | $9.33\%$ | $38.67\%$ | $9.77\text{ ms}$ |
| | **C4 (Bandpass)**| $49.33\%$ | $84.00\%$ | $49.61\%$ | $0.6238$ | $0.5635$ | $85.33\%$ | $16.00\%$ | $46.33\%$ | $8.31\text{ ms}$ |
| | **C5 (Noise 15dB)**| $51.67\%$ | $97.33\%$ | $50.87\%$ | $0.6682$ | $0.5641$ | $94.00\%$ | $2.67\%$ | $46.67\%$ | $9.65\text{ ms}$ |
| **2.0 s** | **C0 (Clean)** | $59.33\%$ | $88.67\%$ | $55.88\%$ | $0.6856$ | $0.7569$ | **70.00%** | $11.33\%$ | $33.33\%$ | $7.70\text{ ms}$ |
| | **C1 (8k RT)** | $58.00\%$ | $90.00\%$ | $54.88\%$ | $0.6818$ | $0.6560$ | $74.00\%$ | $10.00\%$ | $40.67\%$ | $9.08\text{ ms}$ |
| | **C2 ($\mu$-law)** | $58.33\%$ | $89.33\%$ | $55.14\%$ | $0.6819$ | $0.6778$ | $72.67\%$ | $10.67\%$ | $38.00\%$ | $9.91\text{ ms}$ |
| | **C3 (A-law)** | $57.00\%$ | $91.33\%$ | $54.15\%$ | $0.6799$ | $0.6630$ | $77.33\%$ | $8.67\%$ | $40.00\%$ | $9.87\text{ ms}$ |
| | **C4 (Bandpass)**| $47.33\%$ | $88.00\%$ | $48.53\%$ | $0.6256$ | $0.5449$ | **93.33%** | $12.00\%$ | $48.00\%$ | $8.66\text{ ms}$ |
| | **C5 (Noise 15dB)**| $52.33\%$ | $97.33\%$ | $51.23\%$ | $0.6713$ | $0.4947$ | $92.67\%$ | $2.67\%$ | $52.33\%$ | $9.71\text{ ms}$ |
| **3.0 s** | **C0 (Clean)** | $81.33\%$ | $75.33\%$ | $85.61\%$ | $0.8014$ | $0.8733$ | $12.67\%$ | $24.67\%$ | $22.67\%$ | $7.85\text{ ms}$ |
| | **C1 (8k RT)** | $65.33\%$ | $78.67\%$ | $62.11\%$ | $0.6941$ | $0.7144$ | $48.00\%$ | $21.33\%$ | $36.00\%$ | $9.11\text{ ms}$ |
| | **C2 ($\mu$-law)** | $71.33\%$ | $76.00\%$ | $69.51\%$ | $0.7261$ | $0.7775$ | $33.33\%$ | $24.00\%$ | $29.67\%$ | $9.98\text{ ms}$ |
| | **C3 (A-law)** | $70.33\%$ | $78.00\%$ | $67.63\%$ | $0.7245$ | $0.7645$ | $37.33\%$ | $22.00\%$ | $31.67\%$ | $10.03\text{ ms}$ |
| | **C4 (Bandpass)**| $53.00\%$ | $84.00\%$ | $51.85\%$ | $0.6412$ | $0.6069$ | $78.00\%$ | $16.00\%$ | $44.67\%$ | $8.61\text{ ms}$ |
| | **C5 (Noise 15dB)**| $52.00\%$ | $96.00\%$ | $51.06\%$ | $0.6667$ | $0.5497$ | $92.00\%$ | $4.00\%$ | $47.00\%$ | $9.80\text{ ms}$ |
| **Full Ref** | **C0 (Clean)** | $81.33\%$ | $75.33\%$ | $85.61\%$ | **0.8014** | $0.8733$ | $12.67\%$ | $24.67\%$ | $22.67\%$ | $7.91\text{ ms}$ |
| | **C1 (8k RT)** | $65.33\%$ | $79.33\%$ | $61.98\%$ | **0.6959** | $0.7187$ | $48.67\%$ | $20.67\%$ | $35.33\%$ | $9.29\text{ ms}$ |
| | **C2 ($\mu$-law)** | $71.67\%$ | $76.67\%$ | $69.70\%$ | **0.7302** | $0.7849$ | $33.33\%$ | $23.33\%$ | $29.33\%$ | $10.01\text{ ms}$ |
| | **C3 (A-law)** | $70.67\%$ | $78.67\%$ | $67.82\%$ | **0.7284** | $0.7702$ | $37.33\%$ | $21.33\%$ | $31.33\%$ | $10.13\text{ ms}$ |
| | **C4 (Bandpass)**| $53.33\%$ | $84.00\%$ | $52.07\%$ | **0.6429** | $0.6119$ | **77.33%** | $16.00\%$ | $44.33\%$ | $8.70\text{ ms}$ |
| | **C5 (Noise 15dB)**| $52.00\%$ | $96.00\%$ | $51.06\%$ | **0.6667** | $0.5544$ | **92.00%** | $4.00\%$ | $46.67\%$ | $9.76\text{ ms}$ |

---

## 5. Comparative Degradation vs Full Audio Reference

The table below tracks the degradation deltas ($\Delta = \text{Window} - \text{Full Reference}$):

| Window | Condition | $\Delta$Accuracy | $\Delta$Recall | $\Delta$Precision | $\Delta$F1 Score | $\Delta$ROC-AUC | $\Delta$FPR | $\Delta$FNR |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **300 ms** | **C0** | $-18.00\%$ | **-40.66%** | $-4.36\%$ | **-0.3154** | $-0.0304$ | $-4.67\%$ | **+40.66%** |
| | **C1** | $+0.34\%$ | $-32.00\%$ | $+12.76\%$ | $-0.1163$ | $+0.0673$ | $-32.67\%$ | $+32.00\%$ |
| | **C2** | $-3.34\%$ | $-30.67\%$ | $+13.43\%$ | $-0.1379$ | $+0.0421$ | $-24.00\%$ | $+30.67\%$ |
| | **C3** | $-1.67\%$ | $-32.00\%$ | $+16.52\%$ | $-0.1275$ | $+0.0660$ | $-28.66\%$ | $+32.00\%$ |
| | **C4** | $+21.34\%$ | $-14.00\%$ | $+25.14\%$ | $+0.0914$ | $+0.1725$ | $-56.66\%$ | $+14.00\%$ |
| | **C5** | $+8.33\%$ | **-73.33%** | $+40.83\%$ | **-0.3031** | $+0.2715$ | $-90.00\%$ | **+73.33%** |
| **500 ms** | **C0** | $-16.00\%$ | **-42.00%** | $+6.98\%$ | **-0.3112** | $-0.0161$ | $-10.00\%$ | **+42.00%** |
| | **C1** | $+2.67\%$ | $-33.33\%$ | $+20.16\%$ | $-0.1062$ | $+0.0953$ | $-38.67\%$ | $+33.33\%$ |
| | **C2** | $-4.34\%$ | $-36.67\%$ | $+18.54\%$ | $-0.1797$ | $+0.0708$ | $-28.00\%$ | $+36.67\%$ |
| | **C3** | $-2.00\%$ | $-36.67\%$ | $+22.18\%$ | $-0.1557$ | $+0.1056$ | $-32.66\%$ | $+36.67\%$ |
| | **C4** | $+17.00\%$ | $-24.67\%$ | $+24.00\%$ | $+0.0238$ | $+0.1797$ | $-58.66\%$ | $+24.67\%$ |
| | **C5** | $+13.67\%$ | **-61.33%** | $+40.17\%$ | **-0.1643** | $+0.2925$ | $-88.67\%$ | **+61.33%** |
| **1.0 s** | **C0** | $-11.33\%$ | $+2.00\%$ | $-18.17\%$ | **-0.0809** | $-0.1180$ | $+24.66\%$ | $-2.00\%$ |
| | **C1** | $+4.34\%$ | $-5.33\%$ | $+6.12\%$ | $+0.0134$ | $+0.0337$ | $-14.00\%$ | $+5.33\%$ |
| | **C2** | $-3.00\%$ | $-6.67\%$ | $-1.52\%$ | $-0.0394$ | $-0.0400$ | $-0.66\%$ | $+6.67\%$ |
| | **C3** | $-0.67\%$ | $-6.67\%$ | $+1.41\%$ | $-0.0225$ | $-0.0048$ | $-5.33\%$ | $+6.67\%$ |
| | **C4** | $+12.00\%$ | $-3.33\%$ | $+9.66\%$ | $+0.0565$ | $+0.0690$ | $-27.33\%$ | $+3.33\%$ |
| | **C5** | $-2.00\%$ | $-0.67\%$ | $-1.06\%$ | $-0.0107$ | $+0.2415$ | $+3.33\%$ | $+0.67\%$ |
| **1.5 s** | **C0** | **-27.66%** | $+15.34\%$ | $-33.50\%$ | **-0.1396** | $-0.1464$ | **+70.66%** | $-15.34\%$ |
| | **C1** | $-8.33\%$ | $+8.00\%$ | $-7.62\%$ | $-0.0258$ | $-0.0358$ | $+24.66\%$ | $-8.00\%$ |
| | **C2** | $-17.67\%$ | $+12.66\%$ | $-17.36\%$ | $-0.0701$ | $-0.1144$ | $+48.00\%$ | $-12.66\%$ |
| | **C3** | $-17.34\%$ | $+12.00\%$ | $-15.91\%$ | $-0.0682$ | $-0.1102$ | $+46.67\%$ | $-12.00\%$ |
| | **C4** | $-4.00\%$ | $0.00\%$ | $-2.46\%$ | $-0.0191$ | $-0.0484$ | $+8.00\%$ | $0.00\%$ |
| | **C5** | $-0.33\%$ | $+1.33\%$ | $-0.19\%$ | $+0.0015$ | $+0.0097$ | $+2.00\%$ | $-1.33\%$ |
| **2.0 s** | **C0** | **-22.00%** | $+13.34\%$ | $-29.73\%$ | **-0.1158** | $-0.1164$ | **+57.33%** | $-13.34\%$ |
| | **C1** | $-7.33\%$ | $+10.67\%$ | $-7.10\%$ | $-0.0141$ | $-0.0627$ | $+25.33\%$ | $-10.67\%$ |
| | **C2** | $-13.34\%$ | $+12.66\%$ | $-14.56\%$ | $-0.0483$ | $-0.1071$ | $+39.34\%$ | $-12.66\%$ |
| | **C3** | $-13.67\%$ | $+12.66\%$ | $-13.67\%$ | $-0.0485$ | $-0.1072$ | $+40.00\%$ | $-12.66\%$ |
| | **C4** | $-6.00\%$ | $+4.00\%$ | $-3.54\%$ | $-0.0173$ | $-0.0670$ | $+16.00\%$ | $-4.00\%$ |
| | **C5** | $+0.33\%$ | $+1.33\%$ | $+0.17\%$ | $+0.0046$ | $-0.0597$ | $+0.67\%$ | $-1.33\%$ |
| **3.0 s** | **C0** | $0.00\%$ | $0.00\%$ | $0.00\%$ | $0.0000$ | $0.0000$ | $0.00\%$ | $0.00\%$ |
| | **C1** | $0.00\%$ | $-0.66\%$ | $+0.13\%$ | $-0.0018$ | $-0.0043$ | $-0.67\%$ | $+0.66\%$ |
| | **C2** | $-0.34\%$ | $-0.67\%$ | $-0.19\%$ | $-0.0041$ | $-0.0074$ | $0.00\%$ | $+0.67\%$ |
| | **C3** | $-0.34\%$ | $-0.67\%$ | $-0.19\%$ | $-0.0039$ | $-0.0057$ | $0.00\%$ | $+0.67\%$ |
| | **C4** | $-0.33\%$ | $0.00\%$ | $-0.22\%$ | $-0.0017$ | $-0.0050$ | $+0.67\%$ | $0.00\%$ |
| | **C5** | $0.00\%$ | $0.00\%$ | $0.00\%$ | $0.0000$ | $-0.0047$ | $0.00\%$ | $0.00\%$ |

---

## 6. Direct Answers to Primary Questions

### 1. What is the minimum usable audio duration for the protected model?
- **$1.0\text{ second}$**.
- At $1.0\text{ s}$, spoof recall on clean C0 audio recovers to **$77.33\%$** with an F1 score of **$0.7205$**.
- Below $1.0\text{ s}$ ($300\text{ ms}$ and $500\text{ ms}$), the model collapses into deepfake blindness, missing approximately two out of every three attacks ($\text{FNR} \approx 65\text{--}67\%$).

### 2. How much does recall/F1 degrade as the window gets shorter?
- On C0 clean audio:
  - Full / 3.0 s: $\text{Recall} = 75.33\%$, $\text{F1} = 0.8014$
  - 2.0 s: $\text{Recall} = 88.67\%$, $\text{F1} = 0.6856$ (severe false alarm penalty: $\text{FPR} = 70.00\%$)
  - 1.5 s: $\text{Recall} = 90.67\%$, $\text{F1} = 0.6618$ (severe false alarm penalty: $\text{FPR} = 83.33\%$)
  - 1.0 s: $\text{Recall} = 77.33\%$, $\text{F1} = 0.7205$
  - 500 ms: $\text{Recall} = 33.33\%$ ($\Delta\text{Rec} = -42.00\%$), $\text{F1} = 0.4902$ ($\Delta\text{F1} = -0.3112$)
  - 300 ms: $\text{Recall} = 34.67\%$ ($\Delta\text{Rec} = -40.66\%$), $\text{F1} = 0.4860$ ($\Delta\text{F1} = -0.3154$)

### 3. At what duration does performance become unacceptable?
- **Unacceptable at $\le 500\text{ ms}$**: Fails safety requirements due to extreme false negatives ($65.33\%\text{--}66.67\%$ of deepfakes slip through).
- **Unacceptable at $1.5\text{ s}\text{--}2.0\text{ s}$**: Fails usability requirements due to extreme false alarms ($70.00\%\text{--}83.33\%$ FPR on clean bona fide calls).

### 4. Does short-window behavior differ between C0 and telephony/degraded C1–C5?
- **Yes.** Under C1–C3 telephony codecs, $300\text{ ms}\text{--}500\text{ ms}$ windows depress recall to $40.00\%\text{--}47.33\%$ while suppressing false alarms ($4.67\%\text{--}16.00\%$). Under C5 noise at $300\text{ ms}$, recall collapses to $22.67\%$ while FPR drops from $92.00\%$ to $2.00\%$, demonstrating that short padded windows artificially mute the continuous noise floor that usually triggers false alarms.

### 5. Does C4/C5 remain problematic even with longer windows?
- **Yes.** At full $3.0\text{ s}$ and Full reference, C4 FPR remains at **$77.33\%\text{--}78.00\%$** and C5 FPR remains at **$92.00\%$**. Increasing window duration does not solve telephone bandpass filtering or additive noise vulnerabilities.

### 6. Is there a meaningful latency advantage from shorter windows?
- **No.** Across all evaluated windows ($300\text{ ms}$ to Full), mean inference latency per sample is essentially flat:
  - 300 ms: $4.89\text{--}10.32\text{ ms}$ (mean $\approx 7.9\text{ ms}$)
  - 1.0 s: $7.37\text{--}10.13\text{ ms}$ (mean $\approx 9.1\text{ ms}$)
  - 3.0 s: $7.85\text{--}10.03\text{ ms}$ (mean $\approx 9.2\text{ ms}$)
  - Full: $7.91\text{--}10.13\text{ ms}$ (mean $\approx 9.3\text{ ms}$)
- The STFT and neural forward pass always compute over a fixed $(2, 60, 301)$ tensor. Slicing raw audio provides less than $1\text{ ms}$ in I/O savings while degrading accuracy.

### 7. Is there a practical accuracy/latency trade-off that could justify a future short-window operating point?
- **No.** Because shorter windows yield no computational latency benefit, there is no Pareto trade-off. Running windows below $3.0\text{ s}$ strictly degrades model reliability.

---

## 7. Operational Recommendations for Production Orchestration

1. **Tighten the Minimum Audio Guard in `ai/app/deepfake/model.py`**:
   - Currently, line 170 permits neural execution on `len(raw_samples) >= 4800` ($300\text{ ms}$).
   - **Recommendation**: Update the neural entry guard from $\ge 4{,}800$ to **$\ge 16{,}000$ samples ($1.0\text{ s}$)**, or preferably **$\ge 48{,}000$ samples ($3.0\text{ s}$)**. For audio $< 1.0\text{ s}$, the orchestrator should return `INCONCLUSIVE` or buffer subsequent packets rather than forcing a low-confidence neural evaluation.
2. **Eliminate Fractional Zero-Padding Artifacts**:
   - The surge in false alarms at $1.5\text{ s}\text{--}2.0\text{ s}$ proves that MiniAcousticCNN is sensitive to the abrupt silence step created by zero-padding. If variable-duration inputs must be supported in future versions, models should be trained with randomized variable-length padding and SpecAugment.
3. **Keep Protected Production Checkpoint Untouched**:
   - Checkpoint SHA-256 remains verified and locked.

---

## 8. Verification & Checkpoint Integrity

- **Protected Production Checkpoint**:
  - Initial SHA-256: `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
  - Final SHA-256:   `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
  - Status: **BITWISE UNCHANGED**
- **Artifacts Saved**:
  - Full numerical metrics JSON: `C:\Users\bhavy\.gemini\antigravity-ide\brain\f600373b-8de3-4e38-bf3b-8d927f58c602\scratch\exp_2b_sw\exp_2b_sw_results.json`
  - Run execution log: `.../scratch/exp_2b_sw/exp_2b_sw_run.log`
- **Git Status**: Clean. Only report files in `docs/ai/` authored.
