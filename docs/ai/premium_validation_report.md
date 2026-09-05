# VOXShield Premium AI Scientific Validation Report

**Document Version**: 2.0.0  
**Project**: VOXShield AI/ML Scientific Validation  
**Date**: September 5, 2026  
**Status**: COMPLETE — CONSOLIDATED EVIDENCE BASE  
**Author**: Bhavya AI/ML Validation Suite  
**Branch**: `feature/bhavya-premium-ai`  

---

## 1. Executive Summary & Scope

This master document consolidates the complete empirical evidence base for the scientific validation of VOXShield AI/ML subsystems on branch `feature/bhavya-premium-ai` at commit `7e4ced321e72bd16ffb6f7b2ad74c174fa8c3383`.

Across eight rigorous scientific validation tasks (Tasks 1–8), every core subsystem—deepfake acoustic detection, speaker verification, replay attack detection, multilingual Indic speech transfer, automatic speech recognition (ASR), calibration & uncertainty, and channel/noise robustness—was audited against empirical data:

* **Task 1 — Production Baseline Scientific Audit**: Established the cryptographic identity, neural architecture, and benchmark vulnerability profile of the frozen production acoustic model `robust_mini_acoustic_cnn_v1` on the held-out ASVspoof 2021 DF evaluation benchmark ($N = 300$, balanced $1:1$, 13 unseen vocoders A07–A19 across 9 unseen speakers). Clean C0 discrimination was verified at $0.8733$ ROC-AUC, alongside severe vulnerabilities under telephone bandpass ($77.33\%$ FPR) and additive noise ($92.00\%$ FPR).
* **Task 2 — Deepfake Detection Robustness Validation**: Executed 6 controlled experimental investigations (**EXP-2C-CAL**, **EXP-2C-GATE**, **EXP-2A-ABL**, **EXP-2B-NOISE**, **EXP-2B-SW**, and **EXP-2D-FUSE**). Demonstrates that while targeted interventions can alter operating points, every retrained or augmented candidate introduced severe collateral damage (e.g. recall collapse or exploded clean false alarms). None demonstrated a statistically defensible improvement to justify production replacement.
* **Task 3 — Speaker Verification Validation**: Audited the speaker verification subsystem. Confirmed that the intended neural model (`ecapa_tdnn.onnx`) is absent from disk and that execution defaults to a deterministic DSP fallback. In the absence of genuine/impostor trial pairs or empirical FAR/FRR/EER evaluation, speaker verification is **NOT READY**.
* **Task 4 — Replay Attack Validation**: Confirmed that zero physical replay recordings exist locally and that the active replay detector is a deterministic 3-cue DSP heuristic assigning hardcoded probability constants. Testing on authentic mobile speech yielded a $100\%$ false-alarm rate ($25/25$ genuine Hindi calls flagged as replay). Replay detection is **NOT READY**.
* **Task 5 — Indic-Language Validation**: Evaluated cross-lingual transfer on authentic Indian speech across Hindi, Telugu, Tamil, Marathi, and Bengali. Supported **PARTIALLY** for bona-fide false-alarm transfer on Hindi, Telugu, and Tamil ($25$ samples each), but **NOT VERIFIED** for Indic synthetic/deepfake detection (0 synthetic Indic samples exist), replay, or physical telephony.
* **Task 6 — FasterWhisper Base INT8 ASR Validation**: Verified that while CTranslate2 INT8 model files are staged on disk with verified checksums, runtime dependencies (`faster_whisper`, `ctranslate2`) are uninstalled, forcing DSP fallback. Downstream security intent matching is rule-based regex without empirical accuracy metrics. ASR is **NOT READY** and is strictly treated as untrusted advisory input.
* **Task 7 — Calibration & Uncertainty Validation**: Established that model sigmoid outputs are uncalibrated raw scores, not empirical probabilities. Zero ECE, MCE, Brier score, or reliability diagrams exist. Abstention states (`INCONCLUSIVE`, `POOR_QUALITY`) function as engineering safety policies, not calibrated uncertainties. Calibration is **NOT READY**.
* **Task 8 — Telephony / Codec / Noise Robustness Validation**: Confirmed that digital G.711 companding (μ-law, A-law) and 8 kHz resampling are **PARTIALLY SUPPORTED** under software simulation, but telephone bandpass ($77.33\%$ FPR) and additive noise ($88.00\%\text{--}93.33\%$ FPR) are **NOT READY**. Packet loss, clipping, lossy compression (AMR/Opus), and real carrier telephony are **NOT VERIFIED**.

Throughout all investigations, the protected production checkpoint remained strictly read-only and bitwise unchanged:
`B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`

**Overall Scientific Recommendation**: Retain the frozen production acoustic model `robust_mini_acoustic_cnn_v1`. Prohibit claims of production readiness for unverified subsystems. Operational safety relies on conservative operating thresholds and fail-safe abstention policies.

---

## Task 1 — Production Baseline Scientific Audit

### 1.1 Protected Baseline Identity
* **Model Identifier**: `robust_mini_acoustic_cnn_v1`
* **Architecture**: `MiniAcousticCNN` (2-Channel Spectrogram Input: 60-bin Log-Mel + 60-bin LFCC; 4 Convolutional Blocks with BatchNorm, ReLU, and MaxPool; Adaptive Average Pooling; Dropout $p=0.30$; Linear Classifier)
* **Parameter Count**: $93{,}442$ parameters ($373{,}768$ weights/biases in float32)
* **Protected Checkpoint File**: [ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt](file:///d:/sih_hackathon/sih104/ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt)
* **Checkpoint File Size**: $382{,}217\text{ bytes}$
* **Cryptographic Checksum (SHA-256)**:
  `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
* **Runtime Framework**: PyTorch CPU (`torch`), deterministic single/multi-thread execution
* **Production Status**: Active primary model loaded by [DeepfakeAcousticModel](file:///d:/sih_hackathon/sih104/ai/app/deepfake/model.py#L31) and registered in [ModelRegistry](file:///d:/sih_hackathon/sih104/ai/app/core/model_registry.py#L16).

### 1.2 Baseline Evaluation Across Conditions C0–C5
The baseline model was benchmarked on the authoritative held-out unseen-attack evaluation manifest ([ai/neural_prototype/results/unseen_attack_eval_manifest.parquet](file:///d:/sih_hackathon/sih104/ai/neural_prototype/results/unseen_attack_eval_manifest.parquet)) consisting of $300$ balanced samples ($150$ bona fide / $150$ spoof) from ASVspoof 2019 algorithms A07–A19 across $9$ unseen speakers, evaluated at fixed production threshold $\theta = 0.50$:

| Condition | Description | Accuracy | Precision | Recall | F1 Score | ROC-AUC | FPR | FNR | EER | EER Thresh | Confusion (TP/TN/FP/FN) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C0** | Clean 16 kHz Reference | **81.33%** | **85.61%** | **75.33%** | **0.8014** | **0.8733** | **12.67%** | **24.67%** | **22.67%** | 0.4477 | 113 / 131 / 19 / 37 |
| **C1** | 8 kHz Round-Trip Resampling | 65.33% | 61.98% | 79.33% | 0.6959 | 0.7187 | **48.67%** | 20.67% | 35.33% | 0.5711 | 119 / 77 / 73 / 31 |
| **C2** | G.711 $\mu$-law Compression | 71.67% | 69.70% | 76.67% | 0.7302 | 0.7849 | 33.33% | 23.33% | 29.33% | 0.5335 | 115 / 100 / 50 / 35 |
| **C3** | G.711 A-law Compression | 70.67% | 67.82% | 78.67% | 0.7284 | 0.7702 | 37.33% | 21.33% | 31.33% | 0.5485 | 118 / 94 / 56 / 32 |
| **C4** | Telephone Bandpass (300–3400 Hz) | 53.33% | 52.07% | 84.00% | 0.6429 | 0.6119 | **77.33%** | 16.00% | **44.33%** | 0.6676 | 126 / 34 / 116 / 24 |
| **C5** | Additive Noise (15 dB SNR) | 52.00% | 51.06% | 96.00% | 0.6667 | **0.5544** | **92.00%** | 4.00% | 46.67% | 0.7488 | 144 / 12 / 138 / 6 |

---

## Task 2 — Deepfake Detection Robustness Validation

### 1. Protected Baseline
* **Model Identity**: `robust_mini_acoustic_cnn_v1`
* **Checkpoint Path**: [ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt](file:///d:/sih_hackathon/sih104/ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt)
* **SHA-256 Checksum**: `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
* **Architecture**: 2-channel `MiniAcousticCNN`, $93{,}442$ parameters.
* **Integrity Invariant**: Throughout all 6 Task 2 experiments, this protected checkpoint remained strictly read-only and bitwise unchanged. No retraining, replacement, or modification of the production model weights was performed.

### 2. Dataset & Evaluation Methodology
* **Source-Disjoint Validation Design**:
  To protect against data snooping and circular optimization, model selection, hyperparameter tuning, score normalization, quality gate parameter verification, and fusion weights were derived exclusively from the **source-disjoint clean validation split** (`val_clean` from [train_val_manifest.parquet](file:///d:/sih_hackathon/sih104/ai/neural_prototype/results/train_val_manifest.parquet), $140$ samples, $70$ bona / $70$ spoof).
* **Held-Out Unseen-Attack Test Set**:
  Final evaluations were conducted on the frozen benchmark test set:
  - Total Samples: Exactly $300$ held-out audio files.
  - Class Distribution: Exactly balanced ($150$ bona fide human speech, $150$ deepfake spoof speech).
  - Unseen Attacks: Exclusively ASVspoof 2019 algorithms **A07 through A19** (neural vocoders, waveform concatenation, source-filter vocoders, Griffin-Lim, WaveNet).
  - Speaker Disjointness: $9$ held-out speakers with zero overlap with training or validation partitions.
  - Attack Disjointness: Zero overlap between training attack types and evaluation attack systems.
* **Simulated Channel Conditions (C0–C5)**:
  Every utterance was evaluated across $6$ conditions ($1{,}800$ total evaluation trials per candidate system):
  - **C0**: Clean linear PCM reference ($16\text{ kHz}$).
  - **C1**: $8\text{ kHz}$ round-trip downsampling and upsampling.
  - **C2**: ITU-T G.711 $\mu$-law 8-bit companding round-trip.
  - **C3**: ITU-T G.711 A-law 8-bit companding round-trip.
  - **C4**: 8th-order Chebyshev Type I telephone bandpass filter ($300\text{--}3400\text{ Hz}$).
  - **C5**: Additive stationary white Gaussian noise at $15\text{ dB SNR}$.
* **Threshold Separation**:
  - Baseline production threshold is fixed at $\theta = 0.50$.
  - In experimental conditions, any alternative threshold was selected exclusively on validation data; held-out test data was used solely for final scoring.

### 3. Baseline Vulnerabilities
The authoritative held-out benchmark revealed critical failure modes in the baseline model under acoustic channel mismatch:
1. **C4 Telephone Bandpass Vulnerability**: False Positive Rate of **$77.33\%$** and Equal Error Rate of **$44.33\%$**. Over three out of four genuine telephone callers are falsely flagged as synthetic deepfakes.
2. **C5 Additive Gaussian Noise Vulnerability**: False Positive Rate of **$92.00\%$** and ROC-AUC of **$0.5544$**. The model's discriminative ability under $15\text{ dB}$ noise is effectively destroyed, collapsing to near random guessing.
3. **C1 8 kHz Telephony Vulnerability**: False Positive Rate of **$48.67\%$** ($1$ in $2$ genuine callers falsely flagged).
4. **C0 Clean Reference Performance**: F1 score of **$0.8014$**, Recall of **$75.33\%$**, and False Positive Rate of **$12.67\%$**.

---

### 4. Experiment Summary Table

| Experiment ID | Primary Intervention | Empirical Result on Held-Out Test Set | Scientific Verdict | Production Integration Decision |
| :--- | :--- | :--- | :---: | :---: |
| **EXP-2C-CAL** | Validation-Calibrated Operating Thresholds (Policies B, C, D) | Elevating threshold (e.g. $\theta = 0.795$) reduced C4 FPR from $77.33\%$ to $28.67\%$, but caused severe clean recall collapse ($75.33\% \to 34.67\%$). Underlying discrimination (ROC-AUC) was unchanged. | **PARTIALLY SUPPORTED** | **DO NOT INTEGRATE**<br>(Retain baseline fixed threshold $\theta = 0.50$) |
| **EXP-2C-GATE** | Signal Quality Gating via `AudioQualityEngine` (POOR gate) | The POOR-quality gate failed to trigger on any synthetic C0–C5 evaluation sample ($100\%$ coverage, $0$ rejected). Reductions in full-pipeline FPR were boundary hysteresis artifacts. | **NOT SUPPORTED** | **DO NOT INTEGRATE**<br>(Retain quality gate for sanity, not robustness) |
| **EXP-2A-ABL** | Systematic Augmentation Ablation (Models A–F) | Companding models (B & C) improved channel-matched C2/C3 F1 ($0.7589$ vs $0.7302$), but lacked balanced cross-condition gains. Bandpass and noise models severely damaged clean accuracy. | **PARTIALLY SUPPORTED** | **DO NOT INTEGRATE**<br>(Retain protected baseline Model F recipe) |
| **EXP-2B-NOISE** | Multi-SNR Gaussian Noise Augmentation ($10, 15, 20, 25\text{ dB}$) | Adding noise augmentation destroyed clean and telephony discrimination across all SNR levels. Clean FPR exploded to $56.0\%\text{--}98.7\%$. | **NOT SUPPORTED** | **DO NOT INTEGRATE**<br>(Do not add Gaussian noise to primary training) |
| **EXP-2B-SW** | Short-Window Robustness Profiling ($0.3\text{ s}\text{--}3.0\text{ s}$) | Inputs $\le 500\text{ ms}$ suffered catastrophic recall collapse ($>65\%$ attacks missed). Zero computational latency benefit due to fixed zero-padding. 3.0 s/full audio was the strongest tested operating point. | **PROFILED** | **DO NOT IMPLEMENT YET**<br>(Retain current inference buffer size) |
| **EXP-2D-FUSE** | CNN + Deterministic DSP Score Fusion (Linear & Logistic) | DSP features suffered severe channel/noise conflation. Apparent C4 FPR drops resulted from score compression with $25.3$ pp recall collapse. C5 noise drove AUC to $0.4791$. Latency doubled. | **NOT SUPPORTED** | **DO NOT INTEGRATE**<br>(Keep production CNN standalone) |

---

### 5. Detailed Scientific Findings

#### A. Calibration (EXP-2C-CAL)
* **Finding**: Post-hoc threshold calibration on validation data (e.g. Policy B: $\theta = 0.795$; Policy C: $\theta_{\text{clean}} = 0.45, \theta_{\text{telephony}} = 0.70$) effectively reduces false positive rates on degraded conditions (C4 FPR drops from $77.33\%$ to $28.67\%$; C5 FPR drops from $92.00\%$ to $40.67\%$).
* **Trade-off**: Shifting the threshold simply moves along the receiver operating characteristic curve without improving the classifier's underlying separability. At $\theta = 0.795$, clean C0 recall drops from $75.33\%$ to $34.67\%$ ($\text{FNR} = 65.33\%$, F1 collapses from $0.8014$ to $0.5073$). Under C4, recall drops from $84.00\%$ to $44.00\%$.
* **Conclusion**: Calibration cannot substitute for feature discriminability. It is **PARTIALLY SUPPORTED** as an operational tuning tool, but does not justify replacing the baseline model.

#### B. Quality Gating (EXP-2C-GATE)
* **Finding**: Evaluating the existing `AudioQualityEngine` POOR-quality gate (SNR $<10\text{ dB}$, clipping $>1.0\%$, bandwidth $<1500\text{ Hz}$) on the $300$-sample test set across C0–C5 revealed that the gate did **not trigger on a single sample** ($0$ samples classified as POOR; coverage was $100.0\%$).
* **Diagnostic**: Additive white Gaussian noise at $15\text{ dB SNR}$ remains above the $10\text{ dB}$ rejection boundary. Telephone bandpass audio centered around $2100\text{ Hz}$ exceeds the $1500\text{ Hz}$ spectral centroid cutoff. Apparent false positive drops observed in complex multi-step pipelines resulted from boundary hysteresis and intermediate state re-routing, not true acoustic rejection.
* **Conclusion**: **NOT SUPPORTED** as a deepfake robustness mechanism.

#### C. Augmentation Ablation (EXP-2A-ABL)
* **Finding**: Training dedicated single-augmentation models revealed distinct channel behaviors:
  - Companding-only models (Model B A-law and Model C $\mu$-law) yielded modest performance gains under matched codec compression (Model C achieved C2 F1 of $0.7589$ vs baseline $0.7302$).
  - Bandpass augmentation (Model D) degraded clean C0 accuracy from $81.33\%$ down to $63.33\%$.
  - Single-condition noise augmentation (Model E, $15\text{ dB}$) caused catastrophic false-alarm explosion across all clean and telephony conditions (C0 FPR: $74.00\%$, C1 FPR: $87.33\%$, C2 FPR: $84.67\%$).
* **Conclusion**: Model F provides a combined-augmentation reference point, but the experiment does not provide sufficient evidence for production replacement. **PARTIALLY SUPPORTED** for insight, but no candidate model outperformed the protected baseline.

#### D. Multi-SNR Gaussian Noise (EXP-2B-NOISE)
* **Finding**: Training candidate models across a spectrum of noise augmentations ($10\text{ dB}, 15\text{ dB}, 20\text{ dB}, 25\text{ dB SNR}$) demonstrated that simple stationary Gaussian noise injection is fundamentally detrimental to the `MiniAcousticCNN` architecture.
* **Diagnostic**: Across all tested SNRs, the trained models learned to treat stationary noise energy as speech signal, severely disrupting spectral representations. Clean C0 FPR exploded ($10\text{ dB}$: $98.67\%$; $15\text{ dB}$: $82.00\%$; $20\text{ dB}$: $98.67\%$; $25\text{ dB}$: $56.00\%$). Telephony conditions suffered similar degradation.
* **Conclusion**: **NOT SUPPORTED**. Additive Gaussian noise must not be integrated into the primary training pipeline.

#### E. Short-Window Robustness (EXP-2B-SW)
* **Finding**: Profiling prefix window constraints ($300\text{ ms}, 500\text{ ms}, 1.0\text{ s}, 1.5\text{ s}, 2.0\text{ s}, 3.0\text{ s}$, and Full Audio) demonstrated severe performance penalties at short durations:
  - At $\le 500\text{ ms}$, the model suffers catastrophic recall collapse (C0 recall drops to $34.67\%$ at $300\text{ ms}$ and $33.33\%$ at $500\text{ ms}$; over $65\%$ of attacks bypass detection).
  - Intermediate windows ($1.5\text{ s}\text{--}2.0\text{ s}$) induce artificial false-positive spikes (C0 FPR explodes to $83.33\%$ at $1.5\text{ s}$) due to convolutional edge responses at the silence-padding boundary.
  - At $1.0\text{ s}$, recall recovers to $77.33\%$, but FPR remains elevated ($37.33\%$).
  - Mean CPU inference latency is completely invariant across window durations ($\approx 7.8\text{--}10.1\text{ ms}$) because `TwoChannelSpectrogramExtractor` zero-pads all waveforms to $48{,}000$ samples.
* **Conclusion**: **PROFILED**. 3.0 s/full audio was the strongest tested operating point. No production code changes should be implemented from this profiling alone.

#### F. CNN + DSP Score Fusion (EXP-2D-FUSE)
* **Finding**: Combining deterministic DSP indicators (Wiener spectral flatness, high-frequency energy ratio, temporal variance, vocoder phase distortion/jitter) with the CNN classifier failed to improve discriminative ability:
  - In linear fusion (`SYS4`), apparent C4 FPR reduction ($77.33\% \to 45.33\%$) was accompanied by a severe **$25.33$ pp collapse in Recall** ($84.00\% \to 58.67\%$) and an unchanged ROC-AUC ($0.6120$ vs $0.6119$).
  - In calibrated linear fusion (`SYS5`), C4 FPR worsened to **$92.67\%$**, and C5 noise ROC-AUC collapsed to **$0.4791$** (worse than random guessing).
  - Logistic fusion (`SYS6`) crushed C5 recall to **$6.00\%$** ($\text{FNR} = 94.00\%$) and clean C0 recall to **$44.67\%$**.
  - Total inference latency doubled from $7.9\text{ ms}$ to $15.8\text{ ms}$ due to dual feature extraction passes.
* **Conclusion**: **NOT SUPPORTED**. The production CNN must remain standalone.

---

### 6. Overall Task 2 Conclusion

> [!IMPORTANT]
> **Definitive Scientific Conclusion**:  
> **"Task 2 robustness validation is COMPLETE as an evidence-generation exercise. The evaluated interventions do not provide sufficient balanced evidence to replace `robust_mini_acoustic_cnn_v1`. The protected production checkpoint should remain unchanged. The experiments identify important failure modes—especially telephone-band and additive-noise false positives—but do not establish a validated replacement model."**

Key Scientific Principles Reaffirmed:
1. **Scientific Success Does Not Require Model Replacement**: Validating that hypothesized interventions fail or introduce unacceptable trade-offs is a rigorous, essential scientific outcome that protects production systems from degraded regressions.
2. **Negative Experiments Are Valid Scientific Evidence**: Documenting that noise augmentation, DSP score fusion, and aggressive threshold shifts harm detection fidelity prevents costly, erroneous production deployments.
3. **Synthetic Limitations**: Synthetic digital C1–C5 transformations do **not** establish real-world telephony, physical acoustic replay, room reverberation, microphone response, or cellular carrier robustness claims.
4. **Zero Production Justification**: No candidate model, threshold shift, or fusion architecture evaluated in Task 2 justifies altering the frozen production baseline.

---

### 7. Limitations & Empirical Disclosures

To preserve strict scientific integrity, the following experimental boundaries are documented:
1. **Held-Out Test Sample Size**: The held-out benchmark consists of $300$ samples ($150$ bona fide / $150$ spoof). While balanced and source-disjoint across $9$ speakers and $13$ unseen attacks, sample variance across sub-conditions (e.g. single speaker subgroups) is unmodeled.
2. **Deterministic Digital Transforms**: C1–C5 conditions are software-generated DSP simulations. They do not incorporate non-linear telephone speaker distortion, acoustic reflections, transducer clipping, or VoIP packet dropouts.
3. **No Physical Replay Validation**: No physical over-the-air playback or re-recording datasets were evaluated in Task 2.
4. **No Real Carrier/VoIP Verification**: Performance under live cellular (AMR/EVS) or carrier networks was not tested.
5. **Single-Run Training Realism**: Retrained candidate checkpoints in EXP-2A and EXP-2B represent controlled single-seed runs ($seed=42$) designed for relative comparison, not multi-seed ensemble bounds.
6. **Report Consistency**: In earlier scratch exploratory notes, qualitative narrative statements speculated that quality gating or thresholding could resolve C4/C5 vulnerabilities; authoritative measured evaluation tables conclusively disproved these speculations. The numerical metrics in Section 3 and Section 4 represent the sole ground-truth evidence.

---

### 8. Definitive Production Decision Table

| Subsystem Component | Production Decision | Authoritative Rationale |
| :--- | :---: | :--- |
| **Current Production Model** | **RETAIN** | `robust_mini_acoustic_cnn_v1` remains the most balanced standalone architecture evaluated. |
| **Protected Checkpoint** | **RETAIN** | Checkpoint `best_robust_mini_acoustic_cnn.pt` remains unchanged and bitwise verified. |
| **CNN + DSP Score Fusion** | **DO NOT INTEGRATE** | Fails to improve discrimination, halves inference throughput, and collapses degraded recall. |
| **Gaussian Noise Augmentation** | **DO NOT INTEGRATE** | Degrades clean and telephony acoustic representations across all evaluated SNR levels. |
| **Quality Gate Robustness Change** | **DO NOT INTEGRATE** | Existing POOR gate does not trigger on C1–C5 degradation; cannot serve as a robustness filter. |
| **Short-Window Production Guards** | **DO NOT IMPLEMENT YET** | Short-window profiling established failure points, but guard-rail changes require dedicated review. |
| **Operating Threshold Adjustments** | **DO NOT PROMOTE** | Shifting thresholds based on test-set C4/C5 tuning causes unacceptable clean recall collapse. |
| **Future Model Retraining** | **DEFERRED** | Any future training requires a newly approved architectural hypothesis and validation protocol. |

---

### 9. Reproducibility & Cryptographic Verification

* **Git Branch**: `feature/bhavya-premium-ai`
* **Working Tree State**: Clean (`git status --short` confirms zero modifications to production code, checkpoints, manifests, or tests)
* **Protected Checkpoint Path**: `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`
* **Verified SHA-256 Checksum**:
  `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
* **Supporting Detailed Experiment Reports**:
  - Task 2 Calibration: [exp_2c_gate_results.json](file:///d:/sih_hackathon/sih104/scratch/exp_2c_gate_results.json)
  - Task 2 Quality Gating: [exp_2c_gate_results.json](file:///d:/sih_hackathon/sih104/scratch/exp_2c_gate_results.json)
  - Task 2 Augmentation Ablation: [exp_2a_augmentation_ablation_report.md](file:///d:/sih_hackathon/sih104/docs/ai/exp_2a_augmentation_ablation_report.md)
  - Task 2 Multi-SNR Noise Robustness: [exp_2b_noise_robustness_report.md](file:///d:/sih_hackathon/sih104/docs/ai/exp_2b_noise_robustness_report.md)
  - Task 2 Short-Window Profiling: [exp_2b_short_window_report.md](file:///d:/sih_hackathon/sih104/docs/ai/exp_2b_short_window_report.md)
  - Task 2 CNN+DSP Score Fusion: [exp_2d_fusion_report.md](file:///d:/sih_hackathon/sih104/docs/ai/exp_2d_fusion_report.md)

---

## Task 3 — Speaker Verification Validation

### 1. Scientific Readiness Verdict

```
===================================================================================================
                                      SCIENTIFIC VERDICT
===================================================================================================
                                           NOT READY
===================================================================================================
1. No authentic neural speaker verification model or checkpoint exists on disk.
2. The active production execution path is an untrained deterministic DSP random projection.
3. No speaker verification evaluation protocol, trial manifest, or target/impostor pairs exist.
4. No biometric error metrics (FAR, FRR, TAR, EER) have been measured or verified.
===================================================================================================
```

### 2. Verified Repository Architecture & Implementation Scaffolding
* **Scaffolding Location**: Core speaker verification interfaces and logic reside under [ai/app/speaker/](file:///d:/sih_hackathon/sih104/ai/app/speaker/):
  - [SpeakerEmbeddingExtractor](file:///d:/sih_hackathon/sih104/ai/app/speaker/embedding.py): Dual-engine extractor designed to target ONNX Runtime with automatic fallback to DSP.
  - [SpeakerSimilarityMatcher](file:///d:/sih_hackathon/sih104/ai/app/speaker/similarity.py): Spherical cosine similarity computation with decision confidence margin scaling.
  - [SpeakerEnrollmentManager](file:///d:/sih_hackathon/sih104/ai/app/speaker/enrollment.py): Multi-utterance enrollment validation, quality pre-screening, and anti-spoof gating.
  - [SpeakerVerifier](file:///d:/sih_hackathon/sih104/ai/app/speaker/verifier.py): High-level orchestrator returning structured `SpeakerVerificationResult`.
  - [types.py](file:///d:/sih_hackathon/sih104/ai/app/speaker/types.py): Data contracts for embeddings and validation outcomes.

### 3. Intended Neural Path & Absent Checkpoint
* **Intended Model Path**: `ai/models/speaker/ecapa_tdnn.onnx`
* **Model Checkpoint Status**: **ABSENT FROM DISK** (0 bytes / file missing).
* **Target Intended Architecture**: SpeechBrain ECAPA-TDNN (192-dimensional embedding, ~84.1 MB, claimed target SHA-256: `2ef890f0212dbeb5684622c42c03b4df80ef4cc171da004d2ec754247a3cf3f9`).
* **Registry Status**: [ModelRegistry](file:///d:/sih_hackathon/sih104/ai/app/core/model_registry.py) explicitly records `speaker_ecapa_tdnn_v1` as `PipelineStatus.NOT_AVAILABLE` with the limitation: *"BLOCKED: The genuine SpeechBrain ECAPA-TDNN ONNX model artifact is not currently present on disk."*

### 4. Absence of Alternative Neural Speaker Checkpoints
An exhaustive inventory of the workspace confirmed that **zero** alternative trained neural speaker verification checkpoints or weights exist locally. Specifically, no weights or models were found for:
* x-vector (TDNN / Kaldi)
* ResNet speaker models (e.g. ResNet-34 / FastResNet)
* WavLM
* WeSpeaker
* PyAnnote
* Any other equivalent learned neural speaker embedding system.

### 5. Active Deterministic DSP Fallback
Because the neural ONNX checkpoint is absent, the system automatically routes 100% of execution to the mathematical fallback in `SpeakerEmbeddingExtractor._extract_dsp_fallback`:
* **Acoustic Transform**: Short-Time Fourier Transform (STFT) with frame size $400$ ($25\text{ ms}$ at 16 kHz), hop size $160$ ($10\text{ ms}$), and Hamming window.
* **Filterbank Aggregation**: Linearly divides the power spectrum into $64$ uniform sub-bands.
* **Temporal Statistics**: Computes $\text{mean} + 0.5 \cdot \text{std}$ across all temporal frames ($1 \times 64$).
* **Random Projection**: Multiplies the pooled 64-dimensional vector by a fixed pseudorandom matrix ($\mathbf{W}_{\text{proj}} \in \mathbb{R}^{64 \times 128}$, generated via static seed `np.random.seed(42)`), followed by $\tanh$ activation.
* **Normalization**: L2 spherical unit normalization to produce a 128-dimensional output vector.

> [!CAUTION]
> **Explicit Scientific Disclosure**:  
> **"The active fallback is an untrained deterministic mathematical projection and is not ECAPA-TDNN, neural speaker verification, or a trained speaker embedding model."**

### 6. Production Wiring vs. Scientific Validation
* **Production Code Paths**:
  - `AudioStreamPipeline.process_acoustic_intelligence` ([stream_pipeline.py](file:///d:/sih_hackathon/sih104/ai/app/audio/stream_pipeline.py#L102)) invokes `self.speaker.verify_speaker(...)`.
  - In `TemporalAggregator.aggregate_overall_assessment` ([temporal_aggregator.py](file:///d:/sih_hackathon/sih104/ai/app/audio/temporal_aggregator.py#L101)), `speaker_status == SpeakerVerificationStatus.MISMATCH` feeds into the overall acoustic assessment.
  - HTTP endpoints exist in [ai/app/main.py](file:///d:/sih_hackathon/sih104/ai/app/main.py) (`POST /v1/speaker/enroll`, `GET /v1/speakers`, `GET /v1/speaker/{id}`, `DELETE /v1/speaker/{id}`, `POST /v1/audio/verify-speaker`) and [backend/src/speaker/speaker.service.ts](file:///d:/sih_hackathon/sih104/backend/src/speaker/speaker.service.ts).
* **Scientific Reality**: The existence of API routes and pipeline wiring constitutes **software plumbing only**. It does **not** constitute scientifically validated speaker verification.

### 7. In-Memory Enrollment & Synthetic Test Profiles
* **Profile Storage**: Enrolled profiles are stored exclusively in an ephemeral, in-memory Python dictionary (`SpeakerEnrollmentManager._profiles`). Profiles are non-persistent and discarded on process restart.
* **Hardcoded Seed Profile**: The system pre-seeds a default demonstration profile for `"speaker-cfo-001"` (Eleanor Vance) synthesized from pure mathematical sine waves ($450\text{ Hz} + 900\text{ Hz}$).
* **Integrity Assertion**: Hardcoded synthetic tone profiles and in-memory caches must **not** be presented as real biometric enrollment evidence.

### 8. Dataset Evidence Audit
* **IndicVoices Dataset Manifest ([datasets/metadata/dataset_manifest_split.csv](file:///d:/sih_hackathon/sih104/datasets/metadata/dataset_manifest_split.csv))**:
  - Contains $22{,}751$ metadata rows across $2{,}075$ speaker IDs.
  - **Empirical Reality**: **0 audio files exist on disk** (`datasets/raw/` is empty in the audited workspace). This is a metadata-only manifest.
* **ASVspoof 2021 Evaluation Manifest ([ai/neural_prototype/results/unseen_attack_eval_manifest.parquet](file:///d:/sih_hackathon/sih104/ai/neural_prototype/results/unseen_attack_eval_manifest.parquet))**:
  - Contains $300$ verified audio files on disk across $9$ speakers.
  - **Empirical Reality**: This dataset was curated strictly as an **anti-spoof / deepfake countermeasure benchmark** ($150$ bona fide vs $150$ synthesis attacks). It is **not** a speaker-verification trial protocol.
* **Trial Protocol Absence**:
  - **Zero** verified speaker enrollment/trial manifests exist in the repository.
  - **Zero** genuine (target) and impostor (non-target) trial pairs are defined.

### 9. Evaluation Evidence Audit
* **Biometric Metrics**:
  - **False Acceptance Rate (FAR)**: **NOT VERIFIED** (No empirical measurement performed)
  - **False Rejection Rate (FRR)**: **NOT VERIFIED** (No empirical measurement performed)
  - **True Acceptance Rate (TAR)**: **NOT VERIFIED** (No empirical measurement performed)
  - **Equal Error Rate (EER)**: **NOT VERIFIED** (No empirical measurement performed)
* **Threshold Reality**:
  - No empirically calibrated speaker-verification operating threshold exists.
  - Threshold values in the codebase ($\tau = 0.70$ for DSP fallback; $\tau = 0.88$ for neural) are **code-level heuristic values**, not scientifically validated operating points derived from ROC or DET analysis.

### 10. Unit Test Scope
* Automated unit tests in [ai/tests/test_speaker_verifier.py](file:///d:/sih_hackathon/sih104/ai/tests/test_speaker_verifier.py) use synthetic sinusoidal pure tones (`generate_speaker_tone` at $220\text{ Hz}$ vs $550\text{ Hz}$) to exercise code branches, error handlers, mock anti-spoof screening, and fallback mechanics.
* **Integrity Assertion**: Synthetic tone unit tests verify software execution plumbing; they do **not** establish biometric speaker-verification accuracy, separability, or error rates.

### 11. Minimum Prerequisites for Production Integration
Before any speaker verification capability can be scientifically claimed or integrated into production, the following evidence package must be established:
1. **Authentic Model Checkpoint**: Physical staging of a genuine, pre-trained speaker embedding model (e.g. SpeechBrain ECAPA-TDNN ONNX or TorchScript) with verified cryptographic SHA-256 and parameter provenance.
2. **Standard Biometric Trial Protocol**: An established speaker-disjoint enrollment and trial evaluation benchmark physically present on disk.
3. **Paired Genuine & Impostor Trials**: Explicitly labeled target (same-speaker) and non-target (different-speaker) trial pairs with zero training-speaker overlap.
4. **Biometric Error Metrics**: Rigorous empirical measurement of FAR, FRR, TAR, and EER.
5. **Calibrated Operating Threshold**: A validation-selected operating threshold ($\tau$) calibrated to a target FAR/FRR trade-off.
6. **Channel & Noise Robustness**: Benchmarked performance under telephony bandpass (C4) and additive noise (C5) conditions.
7. **Reproducible Evaluation Artifact**: Version-controlled evaluation scripts and serialized results reports.

### 12. Definitive Production Decision

| Subsystem Component | Production Decision | Authoritative Rationale |
| :--- | :---: | :--- |
| **Speaker Verification Capability** | **DO NOT CLAIM AS SCIENTIFICALLY VALIDATED** | No biometric evaluation benchmark, trial protocol, or error metrics exist. |
| **Speaker Verification Neural Model** | **DO NOT INTEGRATE** | No neural speaker embedding weights or checkpoints exist on disk. |
| **Deterministic DSP Fallback** | **RETAIN ONLY AS SOFTWARE FALLBACK/SCAFFOLDING** | Retain strictly as functional software plumbing; **NOT** as a validated biometric model. |
| **ECAPA-TDNN Integration** | **BLOCKED** | Blocked until authentic weights and empirical evaluation evidence are staged. |

### 13. Scientific Conclusion

> [!IMPORTANT]
> **Conclusion**:  
> Concluding that speaker verification is **NOT READY** is a completely valid, rigorous scientific outcome. It protects the production system from unvalidated claims and ensures that an untrained random-projection DSP heuristic is never misrepresented as an authentic biometric security control. No production replacement or integration is justified from current evidence.

---

## Task 4 — Replay Attack Validation

### 1. Scientific Readiness Verdict

```
===================================================================================================
                                      SCIENTIFIC VERDICT
===================================================================================================
                                           NOT READY
===================================================================================================
1. Zero authentic physical replay attack datasets exist locally in the repository.
2. The active replay detection pipeline is an untrained deterministic DSP heuristic.
3. No trained replay model checkpoint, ONNX artifact, or learned weights exist.
4. No replay evaluation protocol, trial manifest, or genuine/replay benchmark exists.
5. All biometric presentation attack detection (PAD) error metrics (APCER, BPCER, ACER, EER)
   remain completely UNVERIFIED.
===================================================================================================
```

### 2. Physical Replay Dataset & Audio Inventory
* **Absence of Replay Audio**: No authentic physical replay corpus exists locally in the repository.
* **ASVspoof 2021 DF Reality**: Audio files located under `datasets/raw/asvspoof/` (`ASVspoof2021_DF_eval_part00` through `part03`, including the 300-sample held-out evaluation set) are exclusively **deepfake speech synthesis / voice conversion countermeasure data** (algorithms A07–A19). They contain **zero physical replay or Physical Access (PA) evidence**.
* **Absence of Replay Protocols**: No ASVspoof PA/replay audio, replay trial manifests, or genuine-vs-replay evaluation protocols exist locally.
* **Absence of Acoustic Variation**: No physical loudspeaker playback, room acoustic reverberation, microphone recapture, phone-playback, or device-disjoint replay recordings exist in the repository.

### 3. Replay-Specific Implementation Audit
Replay detection logic is defined under [ai/app/replay/](file:///d:/sih_hackathon/sih104/ai/app/replay/):
* **Deterministic DSP Feature Extractor ([features.py](file:///d:/sih_hackathon/sih104/ai/app/replay/features.py))**:
  `ReplayFeatureExtractor` extracts 5 fixed mathematical properties:
  1. `high_freq_cutoff_ratio`: Power ratio between high band ($\ge 4500\text{ Hz}$) and low band ($<3000\text{ Hz}$).
  2. `is_narrowband`: Boolean flag indicating whether high-band energy fraction is $<5\%$.
  3. `spectral_decay_slope`: First-degree polynomial fit of log-magnitude across log-frequencies.
  4. `reverberation_decay_time_ms`: Autocorrelation decay envelope threshold crossing ($<0.30$).
  5. `channel_impulse_distortion`: Normalized variance of cubic samples $\frac{\text{mean}((x^3)^2)}{(\text{var}(x))^3}$.
  *This module contains deterministic DSP features only. There are zero learned or trained representations.*
* **Deterministic Rule-Based Detector ([detector.py](file:///d:/sih_hackathon/sih104/ai/app/replay/detector.py))**:
  `ReplayDetector` is a deterministic rule-based heuristic that checks 3 hardcoded cue thresholds:
  - Spectral roll-off loss (`cutoff_ratio < 0.04` and `decay_slope < -2.8`, suppressed if `is_narrowband` is `True`)
  - Elevated reverberation decay (`reverberation_decay_time_ms > 120.0`)
  - Harmonic impulse distortion (`channel_impulse_distortion > 8.0`)
  Decisions assign fixed probability and confidence constants:
  - $\ge 2$ cues active $\to$ `status = ReplayStatus.REPLAY; replay_probability = 0.88; confidence = 0.80/0.85`
  - $1$ cue active $\to$ `status = ReplayStatus.LIKELY_REPLAY; replay_probability = 0.65; confidence = 0.55/0.60`
  - $0$ cues active $\to$ `status = ReplayStatus.NOT_REPLAY; replay_probability = 0.12; confidence = 0.70/0.82`

### 4. Model & Checkpoint Evidence
* **Missing Checkpoints**: No trained replay checkpoint, ONNX model, PyTorch weights, or learned replay weights exist on disk.
* **Model Registry Claim Verification**:
  In [ai/app/core/model_registry.py](file:///d:/sih_hackathon/sih104/ai/app/core/model_registry.py#L130), entry `replay_spectral_decay_v3` specifies `framework="NUMPY_DSP"` and a dummy repeated hash string (`c5912401...`).
  > [!NOTE]
  > The registry metadata claims a replay training dataset, but no corresponding replay dataset or trained replay weights were found locally; therefore the claim could not be substantiated.

### 5. Production Wiring vs. Scientific Validation
* **Production Integration**: Replay detection is actively wired into the streaming audio pipeline (`AudioStreamPipeline.process_acoustic_intelligence` in [stream_pipeline.py](file:///d:/sih_hackathon/sih104/ai/app/audio/stream_pipeline.py#L103)) and exposed via the REST API (`POST /v1/audio/detect-replay` in [ai/app/main.py](file:///d:/sih_hackathon/sih104/ai/app/main.py#L216)). Replay alarms feed into the temporal risk aggregator.
* **Scientific Reality**: This constitutes **software plumbing only** and does **not** constitute scientifically validated replay detection.

### 6. Evaluation Metrics Audit
Because no replay trial protocol or physical access benchmark exists in the repository, all presentation attack detection (PAD) and classification metrics are unmeasured:
* **False Positive Rate (FPR)**: **NOT VERIFIED**
* **False Negative Rate (FNR)**: **NOT VERIFIED**
* **Precision**: **NOT VERIFIED**
* **Recall**: **NOT VERIFIED**
* **F1 Score**: **NOT VERIFIED**
* **ROC-AUC**: **NOT VERIFIED**
* **Equal Error Rate (EER)**: **NOT VERIFIED**
* **APCER (Attack Presentation Classification Error Rate)**: **NOT VERIFIED**
* **BPCER (Bona Fide Presentation Classification Error Rate)**: **NOT VERIFIED**
* **ACER (Average Classification Error Rate)**: **NOT VERIFIED**

### 7. Physical Replay vs. Digital Channel Transformations
* Existing benchmark conditions C1–C5 (8 kHz resampling, G.711 $\mu$-law, G.711 A-law, telephone Chebyshev bandpass, and additive Gaussian noise) are **software-generated digital channel transforms**.
* Digital transforms alter spectral shape and quantization noise in software, but do not reproduce loudspeaker transducer dynamics, acoustic room reflections, multi-path propagation, or microphone recapture.
* **Explicit Invariant**: Existing C1–C5 digital transforms must **not** be described as physical replay evidence.

### 8. The 100% False-Positive Authentic Control Observation
* **Documented Finding**:
  In [docs/AI_ML_VALIDATION_STATUS.md](file:///d:/sih_hackathon/sih104/docs/AI_ML_VALIDATION_STATUS.md#L97-L102), cross-domain validation documented that:
  > *"25 out of 25 genuine Hindi mobile speech controls were classified as `LIKELY_REPLAY` (100% false positive rate)."*
* **Acoustic Reality**: This 100% false positive observation occurred on **genuine direct human mobile speech, NOT replay**. Legitimate mobile microphone roll-off was misinterpreted by the uncalibrated DSP heuristic as loudspeaker playback.
* **Subsequent Hardening Limitation**:
  In [docs/phase-3-step-3.4-replay-telephony-hardening.md](file:///d:/sih_hackathon/sih104/docs/phase-3-step-3.4-replay-telephony-hardening.md), logic was added to suppress spectral roll-off cues when narrowband telephony is detected. However, this hardening was verified **only against synthetic pure tones** in [ai/tests/test_replay_detector.py](file:///d:/sih_hackathon/sih104/ai/tests/test_replay_detector.py) and was **not validated against a physical replay corpus**.

### 9. Minimum Prerequisites for Replay Validation
Before replay detection can be claimed or integrated into production, the following evidence package is required:
1. **Authentic Physical Replay Corpus**: Physical audio recordings of live human speech replayed through physical loudspeakers in varied room acoustics and recaptured with diverse microphones.
2. **Genuine / Replay Ground Truth**: Paired trial manifests with unambiguous labels.
3. **Disjoint Protocols**: Speaker-, device-, room-, and microphone-aware splits as appropriate.
4. **Replay-Specific Evaluation Protocol**: Standardized trial execution scripts without circular tuning.
5. **PAD Biometric Metrics**: Rigorous reporting of APCER, BPCER, ACER, and/or EER and ROC curves.
6. **Empirical Threshold Calibration**: Scientifically derived thresholds optimized on validation trials.
7. **Reproducible Model/Checkpoint Provenance**: Cryptographically verified weights and training provenance if a trained neural or statistical model is proposed.

### 10. Definitive Production Decision

| Subsystem Component | Production Decision | Authoritative Rationale |
| :--- | :---: | :--- |
| **Replay Attack Detection Capability** | **DO NOT CLAIM AS SCIENTIFICALLY VALIDATED** | No physical replay dataset, trial protocol, or empirical PAD metrics exist. |
| **Neural Replay Model Integration** | **DO NOT INTEGRATE** | No trained replay model checkpoint or learned weights exist locally. |
| **Existing Replay Detection Code** | **RETAIN ONLY AS UNVALIDATED HEURISTIC/SCAFFOLDING** | Retain strictly as software plumbing; not as a validated defense mechanism. |
| **Physical Replay Robustness Claims** | **BLOCKED** | Blocked until authentic physical replay corpus and empirical PAD validation exist. |

### 11. Scientific Conclusion

> [!IMPORTANT]
> **Conclusion**:  
> Declaring replay attack validation as **NOT READY** is a completely valid, necessary scientific conclusion. It maintains strict truthfulness regarding system capabilities and prevents the deployment of an uncalibrated deterministic heuristic under the false presumption of physical biometric replay security.

---

## Task 5 — Indic-Language Validation

### 1. Overall Scientific Verdict

> [!IMPORTANT]
> **Authoritative Task 5 Verdict**:  
> **PARTIALLY SUPPORTED for bona-fide false-alarm transfer on Hindi/Telugu/Tamil;**  
> **NOT VERIFIED for Indic synthetic/deepfake detection, replay, or physical telephony robustness.**

- **English ASVspoof-DF benchmark detection**: **SUPPORTED for the evaluated held-out benchmark conditions** (evaluated on 300 held-out academic samples across 13 unseen synthesis algorithms A07–A19).
- **Hindi, Telugu, Tamil**: **PARTIALLY SUPPORTED** strictly for **bona-fide false-alarm transfer** on a 25-sample per language held-out control set. Synthetic/deepfake detection is **NOT VERIFIED** (0 synthetic samples exist).
- **Marathi, Bengali**: **NOT VERIFIED**. No local audio files, no metadata rows in the primary split manifest, and no empirical evaluation evidence exist locally.
- **Physical Acoustic Replay**: **NOT VERIFIED** for all six languages.
- **Physical Telephony Robustness**: **NOT VERIFIED** for all six languages.

---

### 2. Six-Language Evidence Summary Table

| Language | Audio Present Locally | Unique Speakers | Genuine (Bona Fide) | Synthetic (Deepfake) | Physical Replay | Noise / Telephony Evaluated | Two-Class Detection Metrics | Language-Specific Verdict |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Hindi (`hi`)** | **25** (embedded in Parquet) | 25 (eval) / 514 (manifest) | 25 | **0** | **0** (NOT VERIFIED) | Sim Telephony Policy Only | **NOT VERIFIED** (FPR only) | **PARTIALLY SUPPORTED** (Bona-Fide Control Only) |
| **Telugu (`te`)** | **25** (embedded in Parquet) | 25 (eval) / 327 (manifest) | 25 | **0** | **0** (NOT VERIFIED) | Sim Telephony Policy Only | **NOT VERIFIED** (FPR only) | **PARTIALLY SUPPORTED** (Bona-Fide Control Only) |
| **Tamil (`ta`)** | **25** (embedded in Parquet) | 25 (eval) / 553 (manifest) | 25 | **0** | **0** (NOT VERIFIED) | Sim Telephony Policy Only | **NOT VERIFIED** (FPR only) | **PARTIALLY SUPPORTED** (Bona-Fide Control Only) |
| **Marathi (`mr`)** | **0** | **0** | **0** | **0** | **0** (NOT VERIFIED) | **None** | **NOT VERIFIED** | **NOT VERIFIED** |
| **Bengali (`bn`)** | **0** | **0** | **0** | **0** | **0** (NOT VERIFIED) | **None** | **NOT VERIFIED** | **NOT VERIFIED** |
| **English (`en`)** | **325** (300 DF + 25 LibriSpeech) | 34 (9 DF test + 25 LibriSpeech) | 175 (150 DF + 25 LibriSpeech) | **150** (ASVspoof DF A07–A19) | **0** (NOT VERIFIED) | Software C1–C5, Multi-SNR | **SUPPORTED** (Acc 81.33%, AUC 0.8733) | **SUPPORTED** (ASVspoof-DF) / **NOT VERIFIED** (Replay) |

---

### 3. Dataset Inventory and Audio Availability Distinction

An essential scientific finding of this audit is distinguishing metadata entries from physical audio availability:
1. **AI4Bharat IndicVoices Manifest vs. Physical Audio**:
   - `datasets/metadata/dataset_manifest_split.csv` contains 22,751 metadata rows (Hindi: 5,530, Tamil: 5,276, Malayalam: 4,524, Kannada: 4,126, Telugu: 3,295; Marathi: 0, Bengali: 0, English: 0).
   - All 22,751 rows reference target file paths under `datasets/raw/indicvoices/` which do **not** exist as standalone WAV files on disk.
   - **Crucial Distinction**: The entire IndicVoices dataset is **not** locally available. Only isolated subset slices exist as embedded binary arrays within HuggingFace Parquet download archives (`datasets/indicvoices_download/`).
2. **Phase 3A Indic Bona-Fide Control Benchmark**:
   - Manifest path: `ai/neural_prototype/results/phase3a_commercial_indic/indic_bonafide_control_manifest.parquet` (100 rows).
   - Evaluated samples: Exactly 25 Hindi, 25 Telugu, 25 Tamil, and 25 English bona-fide recordings extracted from parquet downloads across 100 distinct speakers.
   - All 100 samples are bona fide (`label = 0`). **Zero synthetic/cloned Indic samples exist.**
3. **Marathi & Bengali Absence**:
   - Neither standalone WAV files nor parquet download archives exist for Marathi or Bengali. Both languages are **NOT VERIFIED**.

---

### 4. Genuine vs. Synthetic/Deepfake Evidence

* **Hindi, Telugu, Tamil**:
  - The evidence is strictly limited to bona-fide control samples and false-positive rate (FPR) transfer behavior.
  - These samples must **not** be represented as a two-class deepfake evaluation. Because 0 synthetic/deepfake Indic samples exist in the repository, True Positive Rate (Recall), Precision, F1 score, ROC-AUC, and EER **cannot be calculated or verified** for Indic deepfakes.
* **English ASVspoof-DF Benchmark**:
  - English ASVspoof-DF benchmark detection is **SUPPORTED for the evaluated held-out benchmark conditions** (300 samples, 150 bona fide vs. 150 spoof across unseen attack systems A07–A19).

---

### 5. Physical Replay and Telephony Evidence

1. **Physical Replay**:
   - **NOT VERIFIED for all six languages**.
   - Zero physical loudspeaker, room, phone-playback, or microphone-recapture recordings exist for Hindi, Telugu, Tamil, Marathi, Bengali, or English.
   - *Documented Negative Finding*: In cross-domain validation ([docs/AI_ML_VALIDATION_STATUS.md](file:///d:/sih_hackathon/sih104/docs/AI_ML_VALIDATION_STATUS.md#L97-L102)), 25 out of 25 bona-fide Hindi mobile recordings were falsely flagged as `LIKELY_REPLAY` (100% false-alarm rate) by the uncalibrated spectral decay heuristic.
2. **Physical Telephony**:
   - **NOT VERIFIED for all six languages**.
   - Zero real-world cellular carrier or PSTN physical recordings exist for Indic languages.
   - Software digital transformations C1–C5 (8 kHz resampling, G.711 $\mu$-law, G.711 A-law, Chebyshev bandpass, additive Gaussian noise) evaluated on English ASVspoof files are **software-generated digital channel transforms and must not be described as real-world Indic telephony**.
   - Evaluating mobile-recorded Indic speech under telephony threshold policies ($\theta = 0.5250$) resulted in sharp false-positive inflation (up to 60.0% on Tamil), indicating mobile acoustic capture cannot simply be treated as telephony-band carrier audio.

---

### 6. Speaker Separation and Independence

* In the 100-sample Phase 3A control benchmark, 100 distinct speakers were evaluated ($25$ per language) with 0% speaker overlap against the English training set.
* However, because zero synthetic samples were evaluated for Indic languages, this demonstrates only speaker diversity in bona-fide speech, **not** speaker-disjoint deepfake detection.

---

### 7. Commercial Indic Artifact Audit (`results/phase3a_commercial_indic/`)

* **Languages Represented**: Hindi, Telugu, Tamil, English. Marathi and Bengali are absent.
* **Sample Count**: Exactly 100 bona-fide samples ($25$ per language).
* **Documentation Discrepancy Corrected**:
  - `indic_bonafide_control_report.md` (Section 4, Item 1) contained an erroneous narrative sentence claiming *"the model produced 0 false alarms on Hindi, 0 on Telugu, 0 on English, and only 1 on Tamil"*.
  - The authoritative JSON artifact (`indic_bonafide_control_report.json`) and markdown table record the true empirical measurements, verified below.

---

### 8. Verified Language-Specific Metrics

#### A. Hindi (`hi`)
* **Sample Count**: 25 bona-fide samples (AI4Bharat IndicVoices)
* **Score Distribution**: Mean spoof score = 0.4845, Median = 0.4750, P95 = 0.7961, Max = 0.8070
* **Verified Bona-Fide FPR**:
  - Policy B Wideband ($\theta = 0.7950$): **8.0%** ($2/25$)
  - Policy B Telephony ($\theta = 0.7800$): **16.0%** ($4/25$)
  - Policy C Wideband ($\theta = 0.6850$): **20.0%** ($5/25$)
  - Policy C Telephony ($\theta = 0.5250$): **44.0%** ($11/25$)
* **Two-Class Metrics (Accuracy, Precision, Recall, F1, ROC-AUC, EER)**: **NOT VERIFIED**
* **Confidence Intervals**: **NOT VERIFIED** (not computed for $N=25$)

#### B. Telugu (`te`)
* **Sample Count**: 25 bona-fide samples (AI4Bharat IndicVoices)
* **Score Distribution**: Mean spoof score = 0.5399, Median = 0.5593, P95 = 0.8550, Max = 0.8740
* **Verified Bona-Fide FPR**:
  - Policy B Wideband ($\theta = 0.7950$): **16.0%** ($4/25$)
  - Policy B Telephony ($\theta = 0.7800$): **16.0%** ($4/25$)
  - Policy C Wideband ($\theta = 0.6850$): **20.0%** ($5/25$)
  - Policy C Telephony ($\theta = 0.5250$): **56.0%** ($14/25$)
* **Two-Class Metrics (Accuracy, Precision, Recall, F1, ROC-AUC, EER)**: **NOT VERIFIED**
* **Confidence Intervals**: **NOT VERIFIED**

#### C. Tamil (`ta`)
* **Sample Count**: 25 bona-fide samples (AI4Bharat IndicVoices)
* **Score Distribution**: Mean spoof score = 0.5802, Median = 0.6177, P95 = 0.8780, Max = 0.9386
* **Verified Bona-Fide FPR**:
  - Policy B Wideband ($\theta = 0.7950$): **12.0%** ($3/25$)
  - Policy B Telephony ($\theta = 0.7800$): **12.0%** ($3/25$)
  - Policy C Wideband ($\theta = 0.6850$): **32.0%** ($8/25$)
  - Policy C Telephony ($\theta = 0.5250$): **60.0%** ($15/25$)
* **Two-Class Metrics (Accuracy, Precision, Recall, F1, ROC-AUC, EER)**: **NOT VERIFIED**
* **Confidence Intervals**: **NOT VERIFIED**

#### D. Marathi (`mr`)
* **All Metrics**: **NOT VERIFIED** (0 samples locally)

#### E. Bengali (`bn`)
* **All Metrics**: **NOT VERIFIED** (0 samples locally)

#### F. English (`en`)
* **Control Set ($N = 25$ LibriSpeech Clean Validation)**:
  - Mean spoof score = 0.4737, Median = 0.4521, P95 = 0.7590, Max = 0.8494
  - Policy B Wideband ($\theta = 0.7950$): **4.0%** ($1/25$)
  - Policy B Telephony ($\theta = 0.7800$): **4.0%** ($1/25$)
  - Policy C Wideband ($\theta = 0.6850$): **20.0%** ($5/25$)
  - Policy C Telephony ($\theta = 0.5250$): **36.0%** ($9/25$)
* **Held-Out ASVspoof 2021 DF Test Benchmark ($N = 300$, 150 bona fide / 150 spoof A07–A19)**:
  - **C0 Clean (Default $\theta = 0.5000$)**:
    - **Accuracy**: **81.33%**
    - **Precision**: **85.61%**
    - **Recall**: **75.33%**
    - **F1 Score**: **0.8014**
    - **ROC-AUC**: **0.8733**
    - **False Positive Rate (FPR)**: **12.67%**
    - **False Negative Rate (FNR)**: **24.67%**
    - **Equal Error Rate (EER)**: **22.67%**
  - **C0 Clean (Policy C Wideband $\theta = 0.6850$)**:
    - **Accuracy**: **74.33%**
    - **Precision**: **93.98%**
    - **Recall**: **52.00%**
    - **F1 Score**: **0.6695**
    - **ROC-AUC**: **0.8733**
    - **FPR**: **3.33%**
    - **FNR**: **48.00%**
    - **EER**: **22.67%**
  - **C3 Telephony (Default $\theta = 0.5000$)**:
    - **Accuracy**: **70.67%**
    - **Precision**: **67.82%**
    - **Recall**: **78.67%**
    - **F1 Score**: **0.7284**
    - **ROC-AUC**: **0.7702**
    - **FPR**: **37.33%**
    - **FNR**: **21.33%**
    - **EER**: **31.33%**
  - **C3 Telephony (Policy C Telephony $\theta = 0.5250$)**:
    - **Accuracy**: **70.00%**
    - **Precision**: **68.29%**
    - **Recall**: **74.67%**
    - **F1 Score**: **0.7134**
    - **ROC-AUC**: **0.7702**
    - **FPR**: **34.67%**
    - **FNR**: **25.33%**
    - **EER**: **31.33%**
* **Confidence Intervals**: **NOT VERIFIED**

---

### 9. Claims That Are NOT Supported

The repository **cannot** scientifically support any of the following claims:
1. **DO NOT claim Indic-language deepfake detection** for Hindi, Telugu, Tamil, Marathi, or Bengali. Zero synthetic/deepfake Indic voice samples exist.
2. **DO NOT claim language parity**. English is evaluated on a full two-class 300-sample benchmark; Hindi, Telugu, and Tamil only have 25 bona-fide control samples; Marathi and Bengali have zero samples.
3. **DO NOT claim Indic replay robustness**. Zero physical replay recordings exist.
4. **DO NOT claim physical Indic telephony robustness**. No physical telephone carrier Indic audio was evaluated.
5. **DO NOT claim entire IndicVoices dataset is locally available**. Only small subset slices exist inside parquet downloads.

---

### 10. Minimum Prerequisites for Indic Validation

Before Indic-language deepfake detection can be scientifically claimed, the following minimum evidence package is required:
1. **Authorized Indic Synthetic/Deepfake Corpora**: Cloned/synthetic speech generated from diverse Indian TTS and voice-conversion systems across target languages.
2. **Language-Stratified Genuine + Synthetic Evaluation**: Balanced two-class evaluation protocols with adequate sample sizes ($N \ge 200$ per language).
3. **Speaker-Disjoint and Generator-Disjoint Splits**: Held-out speakers and unseen synthesis architectures for each evaluated language.
4. **Language-Specific Metrics and Confidence Intervals**: Empirically computed Accuracy, Precision, Recall, F1, ROC-AUC, EER, and 95% Confidence Intervals.
5. **Physical Replay Corpora**: Authentically recorded loudspeaker and room replay where replay claims are intended.
6. **Real or Properly Validated Telephony/Channel Evidence**: Real carrier-grade telephony audio or validated cellular transcoding benchmarks.

---

### 11. Production Decision

| Subsystem Dimension | Production Decision | Authoritative Rationale |
| :--- | :---: | :--- |
| **Production Model Checkpoint** | **RETAIN FROZEN PRODUCTION MODEL** | Do **NOT** replace the protected production model based on Task 5. The frozen `robust_mini_acoustic_cnn_v1` remains the active production checkpoint. |
| **Language Parity Claims** | **BLOCKED / PROHIBITED** | English has extensive two-class vocoder evaluations; Indic languages lack synthetic data entirely. |
| **Indic Deepfake Detection Claims** | **BLOCKED / PROHIBITED** | No synthetic Indic voice samples exist on disk to evaluate detection recall. |
| **Indic Replay Robustness Claims** | **BLOCKED / PROHIBITED** | No physical replay dataset exists; uncalibrated replay heuristic has 100% false-alarm rate on Hindi mobile speech. |
| **Physical Indic Telephony Claims** | **BLOCKED / PROHIBITED** | No physical telephony Indic audio was evaluated; applying telephony thresholds on mobile speech creates excessive false positives. |
| **Operating Threshold Guidance** | **PREFER POLICY B WIDEBAND ON INDIC SPEECH** | Policy B ($\theta = 0.7950$) maintains lower false-positive rates on Indic bona-fide speech (8% Hindi, 16% Telugu, 12% Tamil) than Policy C ($\theta = 0.6850$). Avoid engaging telephony mode ($\theta = 0.5250$) on mobile Indic speech unless verified 8 kHz PSTN input is present. |

---

## Task 6 — FasterWhisper Base INT8 ASR Validation

### 1. Overall Scientific Verdict

> [!IMPORTANT]
> **Authoritative Task 6 Verdict**:  
> **NOT READY**

The Faster-Whisper Base INT8 speech-to-text pipeline, multilingual routing subsystem, and downstream conversational security intent detectors are **NOT READY** for scientifically validated production deployment:
* **Model Staging**: CTranslate2 INT8 model files are staged locally on disk with matching cryptographic hashes; this confirms model staging and file integrity, **not** operational or scientific ASR validation.
* **Execution Status**: The runtime packages `faster_whisper` and `ctranslate2` are **not installed** in the active environment. Neural execution is blocked, and the engine defaults to deterministic DSP fallback mode.
* **Transcription Accuracy (WER/CER)**: **NOT VERIFIED**. Zero quantitative evaluations against ground-truth audio exist.
* **Latency Profile**: **NOT VERIFIED**. Contradictory unbenchmarked values exist across documentation; no standard benchmark exists.
* **Security Intent Detection**: **NOT VERIFIED**. Downstream intent classification is rule-based keyword regex matching without evaluated detection metrics.
* **Security Invariant**: ASR output is strictly **UNTRUSTED INPUT** and advisory; it cannot independently authorize sensitive actions or override acoustic/biometric gates.

---

### 2. Model Staging and Exact Identity

* **Model Checkpoint**: `openai/whisper-base` converted to CTranslate2 format by Systran.
* **Registered Model IDs**: `whisper_streaming_conformer_v4` (v4.2.0) and `faster_whisper_base_int8` (v1.2.1) in `ai/app/core/model_registry.py`.
* **Local Staging Directory**: `ai/models/asr/faster-whisper-base/`
* **Staged Files and Checksums**:
  - `model.bin`: 145,217,532 bytes (138.49 MB) — SHA-256: `D01C3014881C9C6F3133C182F3D2887EB6CA1C789A7538C5C007196857A0A6A9`
  - `config.json`: 2,309 bytes — SHA-256: `56A6D8110D311F19C8F0471E562832C7527F146B567275BFCA59FCF7C184DA9A`
  - `tokenizer.json`: 2,203,239 bytes — SHA-256: `FB7B63191E9BB045082C79FD742A3106A12C99513AB30DF4A0D47FA6CB6FD0AB`
  - `vocabulary.txt`: 459,861 bytes — SHA-256: `34CE3FE1C5041027B3F8D42912270993F986DBC4BB34CF27F951E34A1E453913`
  - `README.md`: 1,991 bytes
* **Registry Hash Verification**: The computed SHA-256 of `model.bin` matches the registered checksum in `ModelRegistry` exactly.
* **Scientific Caveat**: Staging and checksum verification prove only that the model files exist on disk without corruption. They do **not** constitute scientific validation of speech recognition accuracy, robustness, or real-time viability.

---

### 3. Runtime Execution Status

* **Dependency Check**:
  - `faster_whisper`: **NOT INSTALLED** (`ImportError: No module named 'faster_whisper'`).
  - `ctranslate2`: **NOT INSTALLED**.
* **Engine Execution Reality**:
  - In `ai/app/asr/engine.py`, `StreamingASREngine._ensure_neural_model()` catches the import error, logs a structured warning, and marks `is_neural_active = False`.
  - The engine operates exclusively in deterministic DSP fallback mode.
* **Prohibited Claim**: The project must **not** claim that Faster-Whisper neural ASR is currently operational or executing in this environment.

---

### 4. Technical Configuration and Decoding Parameters

* **Base Architecture**: OpenAI Whisper Base encoder-decoder transformer (~74M parameters).
* **Quantization**: INT8 (`compute_type="int8"`).
* **Execution Hardware**: CPU (`device="cpu"`, `cpu_threads=2`, `num_workers=1`).
* **Decoding Parameters**: Greedy decoding (`beam_size=1`).
* **VAD Segmentation**: `vad_filter=False` inside the Whisper transcribe call; speech boundary segmentation is delegated to VOXSHIELD's upstream DSP VAD.
* **Word Timestamps**: `word_timestamps=False`.
* **Input Audio Constraints**: 16 kHz mono linear PCM, normalized float32 in $[-1.0, 1.0]$, minimum duration 800 samples (50 ms).
* **Energy Guard**: Minimum RMS energy $>0.005$ required before attempting neural inference.
* **Text-Hint Bypass**: If `chunk.text_transcript` or `metadata["text_hint"]` is populated, neural inference is bypassed entirely and the text hint is ingested directly.

---

### 5. Dataset Evidence and Audio Availability

Audit of locally present datasets that could support speech-to-text evaluation:

| Dataset / Corpus | Language | Locally Accessible Audio | Reference Transcripts Present? | Evaluation Status |
| :--- | :---: | :---: | :---: | :---: |
| **LibriSpeech Clean Val** (`datasets/english_download/`) | English | 2,703 samples (embedded Parquet) | **YES** (`text` column) | **NOT EVALUATED** |
| **AI4Bharat IndicVoices** (`datasets/indicvoices_download/hindi/`) | Hindi | 10,858 samples (embedded Parquet) | **YES** (`text`, `normalized`) | **NOT EVALUATED** |
| **AI4Bharat IndicVoices** (`datasets/indicvoices_download/tamil/`) | Tamil | >5,000 samples (embedded Parquet) | **YES** (`text`, `normalized`) | **NOT EVALUATED** |
| **AI4Bharat IndicVoices** (`datasets/indicvoices_download/telugu/`) | Telugu | >10,000 samples (embedded Parquet) | **YES** (`text`, `normalized`) | **NOT EVALUATED** |
| **AI4Bharat IndicVoices** (`datasets/indicvoices_download/marathi/`) | Marathi | **0 samples** | **NO** | **NOT VERIFIED** |
| **AI4Bharat IndicVoices** (`datasets/indicvoices_download/bengali/`) | Bengali | **0 samples** | **NO** | **NOT VERIFIED** |
| **ASVspoof 2021 DF** (`datasets/raw/asvspoof/`) | English | 300 FLAC files | **NO** (Anti-spoof labels only) | N/A |

*Critical Distinction*: Do **not** claim that the full IndicVoices dataset is locally available. Standalone WAV files referenced in `dataset_manifest_split.csv` do not exist on disk; only subset slices embedded inside download Parquet archives are physically present.

---

### 6. Acoustic Transcription Quality (WER / CER)

* **Word Error Rate (WER)**: **NOT VERIFIED** (0.0% evaluated).
* **Character Error Rate (CER)**: **NOT VERIFIED** (0.0% evaluated).
* **Exact-Match Rate**: **NOT VERIFIED**.
* **Language-Specific Transcription Accuracy**: **NOT VERIFIED**.
* *Testing Caveat*: Unit tests in `ai/tests/test_asr_engine.py` validate schema integration and contract handling using mocked return objects (`MagicMock`). Mocked unit tests do **not** represent scientific ASR accuracy validation.

---

### 7. Latency Profile

The repository contains contradictory and non-reproducible latency claims across documents:
* `ModelRegistry`: Claims `inference_latency_ms_p50 = 18.5 ms` (unsupported by empirical data; speculative).
* `docs/phase-6.2-neural-asr-report.md`: Documents ~2,502 ms for 1.0 s audio on an Intel Core i3-1215U (2 threads).
* `docs/phase-6.5-multilingual-language-report.md`: Reports 4,075 ms without language hint and 1,836 ms with explicit language hint.
* `docs/PHASE7_AI_VALIDATION.md`: Notes that unbuffered processing over an internal 30 s Whisper window causes 8,000–8,500 ms latency per call.
* `docs/AI_ML_VALIDATION_STATUS.md`: Cites 250–450 ms for multi-second chunks.

*Verdict*: **Standardized Latency NOT VERIFIED**. These figures must **not** be cited as an authoritative production benchmark. No reproducible latency benchmark across $N \ge 100$ trials exists in the repository.

---

### 8. Language Identification

* **Implementation Logic**:
  Layered identification architecture in `LanguageIdentifier` (`ai/app/asr/language.py`):
  1. *Explicit Hint*: Metadata payload (`language: "hi"`).
  2. *Neural Detection*: Faster-Whisper native BPE language probability (`info.language`, `info.language_probability`) when runtime is active.
  3. *Script & Lexical Heuristic*: Unicode regex ranges (Devanagari, Telugu, Bengali) and transliterated romanized loan words.
  4. *Contextual Tracking*: Multi-turn sliding window voting (`LanguageContextTracker`).
  5. *Fallback*: Default `en-IN`.
* **Validation Status**:
  - Real-speech language identification accuracy: **NOT VERIFIED**.
  - No language identification confusion matrix exists on real acoustic speech.

---

### 9. ASR Confidence and Uncertainty Calibration

* **Implementation Reality**:
  - `StreamingASREngine` hardcodes `base_conf = 0.92` whenever a non-empty transcript is produced.
  - `ASRConfidenceCalculator` (`ai/app/asr/confidence.py`) applies heuristic multipliers based on audio quality (e.g. POOR quality reduces confidence by $60\%$).
  - Confidence is **not** derived from token-level log probabilities, decoder entropy, or sequence perplexity.
  - Confidence has **never been calibrated** against empirical transcription correctness (WER/CER).
* **Verdict**: **Confidence Calibration NOT VERIFIED**.

---

### 10. Failure Modes and Edge Cases

The implementation incorporates structured error handling, but distinctions must be drawn between code scaffolding and empirical testing:
1. **Silence / Low Energy**: When audio RMS energy is $\le 0.005$, neural transcription is skipped; returns `""`, $\text{conf}=0.0$, $\text{uncertainty}=1.0$.
2. **Short Audio ($<800$ samples / $<50$ ms)**: Skipped; returns `""`, $\text{conf}=0.0$, $\text{uncertainty}=1.0$.
3. **Missing Model / Missing Package**: Gracefully engages DSP fallback without throwing unhandled exceptions (returns `""`, $\text{conf}=0.0$, $\text{uncertainty}=1.0$).
4. **Degraded / Noisy Audio**: Audio quality analyzer flags POOR/DEGRADED and lowers heuristic confidence score to $\le 0.40$.
5. **ASR Timeout / Error**: Pipeline orchestrator catches exceptions, sets `ASRResult(status=PipelineStatus.MODEL_UNAVAILABLE, confidence=0.0, uncertainty=1.0)`, and continues call processing.
6. **Untrusted Text Hints**: Client transcript hints pass through `PrivacyFirewall` for secret masking; hints cannot independently force policy decisions.

---

### 11. Security-Sensitive Intent Handling

Audit of downstream conversational intelligence for security-critical threats:
* **Target Intent Categories**:
  - **OTP**: Solicitations for one-time passwords, verification codes, 6-digit passcodes (`IntentCategory.OTP_REQUEST`, `SensitiveDataType.OTP`).
  - **PIN**: Solicitations for ATM or security PINs (`IntentCategory.PASSWORD_RESET`, `SensitiveDataType.PASSWORD`).
  - **Password**: Password reset or credential disclosure requests (`IntentCategory.PASSWORD_RESET`, `SensitiveDataType.PASSWORD`).
  - **Financial / Account Takeover**: Unprompted wire transfers, account reactivation, remote desktop installation (`IntentCategory.MONEY_TRANSFER_REQUEST`, `IntentCategory.ACCOUNT_ACCESS`, `IntentCategory.REMOTE_ACCESS_REQUEST`).
  - **Social Engineering**: Authority exploitation, urgency pressure, fear coercion, secrecy demands, isolation attempts, verification bypass (`ai/app/social_engineering/tactics.py`).
* **Detection Architecture**:
  - Detection is **100% deterministic regular expression and keyword pattern matching** (`INTENT_PATTERNS`, `TACTIC_PATTERNS`, `SENSITIVE_ENTITY_PATTERNS`).
  - No trained neural NLP classifier, BERT, or LLM is present for this functionality.
  - No empirical Precision, Recall, or F1 benchmark on conversational fraud dialogues exists.
  - Adversarial and noisy speech-to-text robustness is **NOT VERIFIED**.
* **Authoritative Security Posture**:
  > [!CAUTION]
  > **ASR Output is UNTRUSTED INPUT**:  
  > Automatic speech recognition output must **never** be treated as verified ground truth. ASR is strictly **advisory** within the multi-modal risk fusion engine. Conversational intent signals can elevate overall risk scores, but **cannot independently authorize sensitive actions, grant access, or override acoustic deepfake and speaker verification gates**.

---

### 12. Production Integration

* **Primary Pipeline Orchestrator**: `UnifiedPipelineOrchestrator.process_audio_chunk()` in `ai/app/pipeline/orchestrator.py`.
* **Backend Ingestion Service**: `ConversationService.analyzeTurn()` and WebSocket streaming server (`backend/src/calls/ws_server.ts`).
* **Failure Isolation**: ASR failure or timeout is strictly isolated (`status = MODEL_UNAVAILABLE`); it does not interrupt active WebSocket streams or terminate ongoing calls.

---

### 13. Scientific Gaps

Before Faster-Whisper Base INT8 and conversational security intelligence can be claimed as validated, the following scientific gaps must be resolved:
1. **Missing Runtime Dependency**: Install and verify `faster_whisper` and `ctranslate2` in the deployment Python environment.
2. **Standardized INT8 Latency Benchmark**: Rigorous empirical measurement of cold load time, warm chunk latency, real-time factor (RTF), and p95 latency on stated production CPU hardware ($N \ge 100$).
3. **Quantitative WER / CER Benchmark**: Formal word error rate and character error rate evaluation against ground-truth corpora across English and target Indic languages.
4. **Real-Speech Language Identification Evaluation**: Quantitative confusion matrix and classification accuracy on multi-dialect acoustic audio.
5. **Acoustic Confidence Calibration**: Empirical calibration of ASR confidence scores against observed transcription error rates.
6. **Security-Intent Attack Benchmark**: Labeled statistical evaluation of OTP, PIN, password, financial fraud, and social engineering detection on clean, degraded, and adversarially perturbed transcripts.

---

### 14. Minimum Prerequisites for Validation

To claim scientific validation:
1. **Runnable Neural Stack**: A working Python environment with `faster-whisper` and `ctranslate2` executing real neural inference without fallback.
2. **Acoustic Benchmark Protocol**: Automated evaluation calculating WER, CER, and exact-match rate on $\ge 200$ reference-transcript utterances per target language.
3. **Empirical Latency Profile**: Documented p50, p90, and p95 inference latencies on production hardware.
4. **Language Confusion Matrix**: Multi-class confusion matrix across all supported languages on real acoustic recordings.
5. **Confidence Calibration**: Demonstrable statistical correlation between confidence scores and transcription accuracy.
6. **Intent Detection Benchmark**: Evaluation on a minimum of $100$ positive attack dialogues (OTP solicitations, wire fraud, urgency tactics) and $100$ benign dialogues, reporting Precision, Recall, and F1.
7. **Noisy / Adversarial Evaluation**: Robustness testing of intent detection against ASR phonetic substitution errors and noisy telephony channels.

---

### 15. Definitive Production Decision

| Subsystem Dimension | Production Decision | Authoritative Rationale |
| :--- | :---: | :--- |
| **Production Acoustic Model** | **RETAIN FROZEN PRODUCTION MODEL** | The protected production acoustic checkpoint `robust_mini_acoustic_cnn_v1` remains active and unchanged. |
| **Faster-Whisper Neural ASR** | **RETAIN AS UNVALIDATED SCAFFOLDING** | Model files are staged, but runtime dependencies are missing; neural execution defaults to DSP fallback. |
| **Multilingual ASR Claims** | **BLOCKED / PROHIBITED** | No WER, CER, or quantitative language accuracy benchmarks exist on real speech. |
| **Security Intent Detection Claims** | **BLOCKED / PROHIBITED** | Intent matching is rule-based regex without empirical precision/recall validation against fraud datasets. |
| **Operational Validation Status** | **NOT READY** | ASR output remains unvalidated advisory telemetry. |

---

## Task 7 — Calibration & Uncertainty Validation

### 1. Overall Scientific Verdict

> [!IMPORTANT]
> **Authoritative Task 7 Verdict**:  
> **NOT READY**  
> *(Operating Threshold Selection & Fail-Safe Uncertainty Scaffolding Implemented; Probability Calibration, ECE/Brier Metrics, Speaker Calibration, Replay Calibration, ASR Calibration, and Empirical Uncertainty NOT VERIFIED)*

A comprehensive read-only scientific audit across all repository subsystems reveals that while operating threshold selection and fail-safe uncertainty handling are architecturally implemented, **true empirical probability calibration is NOT VERIFIED** across any component:

* **Acoustic / Deepfake Discrimination**: Supported on the held-out clean evaluation benchmark ($0.8733$ ROC-AUC on C0 clean ASVspoof 2021 DF), but raw neural sigmoid scores $\sigma(z) \in [0, 1]$ are **NOT VERIFIED as calibrated probabilities**.
* **Threshold Selection vs. Probability Calibration**: Existing operating thresholds ($\theta = 0.685$ for wideband, $\theta = 0.525$ for telephony under Policy C, and other explored policies) represent operating point selection along the ROC curve to balance trade-offs, and **must not be described as probability calibration**.
* **Post-Hoc Calibration Status**: Formal calibration methods such as Platt scaling, temperature scaling, and isotonic regression were identified in analysis scripts and artifacts (`analyze_validation_thresholds.py`, `validation_threshold_analysis_report.json`) as **future/untested experiments**, not completed calibration.
* **Speaker Verification Calibration**: **NOT VERIFIED**. The active speaker path is a deterministic DSP fallback with hardcoded cosine similarity thresholds ($\tau = 0.70$ fallback / $\tau = 0.88$ neural) and an arbitrary linear margin heuristic for confidence (`0.50 + 1.5 * margin`). Zero genuine/impostor trial pairs or empirical FAR/FRR/TAR/EER calibration protocols exist.
* **Replay Detector Calibration**: **NOT VERIFIED**. Replay probabilities ($0.12, 0.65, 0.88$) and confidence values ($0.82, 0.60, 0.85$) are static hardcoded heuristic constants assigned by cue counts. No authentic physical replay evaluation corpus or calibration protocol exists.
* **ASR Confidence Calibration**: **NOT VERIFIED**. The base confidence ($0.92$) is a hardcoded constant damped by heuristic audio quality penalties. Zero paired evaluation against Word Error Rate (WER) or Character Error Rate (CER) exists.
* **Multimodal Uncertainty / Risk Fusion**: **NOT VERIFIED as calibrated probability**. Uncertainty is mathematically computed as an arithmetic complement ($1.0 - \text{avg\_confidence}$) over heuristic component scores. The fused risk score ($0\text{--}100$) employs weighted sums and arbitrary corroboration multipliers ($1.25\times\text{--}1.80\times$), acting as an engineering safety policy rather than an empirical Bayesian posterior.
* **Calibration Metrics**: **Zero** empirical measurements of Expected Calibration Error (ECE), Maximum Calibration Error (MCE), Brier score, log loss / negative log-likelihood (NLL), reliability diagrams, or calibration curves exist anywhere in the repository.
* **Abstention & Inconclusive Behavior**: Structured fail-safe abstention states (`INSUFFICIENT_AUDIO`, `POOR_QUALITY`, `INCONCLUSIVE`, `MODEL_UNAVAILABLE`) are architecturally implemented and functionally operational, but their empirical uncertainty/coverage-risk behavior is **NOT VERIFIED**.
* **Security Invariant**: ASR output remains strictly **UNTRUSTED INPUT** and advisory; it cannot independently authorize sensitive actions (e.g. OTP validation, wire transfers) or override acoustic/biometric gates.

---

### 2. Explicit Scientific Distinctions

To ensure scientific rigor, four distinct concepts must never be merged or conflated:

1. **Discrimination**: The ability of a model to rank synthetic audio higher than bona-fide audio (measured by ROC-AUC and Equal Error Rate). Supported for clean held-out acoustic speech ($0.8733$ ROC-AUC).
2. **Operating Threshold Selection**: The empirical choice of a decision cutoff $\theta$ to balance false alarms against false rejections along an existing ROC curve (e.g., Policy C: $\theta = 0.685$ for wideband, $\theta = 0.525$ for telephony). Threshold selection shifts operating trade-offs but **does not alter the score distribution or calibrate probabilities**.
3. **Probability Calibration**: The transformation of raw model scores into true posterior probabilities such that a predicted confidence $p$ reflects an empirical empirical event frequency $p$ (e.g., of all predictions assigned confidence $0.80$, exactly $80\%$ are correct). Uncalibrated across all repository models.
4. **Uncertainty / Abstention Policy**: Deterministic operational rules that reject or withhold judgment on degraded, short, or low-confidence samples (e.g. `INCONCLUSIVE`, `POOR_QUALITY`). These are engineering safety measures, not calibrated Bayesian uncertainty intervals.

---

### 3. Repository Calibration Inventory

| Subsystem / Modality | Code Location | Implemented Mechanism | Empirical Probability Calibration? | Calibration Metrics (ECE/Brier)? | Scientific Status |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Deepfake Acoustic CNN** | `ai/app/deepfake/calibration.py` | Dual-mode thresholding ($\theta=0.685 / 0.525$) + quality penalty | **NO** (Raw sigmoid $\sigma(z)$) | **NONE** (Untested future work) | **PARTIALLY SUPPORTED** (Thresholds Only) / **NOT VERIFIED** (Probabilities) |
| **Threshold Sweeper** | `ai/neural_prototype/results/phase2c_calibration/calibrate_robust_thresholds.py` | Grid search $\theta \in [0.01, 0.99]$ on clean validation set | **NO** (ROC operating point tuning) | **NONE** | **SUPPORTED** (Validation Threshold Tuning) |
| **Speaker Verification** | `ai/app/speaker/similarity.py` | Hardcoded threshold ($\tau=0.70 / 0.88$) + linear margin formula | **NO** | **NONE** | **NOT VERIFIED** |
| **Replay Detector** | `ai/app/replay/detector.py` | Fixed probability lookup ($0.12, 0.65, 0.88$) by rule count | **NO** (Static constants) | **NONE** | **NOT VERIFIED** |
| **ASR Confidence** | `ai/app/asr/confidence.py` | Static base ($0.92$) $\times$ quality factor | **NO** (Disconnected from WER) | **NONE** | **NOT VERIFIED** |
| **Multimodal Risk Matrix** | `ai/app/fusion/matrix.py` | Weighted sum + corroboration multiplier + $1 - \text{conf}$ | **NO** (Engineering risk score) | **NONE** | **NOT VERIFIED** (Safety Policy Only) |

---

### 4. Deepfake / Acoustic Model Calibration Audit

* **Output Score Semantics**: The frozen production model `robust_mini_acoustic_cnn_v1` produces a scalar logit passed through a standard sigmoid:
  $$\hat{p} = \sigma(z) = \frac{1}{1 + e^{-z}} \in [0, 1]$$
  A value between 0 and 1 is mathematically bounded, but is **not** a calibrated probability.
* **Limits of Threshold Tuning under Severe Channel Shift**:
  - In Phase 2C, threshold selection successfully lowered wideband clean FPR from $12.67\%$ down to $3.33\%$ ($\theta = 0.685$).
  - However, when subjected to telephone bandpass (C4) or bandpass + noise (C5), bona-fide caller scores shift dramatically toward $1.0$.
  - Under Policy C Telephony ($\theta = 0.525$), C4 FPR is $60.00\%$ and C5 FPR is $77.33\%$ (116 false alarms out of 150 bona-fide calls).
  - Shifting thresholds upward to Policy B ($\theta = 0.780$) suppresses false alarms, but causes spoof recall to collapse (FNR rises to $48.00\%$).
  - Threshold selection cannot overcome underlying distribution collapse.
* **Absence of Post-Hoc Calibration**: In `ai/neural_prototype/analyze_validation_thresholds.py` and `validation_threshold_analysis_report.json`, post-hoc calibration methods (Platt scaling, temperature scaling, isotonic regression) and Brier score evaluation are explicitly cataloged as an **"untested_future_experiment"**. None was implemented or evaluated.

---

### 5. Speaker Verification Calibration Audit

* **Scoring Pipeline**: Deterministic DSP fallback extracts 128-dimensional spectral features and computes cosine similarity:
  $$\text{sim}(e_1, e_2) = \frac{e_1 \cdot e_2}{\|e_1\| \|e_2\|} \in [-1.0, 1.0]$$
* **Thresholds**: Hardcoded at $\tau = 0.70$ for fallback DSP and $\tau = 0.88$ for neural ECAPA-TDNN (weights absent).
* **Confidence Formulation**:
  ```python
  margin = abs(similarity - tau)
  confidence = float(np.clip(0.50 + margin * 1.5, 0.50, 0.98))
  ```
* **Scientific Verdict**: **NOT VERIFIED**. The confidence value is a linear geometric distance heuristic. Zero genuine/impostor trial pairs were evaluated, no score normalization (Z/T/S-norm) exists, and no empirical FAR/FRR/TAR/EER operating curve exists.

---

### 6. Replay Detector Calibration Audit

* **Detection Logic**: Deterministic DSP analyzer checks 3 acoustic heuristics (high-frequency spectral roll-off, reverberation decay anomaly, channel impulse response).
* **Probability & Confidence Assignment**:
  - $\ge 2\text{ cues}$: Status `REPLAY`, fixed probability $0.88$, fixed confidence $0.85$.
  - $1\text{ cue}$: Status `LIKELY_REPLAY`, fixed probability $0.65$, fixed confidence $0.60$.
  - $0\text{ cues}$: Status `NOT_REPLAY`, fixed probability $0.12$, fixed confidence $0.82$.
* **Scientific Verdict**: **NOT VERIFIED**. Replay probabilities and confidence scores are static hardcoded numbers. No authentic physical replay corpus exists locally, and testing on authentic mobile speech (Task 4/5) yielded a $100\%$ false-alarm rate ($25/25$ genuine Hindi mobile samples flagged as `LIKELY_REPLAY`).

---

### 7. ASR Confidence Calibration Audit

* **Assignment Mechanism**: `StreamingASREngine` assigns a static `base_conf = 0.92` whenever non-empty transcript text is emitted. `ASRConfidenceCalculator` damps this by audio quality rating (POOR: $\times 0.40$, DEGRADED: $\times [1.0 - 0.5 \times \text{penalty}]$).
* **Scientific Reality**: Confidence is disconnected from decoder token log-probabilities, beam search entropy, or sequence perplexity. It has never been evaluated against paired reference transcripts to determine correlation with Word Error Rate (WER) or Character Error Rate (CER).
* **Scientific Verdict**: **NOT VERIFIED**.

---

### 8. Multimodal Uncertainty & Risk Fusion Audit

* **Fusion Architecture**: `RiskMatrixCalculator` (`ai/app/fusion/matrix.py`) normalizes 8 category scores into a $[0, 100]$ aggregate index using static category weights ($0.10\text{--}0.30$) and heuristic corroboration multipliers ($1.25\times$ for 2 threats, $1.50\times$ for 3, $1.80\times$ for 4+).
* **Uncertainty Formulation**: Overall confidence is computed as arithmetic average confidence:
  $$\text{uncertainty} = 1.0 - \text{avg\_confidence}$$
* **Scientific Reality**: The fusion engine combines uncalibrated component scores via linear weighting and rule-based multipliers. The resulting risk score and uncertainty value are **engineering risk indices**, not calibrated joint posterior probabilities.
* **Scientific Verdict**: **NOT VERIFIED**.

---

### 9. Exhaustive Search for Calibration Metrics

| Metric | Measured Value Across Repository | Split / Dataset | Reproducibility Status |
| :--- | :---: | :---: | :---: |
| **Expected Calibration Error (ECE)** | **NONE** | N/A | **NOT VERIFIED** |
| **Maximum Calibration Error (MCE)** | **NONE** | N/A | **NOT VERIFIED** |
| **Brier Score** | **NONE** | Listed only as untested future work | **NOT VERIFIED** |
| **Log Loss / Negative Log-Likelihood** | **NONE** | Listed only as untested future work | **NOT VERIFIED** |
| **Reliability Diagrams / Calibration Curves** | **NONE** | N/A | **NOT VERIFIED** |
| **Calibration Slope / Intercept** | **NONE** | N/A | **NOT VERIFIED** |
| **Conformal Prediction Coverage** | **NONE** | N/A | **NOT VERIFIED** |
| **Abstention / Selective Risk Curve** | **NONE** | Quality gate rejected 0 samples in EXP-2C-GATE | **NOT VERIFIED** |

---

### 10. Abstention & Inconclusive Behavior

The codebase implements structured abstention policies across every tier:
1. **Deepfake Detector**: Duration $< 300\text{ ms} \implies \text{INSUFFICIENT\_AUDIO}$ (`conf = 0.0, uncertainty = 1.0`). Quality `POOR` $\implies \text{INCONCLUSIVE}$ (`uncertainty \ge 0.80`). Score near threshold with low confidence $\implies \text{INCONCLUSIVE}$.
2. **Replay Detector**: Duration $< 250\text{ ms}$ or quality `POOR` $\implies \text{UNCERTAIN}$ (`conf \le 0.20`).
3. **ASR Transcriber**: Energy $\le 0.005$ or duration $< 50\text{ ms} \implies$ empty transcript (`conf = 0.0, uncertainty = 1.0`). Missing runtime $\implies$ empty transcript (`conf = 0.0, uncertainty = 1.0`).
4. **Risk Fusion Engine**: Average confidence $< 0.35 \implies \text{RiskLevel.INCONCLUSIVE}$.
5. **Downstream Policy Execution**: `RiskLevel.INCONCLUSIVE` maps to `MONITOR` or `REQUIRE_STEP_UP_VERIFICATION`; it never automatically triggers false-positive call blocking.

*Assessment*: Abstention logic is **architecturally sound and fail-safe**, but its empirical coverage-risk trade-offs (whether higher uncertainty actually correlates with higher classification error) have **never been quantified**.

---

### 11. Security Implications of Uncalibrated Probabilities

1. **ASR as Untrusted Input**: Because ASR confidence ($0.92$) is heuristic and downstream intent detection is regex-based, conversational intelligence is treated strictly as **untrusted, advisory input**. It cannot independently authorize sensitive actions (e.g. OTP validation, wire transfer release, identity approval).
2. **Downstream OTP / PIN / Takeover Protection**: Conversational intent signals elevate the `credential_theft` risk dimension in the fusion matrix. However, because risk scores are uncalibrated heuristics, security policies enforce deterministic baseline rules (`BLOCK_DISCLOSURE`, `REQUIRE_STEP_UP_VERIFICATION`) rather than relying purely on continuous probability thresholds.
3. **False-Alarm Risk in Production**: Under acoustic channel distortion (C4/C5 telephony bandpass), uncalibrated CNN scores produce severe false alarms ($60\%\text{--}77\%$). Treating raw scores as "calibrated probabilities" in an automated blocking system would disconnect innocent callers during mobile phone calls.

---

### 12. Minimum Evidence Required for Genuine Calibration

Before calibration or calibrated uncertainty can be claimed in production, the following evidence package is required:

* **Independent Calibration and Evaluation Sets**: A dedicated calibration split separate from both model training and final held-out test evaluation sets.
* **Disjointness Guarantees**: Absolute speaker, source, generator, and audio disjointness between calibration and evaluation sets.
* **Explicit Calibration Method**: Mathematical fitting and documentation of Temperature Scaling (single scalar $T$), Platt Scaling (logistic sigmoid parameters $A, B$), or Isotonic Regression on validation logits.
* **Empirical Reliability Diagrams**: Publication of reliability diagrams plotting predicted confidence bins against observed empirical accuracy across $\ge 10$ bins.
* **Quantitative Calibration Metrics**: Reporting Expected Calibration Error (ECE) $< 5.0\%$, Maximum Calibration Error (MCE), and Brier score reductions against uncalibrated baselines.
* **Held-Out Post-Calibration Evaluation**: Verification that fitted calibration parameters generalize to unseen attacks and channel conditions without degradation.
* **Uncertainty / Coverage-Risk Analysis**: Empirical selective risk curves demonstrating that abstaining on high-uncertainty samples directly reduces downstream error rates.
* **Speaker Biometric Calibration**: Evaluation on labeled genuine and impostor trial sets reporting calibrated log-likelihood ratios, minDCF, and empirical FAR/FRR/TAR/EER curves.
* **Replay Biometric Calibration**: Evaluation on genuine vs. physical replay trial sets reporting APCER, BPCER, ACER, and calibrated detection operating points.
* **ASR Confidence vs. Error Evaluation**: Empirical binning of ASR confidence against observed Word Error Rate (WER) and Character Error Rate (CER) on benchmark reference transcripts.
* **Component Calibration Prior to Fusion**: Ensuring all component inputs represent verified posterior probabilities before multimodal combination.

---

### 13. Definitive Production Decision

| Subsystem Dimension | Production Decision | Authoritative Rationale |
| :--- | :---: | :--- |
| **Production Acoustic Model** | **RETAIN FROZEN PRODUCTION MODEL** | The protected production checkpoint `robust_mini_acoustic_cnn_v1` remains active and unchanged. |
| **Calibrated Probability Claims** | **BLOCKED / PROHIBITED** | Raw model sigmoid scores $\sigma(z)$ must **never** be cited as calibrated probabilities; post-hoc calibration has not been implemented. |
| **Calibrated Speaker Confidence Claims** | **BLOCKED / PROHIBITED** | Speaker confidence is an arbitrary linear margin heuristic on unvalidated DSP cosine similarities. |
| **Calibrated Replay Confidence Claims** | **BLOCKED / PROHIBITED** | Replay probabilities ($0.12, 0.65, 0.88$) are static hardcoded numbers unverified against physical replay data. |
| **Calibrated ASR Confidence Claims** | **BLOCKED / PROHIBITED** | Base confidence ($0.92$) is a hardcoded constant disconnected from empirical WER/CER. |
| **Calibrated Multimodal Risk Claims** | **BLOCKED / PROHIBITED** | Fused risk scores are weighted heuristic engineering indices, not calibrated Bayesian probabilities. |
| **Fail-Safe Abstention Handling** | **RETAIN AS ENGINEERING POLICY ONLY** | Structured abstention states (`INCONCLUSIVE`, `POOR_QUALITY`, `INSUFFICIENT_AUDIO`) are retained as operational safety mechanisms, but must not be represented as calibrated uncertainty measures. |
| **Future Calibration Work** | **EVIDENCE-GATHERING TASK** | Formal calibration (temperature scaling, reliability curves, ECE measurement) remains a required future scientific milestone. |

---

### 14. Integrity Verification

* **Git Branch**: `feature/bhavya-premium-ai`
* **Protected Production Checkpoint**: `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`
* **Protected Checkpoint SHA-256**: `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5` (Bitwise Unchanged)
* **Tracked Production Files Modified**: **NONE**
* **Repository Status**: `docs/ai/` contains the existing untracked audit and validation report artifacts
* **Package / Model / Dataset Installations**: **NONE**
* **Production Code Modifications**: **NONE**
* **Task 8 Status**: **COMPLETED**
* **Git Commit**: **NONE**

---

## Task 8 — Telephony / Codec / Noise Robustness Validation

### 1. Overall Scientific Verdict

> [!IMPORTANT]
> **Authoritative Task 8 Verdict**:  
> **PARTIALLY SUPPORTED** for digital G.711 codec emulation (μ-law, A-law) and digital 8 kHz round-trip resampling on the evaluated held-out test split;  
> **NOT READY** for telephone-band filtering (C4) or additive noise (C5, N10–N25) due to severe false-alarm saturation ($77.33\%\text{--}93.33\%$ FPR);  
> **NOT VERIFIED** for packet loss, clipping, lossy compression (AMR, Opus, AAC, MP3), arbitrary resampling, or real physical carrier-grade telephony.

* **Digital G.711 / 8 kHz**: **PARTIALLY SUPPORTED**. The protected production model maintains moderate discrimination ($0.7849$ ROC-AUC on C2 μ-law, $0.7702$ on C3 A-law, $0.7187$ on C1 8 kHz) on the held-out benchmark ($N = 300$). However, false alarms increase substantially ($33.33\%$ on C2, $37.33\%$ on C3, $48.67\%$ on C1 at default $\theta = 0.50$). This constitutes **software simulation only; real carrier telephony was NOT VERIFIED**.
* **Telephone-Band Filtering (C4, 300–3400 Hz)**: **NOT READY**. Bandpass filtering strips spectral cues outside the nominal telephone voiceband, causing the CNN's spoof scores on bona-fide audio to shift upward. FPR reaches $77.33\%$ ($116/150$ false alarms) and ROC-AUC collapses to $0.6119$ (EER $44.33\%$).
* **Additive Gaussian Noise**: **NOT READY**. Additive noise triggers catastrophic false-alarm saturation. On the protected model at 15 dB SNR (C5), FPR reaches $92.00\%$ ($138/150$ false alarms) and ROC-AUC drops to $0.5544$. At 10 dB SNR (N10), ROC-AUC collapses to $0.4584$ (sub-chance, EER $50.67\%$). Retrained noise-augmented candidates from EXP-2B-NOISE suffered severe Pareto trade-off collapses and failed to outperform the protected model across all conditions.
* **Packet Loss & Jitter Concealment**: **NOT VERIFIED**. Zero acoustic waveform packet loss or packet loss concealment (PLC) evaluations exist. Network-layer RTP sequence tracking in backend code does not constitute acoustic model validation.
* **Audio Clipping**: **NOT VERIFIED**. While `AudioQualityAnalyzer` detects sample saturation ($\ge 0.985$) for uncertainty flagging, zero quantitative classifier evaluations across controlled clipping levels exist.
* **General Lossy Compression**: **NOT VERIFIED**. Codec headers for AMR, AMR-WB, Opus, AAC, and MP3 are recognized in software contracts, but zero quantitative model evaluations on compressed audio exist.
* **Real Carrier / PSTN Telephony**: **NOT VERIFIED**. Zero physical cellular or PSTN carrier recordings were evaluated. All existing telephony findings are derived from synthetic digital software transforms.

---

### 2. Clean Baseline Reference (C0)

The clean baseline serves as the scientific anchor for all relative degradation measurements.

* **Model Checkpoint**: `robust_mini_acoustic_cnn_v1` (`ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`)
* **SHA-256 Checksum**: `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5`
* **Architecture**: 2-channel log-Mel + linear spectrogram `MiniAcousticCNN` ($93,442$ parameters)
* **Authoritative Evaluation Artifact**: `ai/neural_prototype/results/robust_unseen_evaluation/robust_unseen_evaluation_report.json`
* **Evaluation Split**: Held-out `unseen_attack_eval_manifest.parquet` ($N = 300$, $150$ bona fide, $150$ spoof)
* **Disjointness**: 9 unseen speakers ($0\%$ train/val overlap), 13 unseen vocoders/generators A07–A19 ($0\%$ train/val overlap)
* **Sampling Rate**: 16,000 Hz, uncompressed linear PCM
* **Operating Threshold**: Default $\theta = 0.5000$

| Metric | Measured Value | Standard Formulation |
| :--- | :---: | :--- |
| **Sample Count ($N$)** | **300** | $150$ bona fide, $150$ spoof (balanced $1:1$) |
| **Accuracy** | **81.33%** | $(131 + 113) / 300$ |
| **Precision** | **85.61%** | $113 / (113 + 19)$ |
| **Recall (Spoof)** | **75.33%** | $113 / 150$ |
| **F1 Score** | **0.8014** | Harmonic mean of Precision and Recall |
| **ROC-AUC** | **0.8733** | Area under the Receiver Operating Characteristic curve |
| **False Positive Rate (FPR)** | **12.67%** | $19 / 150$ false alarms on bona-fide speech |
| **False Negative Rate (FNR)** | **24.67%** | $37 / 150$ missed deepfakes |
| **Equal Error Rate (EER)** | **22.67%** | Point where $\text{FPR} = \text{FNR}$ |
| **EER Operating Threshold** | **0.4477** | Threshold achieving EER on clean validation/test |
| **Confusion Matrix** | **TN=131, FP=19, FN=37, TP=113** | Evaluated on fixed threshold $0.50$ |

---

### 3. G.711 μ-law / PCMU (Condition C2)

* **Transform Implementation**:
  1. Input 16 kHz float32 waveform.
  2. Resampled to 8 kHz via `torchaudio.transforms.Resample(16000, 8000)`.
  3. Amplitude clipped to $[-1.0, 1.0]$ and quantized to 16-bit signed integer: `(pcm * 32767.0).astype(np.int16)`.
  4. Encoded into an in-memory BytesIO WAV container with subtype `"ULAW"` using `soundfile.write()`.
  5. Decoded back to float32 at 8 kHz via `soundfile.read()`.
  6. Upsampled back to 16 kHz via `torchaudio.transforms.Resample(8000, 16000)`.
* **Mathematical Fidelity**: Faithful to ITU-T G.711 standard logarithmic companding ($\mu = 255$, 8-bit dynamic range companding).
* **Evaluation Dataset**: Held-out `unseen_attack_eval_manifest.parquet` ($N = 300$, $150$ bona fide, $150$ spoof from A07–A19 across 9 unseen speakers).
* **Authoritative Results (`robust_unseen_evaluation_report.json`, Fixed $\theta = 0.50$)**:
  - **Accuracy**: $71.67\%$ ($-9.66\text{ pp}$ vs. C0)
  - **Precision**: $69.70\%$ ($-15.91\text{ pp}$ vs. C0)
  - **Recall**: $76.67\%$ ($+1.34\text{ pp}$ vs. C0)
  - **F1 Score**: $0.7302$ ($-0.0712$ vs. C0)
  - **ROC-AUC**: $0.7849$ ($-0.0884$ vs. C0)
  - **FPR**: $33.33\%$ ($+20.66\text{ pp}$ vs. C0; $50$ false alarms out of $150$ bona-fide calls)
  - **FNR**: $23.33\%$ ($-1.34\text{ pp}$ vs. C0)
  - **EER**: $29.33\%$ ($+6.66\text{ pp}$ vs. C0)
  - **EER Threshold**: $0.5335$
  - **Confusion Matrix**: $\text{TN}=100, \text{FP}=50, \text{FN}=35, \text{TP}=115$
* **Scientific Assessment**: **PARTIALLY SUPPORTED under the tested digital transform; no production-safe threshold was established**. Performance represents **software simulation only; real carrier telephony was NOT VERIFIED**.

---

### 4. G.711 A-law / PCMA (Condition C3)

* **Transform Implementation**:
  Identical round-trip architecture to C2, utilizing ITU-T G.711 A-law companding ($A = 87.6$, 8-bit PCM) via `soundfile.write(..., subtype="ALAW")`.
* **Evaluation Dataset**: Held-out `unseen_attack_eval_manifest.parquet` ($N = 300$, $150$ bona fide, $150$ spoof from A07–A19 across 9 unseen speakers).
* **Authoritative Results (`robust_unseen_evaluation_report.json`, Fixed $\theta = 0.50$)**:
  - **Accuracy**: $70.67\%$ ($-10.66\text{ pp}$ vs. C0)
  - **Precision**: $67.82\%$ ($-17.79\text{ pp}$ vs. C0)
  - **Recall**: $78.67\%$ ($+3.34\text{ pp}$ vs. C0)
  - **F1 Score**: $0.7284$ ($-0.0730$ vs. C0)
  - **ROC-AUC**: $0.7702$ ($-0.1031$ vs. C0)
  - **FPR**: $37.33\%$ ($+24.66\text{ pp}$ vs. C0; $56$ false alarms out of $150$ bona-fide calls)
  - **FNR**: $21.33\%$ ($-3.34\text{ pp}$ vs. C0)
  - **EER**: $31.33\%$ ($+8.66\text{ pp}$ vs. C0)
  - **EER Threshold**: $0.5485$
  - **Confusion Matrix**: $\text{TN}=94, \text{FP}=56, \text{FN}=32, \text{TP}=118$
* **Scientific Assessment**: **PARTIALLY SUPPORTED under the tested digital transform; no production-safe threshold was established**. A-law companding degrades FPR to $37.33\%$. Performance represents **software simulation only; real carrier telephony was NOT VERIFIED**.

---

### 5. 8 kHz Round-Trip Resampling (Condition C1)

* **Transform Implementation**:
  1. Input 16 kHz float32 waveform.
  2. Downsampled to 8 kHz using `torchaudio.transforms.Resample(16000, 8000)`.
  3. Upsampled back to 16 kHz using `torchaudio.transforms.Resample(8000, 16000)`.
  4. Both stages apply sinc interpolation with standard Kaiser windowing to prevent aliasing.
* **Acoustic Impact**: Eliminates all harmonic and spectral energy above the 4,000 Hz Nyquist cutoff.
* **Authoritative Results (`robust_unseen_evaluation_report.json`, Fixed $\theta = 0.50$)**:
  - **Accuracy**: $65.33\%$ ($-16.00\text{ pp}$ vs. C0)
  - **Precision**: $61.98\%$ ($-23.63\text{ pp}$ vs. C0)
  - **Recall**: $79.33\%$ ($+4.00\text{ pp}$ vs. C0)
  - **F1 Score**: $0.6959$ ($-0.1055$ vs. C0)
  - **ROC-AUC**: $0.7187$ ($-0.1546$ vs. C0)
  - **FPR**: $48.67\%$ ($+36.00\text{ pp}$ vs. C0; nearly half of all bona-fide calls trigger false alarms)
  - **FNR**: $20.67\%$ ($-4.00\text{ pp}$ vs. C0)
  - **EER**: $35.33\%$ ($+12.66\text{ pp}$ vs. C0)
  - **EER Threshold**: $0.5711$
  - **Confusion Matrix**: $\text{TN}=77, \text{FP}=73, \text{FN}=31, \text{TP}=119$
* **Scientific Assessment**: **PARTIALLY SUPPORTED under the tested digital transform; no production-safe threshold was established**. Bandwidth truncation to 8 kHz severely degrades specificity ($48.67\%$ FPR). Performance represents **software simulation only; real carrier telephony was NOT VERIFIED**.

---

### 6. Telephone Bandpass Filtering (Condition C4)

* **Transform Implementation**:
  4th-order Butterworth bandpass filter spanning 300.0 Hz to 3400.0 Hz at 16 kHz, implemented using Second-Order Sections (`scipy.signal.sosfilt`).
* **Authoritative Results (`robust_unseen_evaluation_report.json`, Fixed $\theta = 0.50$)**:
  - **Accuracy**: $53.33\%$ ($-28.00\text{ pp}$ vs. C0)
  - **Precision**: $52.07\%$ ($-33.54\text{ pp}$ vs. C0)
  - **Recall**: $84.00\%$ ($+8.67\text{ pp}$ vs. C0)
  - **F1 Score**: $0.6429$ ($-0.1585$ vs. C0)
  - **ROC-AUC**: $0.6119$ ($-0.2614$ vs. C0; severe degradation towards random guessing)
  - **FPR**: $77.33\%$ ($+64.66\text{ pp}$ vs. C0; $116$ out of $150$ bona-fide calls falsely flagged as deepfakes)
  - **FNR**: $16.00\%$ ($-8.67\text{ pp}$ vs. C0)
  - **EER**: $44.33\%$ ($+21.66\text{ pp}$ vs. C0; near chance $50\%$)
  - **EER Threshold**: $0.6676$
  - **Confusion Matrix**: $\text{TN}=34, \text{FP}=116, \text{FN}=24, \text{TP}=126$
* **Scientific Assessment**: **NOT READY**. Bandpass filtering causes near-complete classification failure on authentic speech ($77.33\%$ false alarms).

---

### 7. Additive Gaussian Noise & EXP-2B Data Reconciliation

A critical distinction must be drawn between two distinct evaluations documented in the repository:
1. **Dimension 1: Candidate Models Retrained with Dedicated Noise Slices (EXP-2B-NOISE)**:
   In experiment EXP-2B-NOISE (`docs/ai/exp_2b_noise_robustness_report.md` and `scratch/exp_2b_noise/exp_2b_results.json`), four candidate models were trained with noise slices fixed at 10, 15, 20, or 25 dB SNR (`Model N10`, `Model N15`, `Model N20`, `Model N25`). Each candidate was evaluated across all standard held-out conditions C0 through C5 ($N = 300$, balanced $1:1$, fixed $\theta = 0.50$).
2. **Dimension 2: The Frozen Protected Production Model Tested Under Cross-SNR Conditions**:
   The frozen production model (`robust_mini_acoustic_cnn_v1`) was evaluated against cross-SNR test conditions: C5 (15 dB), N10 (10 dB), N20 (20 dB), and N25 (25 dB).

Both data dimensions are authoritative and fully verified in their respective artifacts:

#### A. Authoritative EXP-2B-NOISE Candidate Model Results (C0–C5 Across Candidates)

Source: `docs/ai/exp_2b_noise_robustness_report.md` and `scratch/exp_2b_noise/exp_2b_results.json`:

* **Candidate Model N10 (Trained with 10 dB Noise Augmentation)**:
  - Checkpoint: `.../scratch/exp_2b_noise/checkpoints/model_noise_10db.pt` (SHA: `D656360E21D0E45C...`)
  - **C0 (Clean 16 kHz)**: FPR $36.00\%$, Recall $84.67\%$, F1 $0.7674$, ROC-AUC $0.8556$
  - **C1 (8 kHz Round-Trip)**: FPR $86.00\%$, Recall $86.00\%$, F1 $0.6548$, ROC-AUC $0.6693$
  - **C2 (G.711 μ-law)**: FPR $91.33\%$, Recall $91.33\%$, F1 $0.6587$, ROC-AUC $0.7052$
  - **C3 (G.711 A-law)**: FPR $88.67\%$, Recall $90.67\%$, F1 $0.6700$, ROC-AUC $0.7115$
  - **C4 (Telephone Bandpass)**: FPR $82.67\%$, Recall $85.33\%$, F1 $0.6337$, ROC-AUC $0.6634$
  - **C5 (Additive Noise 15 dB)**: FPR $74.67\%$, Recall $80.67\%$, F1 $0.6205$, ROC-AUC $0.5297$
* **Candidate Model N15 (Trained with 15 dB Noise Augmentation)**:
  - Checkpoint: `.../scratch/exp_2b_noise/checkpoints/model_noise_15db.pt` (SHA: `F218926DB53BFA22...`)
  - **C0 (Clean 16 kHz)**: FPR $30.67\%$, Recall $82.67\%$, F1 $0.7750$, ROC-AUC $0.8810$
  - **C1 (8 kHz Round-Trip)**: FPR $92.67\%$, Recall $94.00\%$, F1 $0.6558$, ROC-AUC $0.6959$
  - **C2 (G.711 μ-law)**: FPR $94.67\%$, Recall $95.33\%$, F1 $0.6575$, ROC-AUC $0.7243$
  - **C3 (G.711 A-law)**: FPR $94.67\%$, Recall $96.00\%$, F1 $0.6606$, ROC-AUC $0.7254$
  - **C4 (Telephone Bandpass)**: FPR $93.33\%$, Recall $92.00\%$, F1 $0.6449$, ROC-AUC $0.6455$
  - **C5 (Additive Noise 15 dB)**: FPR $90.67\%$, Recall $94.67\%$, F1 $0.6636$, ROC-AUC $0.5604$
* **Candidate Model N20 (Trained with 20 dB Noise Augmentation)**:
  - Checkpoint: `.../scratch/exp_2b_noise/checkpoints/model_noise_20db.pt` (SHA: `16BF024F58BE6D3D...`)
  - **C0 (Clean 16 kHz)**: FPR $62.00\%$, Recall $92.67\%$, F1 $0.7277$, ROC-AUC $0.8009$
  - **C1–C4 (Degraded Channels)**: FPR $100.00\%$, Recall $100.00\%$, F1 $0.6667$, ROC-AUC $0.5124\text{--}0.5633$
  - **C5 (Additive Noise 15 dB)**: FPR $99.33\%$, Recall $99.33\%$, F1 $0.6652$, ROC-AUC $0.5181$
* **Candidate Model N25 (Trained with 25 dB Noise Augmentation)**:
  - Checkpoint: `.../scratch/exp_2b_noise/checkpoints/model_noise_25db.pt` (SHA: `3981A203BB77A8A1...`)
  - **C0 (Clean 16 kHz)**: FPR $1.33\%$, Recall $39.33\%$, F1 $0.5592$, ROC-AUC $0.8826$
  - **C1 (8 kHz Round-Trip)**: FPR $46.00\%$, Recall $74.00\%$, F1 $0.6727$, ROC-AUC $0.7332$
  - **C2 (G.711 μ-law)**: FPR $44.67\%$, Recall $77.33\%$, F1 $0.6967$, ROC-AUC $0.7778$
  - **C3 (G.711 A-law)**: FPR $48.67\%$, Recall $78.67\%$, F1 $0.6921$, ROC-AUC $0.7728$
  - **C4 (Telephone Bandpass)**: FPR $75.33\%$, Recall $84.67\%$, F1 $0.6513$, ROC-AUC $0.6583$
  - **C5 (Additive Noise 15 dB)**: FPR $56.00\%$, Recall $66.00\%$, F1 $0.5946$, ROC-AUC $0.5813$

*Candidate Comparison Finding*: None of the EXP-2B candidate variants outperformed the protected production model across all operating conditions. Model N10 and N15 exploded clean false alarms ($30.67\%\text{--}36.00\%$), Model N20 suffered complete threshold collapse, and Model N25 missed $60.67\%$ of clean deepfakes.

#### B. Performance of the Protected Production Model Under Cross-SNR Conditions

Source: `scratch/exp_2b_noise/exp_2b_results.json` (`PROTECTED_PRODUCTION` entry) and `robust_unseen_evaluation_report.json` (Condition C5):

| Test Noise Condition | Accuracy | Precision | Recall | F1 Score | ROC-AUC | FPR | FNR | EER | EER Thresh | Confusion Matrix |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **C0 Clean Reference** | **81.33%** | **85.61%** | **75.33%** | **0.8014** | **0.8733** | **12.67%** | **24.67%** | **22.67%** | 0.4477 | TN:131, FP:19, FN:37, TP:113 |
| **N25 (25 dB SNR)** | 51.33% | 50.70% | 96.00% | 0.6636 | 0.5656 | **93.33%** | 4.00% | 47.67% | 0.7798 | TN:10, FP:140, FN:6, TP:144 |
| **N20 (20 dB SNR)** | 52.00% | 51.06% | 96.00% | 0.6667 | 0.5532 | **92.00%** | 4.00% | 46.67% | 0.7716 | TN:12, FP:138, FN:6, TP:144 |
| **C5 (15 dB SNR)** | 52.00% | 51.06% | 96.00% | 0.6667 | 0.5544 | **92.00%** | 4.00% | 46.67% | 0.7488 | TN:12, FP:138, FN:6, TP:144 |
| **N10 (10 dB SNR)** | 45.67% | 47.41% | 79.33% | 0.5935 | **0.4584** | **88.00%** | 20.67% | **50.67%** | 0.6941 | TN:18, FP:132, FN:31, TP:119 |

*Protected Model Finding*: The protected baseline model experiences extreme false-alarm saturation ($88.00\%\text{--}93.33\%$) when exposed to additive white Gaussian noise across all tested SNR levels ($10\text{--}25\text{ dB}$). At 10 dB SNR, discrimination collapses below random guessing ($0.4584$ ROC-AUC).

---

### 8. Packet Loss & Jitter Concealment Audit

* **Code Inspection**:
  - `backend/src/telephony/rtp/rtp_session.ts`: Implements RTP header sequence parsing, detects gaps, and computes packet loss percentages for streaming metrics.
  - `backend/tests/rtp_telephony.test.ts`: Validates that sequence number jumps increment the packet loss counter.
  - `ai/neural_prototype/results/phase2a_environment_audit.json`: Explicitly documents that VoIP packet loss simulation `"REQUIRES EXTERNAL TOOL/DATA"` (e.g. NetEm or Gilbert-Elliott loss model).
* **Statistical Reality**: Zero acoustic evaluations of the neural detector under packet deletion, burst loss, or packet loss concealment (G.711 Appendix I PLC) were conducted.
* **Scientific Verdict**: **PACKET LOSS ROBUSTNESS NOT VERIFIED**. Network-layer sequence logging cannot be substituted for acoustic classification robustness.

---

### 9. Audio Clipping Audit

* **Code Inspection**:
  - `ai/app/audio/quality.py`: Evaluates sample saturation:
    ```python
    clipping_samples = np.sum(abs_samples >= 0.985)
    clipping_ratio = float(clipping_samples / len(samples))
    ```
    Triggers `POOR` rating and elevates uncertainty penalty when `clipping_ratio > 0.08`.
  - `ai/tests/test_phase3_temporal_and_robustness.py`: Verifies that synthesized clipped waveforms trigger the uncertainty penalty.
* **Statistical Reality**:
  - The clipping detector is an operational quality gate, not a robust deepfake classifier.
  - Zero controlled evaluations of the acoustic model on clipped audio (e.g. evaluating ROC-AUC/EER across $1\%, 5\%, 10\%, 20\%$ clipping) exist.
* **Scientific Verdict**: **CLIPPING ROBUSTNESS NOT VERIFIED**.

---

### 10. General Resampling Audit

* **Evaluated Resampling**: Only the 16 kHz $\rightarrow$ 8 kHz $\rightarrow$ 16 kHz sinc round-trip (Condition C1) was evaluated.
* **Unverified Conversions**:
  - Resampling from 44.1 kHz (consumer audio/CD standard) to 16 kHz.
  - Resampling from 48 kHz (WebRTC / VoIP standard) to 16 kHz.
  - Resampling from 24 kHz or 22.05 kHz (common neural TTS output rates).
  - Cascaded / repeated non-integer resampling.
* **Scientific Verdict**: **GENERAL RESAMPLING ROBUSTNESS NOT VERIFIED**. Verified evidence is strictly limited to Condition C1.

---

### 11. General Lossy Compression Audit

* **Contract Scaffolding**:
  - `ai/app/deepfake/calibration.py` and `backend/src/calls/audio_normalizer.ts` contain lists of telephony codecs (`"amr"`, `"amrnb"`, `"amrwb"`, `"gsm"`, `"g729"`, `"opus"`, `"aac"`).
* **Statistical Reality**:
  - Zero empirical evaluations on lossy compressed speech corpora exist anywhere in the repository.
  - Neither Adaptive Multi-Rate (AMR-NB: 4.75–12.2 kbps, AMR-WB: 6.6–23.85 kbps), Opus (variable 6–32 kbps), AAC, nor MP3 has been evaluated against the acoustic model.
* **Scientific Verdict**: **LOSSY COMPRESSION ROBUSTNESS NOT VERIFIED**.

---

### 12. Combined Channel Impairments Audit

* **Training Reality**:
  In `train_robust_mini_acoustic_cnn.py`, augmentations were applied as disjoint, isolated slices (350 clean, 350 A-law, 350 mu-law, 350 bandpass, 350 noise). **Zero training samples received combined compound distortions** (e.g., bandpass + noise + codec).
* **Evaluation Reality**:
  - Both C4 (bandpass) and C5 (noise) independently cause logit scores to shift upward toward $1.0$.
  - When bandpass filtering and noise co-occur, false alarms saturate at $77\%\text{--}93\%$.
  - In EXP-2D-FUSE, combining the CNN with a 6-feature DSP classifier via logistic regression reduced C4 FPR from $77.33\%$ to $26.67\%$, but caused a $16.00\text{ pp}$ collapse in spoof recall ($84.00\% \rightarrow 68.00\%$).
* **Scientific Verdict**: **NOT READY**. Compound channel impairments cause severe, nonlinear performance degradation.

---

### 13. Real vs. Simulated Telephony

A strict scientific classification must be maintained between digital software transforms and physical telecommunication evidence:

| Dimension | Evidence Classification | Methodology in Repository | Valid for Production Claims? |
| :--- | :---: | :--- | :--- |
| **Real Physical Telephony Carrier** | **ABSENT** | Zero physical PSTN, VoLTE, VoNR, 3G, or 2G carrier recordings exist. | **PROHIBITED** |
| **Digital Codec Emulation** | **SIMULATED** | In-memory G.711 μ-law / A-law companding via `soundfile` (libsndfile). | **PARTIALLY SUPPORTED** (Digital Only) |
| **Digital Sample-Rate Conversion** | **SIMULATED** | Software sinc interpolation via `torchaudio.transforms.Resample`. | **PARTIALLY SUPPORTED** (Digital Only) |
| **Digital Bandpass Filtering** | **SIMULATED** | 4th-order Butterworth filter via `scipy.signal.sosfilt`. | **NOT READY** (Severe False Alarms) |
| **Synthetic Additive Noise** | **SIMULATED** | Independent white Gaussian noise at 10, 15, 20, 25 dB SNR. | **NOT READY** (Severe False Alarms) |
| **Physical Room / Device Replay** | **ABSENT** | Zero physical loudspeaker/microphone recordings exist. | **PROHIBITED** |

---

### 14. Descriptive Ordering of Tested Conditions

The tested conditions are presented below in descriptive ordering based on empirical ROC-AUC, FPR degradation, and EER for the protected model, rather than as a universal robustness ranking:

1. **Clean 16 kHz (C0)** — $\text{AUC} = 0.8733, \text{FPR} = 12.67\%, \text{EER} = 22.67\%$. Anchors optimal baseline discrimination on unseen vocoders.
2. **G.711 μ-law (C2)** — $\text{AUC} = 0.7849, \text{FPR} = 33.33\%, \text{EER} = 29.33\%$. **PARTIALLY SUPPORTED under the tested digital transform; no production-safe threshold was established**.
3. **G.711 A-law (C3)** — $\text{AUC} = 0.7702, \text{FPR} = 37.33\%, \text{EER} = 31.33\%$. **PARTIALLY SUPPORTED under the tested digital transform; no production-safe threshold was established**.
4. **8 kHz Round-Trip (C1)** — $\text{AUC} = 0.7187, \text{FPR} = 48.67\%, \text{EER} = 35.33\%$. **PARTIALLY SUPPORTED under the tested digital transform; no production-safe threshold was established**. High-frequency cutoff causes near $50\%$ false alarms.
5. **Telephone Bandpass (C4)** — $\text{AUC} = 0.6119, \text{FPR} = 77.33\%, \text{EER} = 44.33\%$. Severe failure condition; model loses discriminative power on filtered bona-fide speech.
6. **Moderate/Mild Noise (C5/N20/N25)** — $\text{AUC} \approx 0.55\text{--}0.56, \text{FPR} \ge 92.00\%, \text{EER} \approx 47\%$. Catastrophic false-alarm saturation.
7. **Severe Noise (N10, 10 dB)** — $\text{AUC} = 0.4584, \text{FPR} = 88.00\%, \text{EER} = 50.67\%$. Complete classification collapse (below random guessing).

---

### 15. Minimum Evidence Required for Telephony / Robustness Claims

Before commercial claims of telephony or noise robustness can be scientifically validated, the following evidence package is required:

* **Real Carrier-Grade Telephony Corpus**: Minimum $500$ authentic and $500$ synthetic calls transmitted over live mobile and PSTN networks.
* **Lossy Speech Codec Suite**: Benchmarking across AMR-NB ($4.75\text{--}12.2\text{ kbps}$), AMR-WB ($6.6\text{--}23.85\text{ kbps}$), Opus ($6\text{--}32\text{ kbps}$), and G.729.
* **VoIP Network Emulation**: Controlled packet loss sweeps ($1\%, 3\%, 5\%, 10\%$) with standardized packet loss concealment (PLC) algorithms.
* **Realistic Acoustic Noise Benchmark**: Testing against standard noise libraries (MUSAN, DEMAND) across multiple SNRs ($0\text{--}30\text{ dB}$) with non-stationary background interference.
* **Statistical Rigor**: Reporting Accuracy, Precision, Recall, F1, ROC-AUC, EER, and $95\%$ Confidence Intervals for every channel condition.

---

### 16. Definitive Production Decision

| Subsystem Dimension | Production Decision | Authoritative Rationale |
| :--- | :---: | :--- |
| **Production Acoustic Model** | **RETAIN FROZEN PRODUCTION MODEL** | The protected checkpoint `robust_mini_acoustic_cnn_v1` remains the best overall operational compromise; retrained noise candidates degraded clean audio or collapsed. |
| **Unqualified Telephony Claims** | **BLOCKED / PROHIBITED** | Claims must state: *"Evaluated on synthetic digital G.711 companding emulation; real carrier telephony was NOT VERIFIED."* |
| **Noise Robustness Claims** | **BLOCKED / PROHIBITED** | Noise robustness is scientifically invalid and must be removed from customer-facing documentation. |
| **Operating Threshold Guidance** | **RESTRICT TELEPHONY THRESHOLDS** | On wideband/clean audio, maintain Policy B ($\theta = 0.7950$) or Policy C Wideband ($\theta = 0.6850$) to keep FPR $< 5\%$. On the **tested 8 kHz digital round-trip condition**, Policy C Telephony ($\theta = 0.5250$) may be considered, acknowledging elevated false alarms ($\approx 35\%$). Never apply telephony thresholds to wideband mobile audio. |
| **Operational Abstention Policies** | **RETAIN AS CANDIDATE SAFETY POLICY** | Audio quality pre-screening thresholds for low SNR ($< 10\text{ dB}$) or severe bandpass filtering are **candidate engineering policies only, NOT empirically validated calibration rules**. Under degraded input, the pipeline must abstain (`INCONCLUSIVE`, `uncertainty \ge 0.80`) rather than issuing automated false-alarm blocks. |

---

## Cross-Task Limitations & Operational Failure Modes

A holistic cross-task synthesis reveals six fundamental operational failure modes that must govern production deployment:

1. **Acoustic Channel Collapse & False-Alarm Cascades**:
   Under telephone bandpass filtering (C4) or additive noise (C5, N10–N25), the acoustic CNN's logit scores on bona-fide speech shift drastically toward $1.0$. At default thresholds, $77\%\text{--}93\%$ of innocent calls trigger false alarms. Threshold tuning (e.g. Policy B: $\theta = 0.780$) reduces false alarms only by precipitating severe recall collapse ($48\%$ missed deepfakes).
2. **Biometric Identity Impairment**:
   Neural speaker verification is completely inactive due to missing ECAPA-TDNN ONNX weights. The active deterministic DSP fallback operates on uncalibrated cosine similarities without biometric trial benchmarks (zero genuine/impostor pairs, unknown FAR/FRR).
3. **Acoustic Replay False-Alarm Saturation**:
   The deterministic 3-cue replay heuristic triggered a $100\%$ false-alarm rate ($25/25$) on authentic Hindi mobile recordings. In the absence of physical replay corpora, active replay detection cannot be deployed to make automated blocking decisions.
4. **Multilingual Deepfake Generalization Gap**:
   While English deepfake detection is validated across 13 vocoders, Indic languages (Hindi, Telugu, Tamil, Marathi, Bengali) have **zero** synthetic training or evaluation samples. Validated transfer is strictly limited to bona-fide false-alarm benchmarking on Hindi, Telugu, and Tamil.
5. **ASR Advisory Invariant & Vulnerability to Coercion**:
   Faster-Whisper Base INT8 is staged locally but blocked by missing runtime dependencies. Downstream security intent detection is rule-based regex without empirical accuracy metrics. ASR output is strictly **UNTRUSTED INPUT** and cannot independently authorize actions.
6. **Uncalibrated Confidence & Heuristic Risk Metrics**:
   Output probabilities are uncalibrated sigmoid scores ($0.0\%$ ECE/Brier evaluations). Fused risk scores ($0\text{--}100$) and uncertainty values ($1.0 - \text{conf}$) represent heuristic engineering indices, not calibrated Bayesian probabilities.

---

## Definitive Production Recommendation & Governance

### 1. Retention of the Protected Production Model
Based strictly on empirical evidence across Tasks 1–8:
> [!IMPORTANT]
> **Authoritative Engineering Recommendation**:  
> **RETAIN THE FROZEN PRODUCTION MODEL: `robust_mini_acoustic_cnn_v1`**  
> *(Protected Checkpoint: `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`)*

**Empirical Rationale**:
- Across 6 exhaustive experimental investigations in Task 2 (EXP-2A through EXP-2D) and multi-SNR retraining in Task 8 (EXP-2B-NOISE), **no candidate model achieved a statistically or operationally defensible improvement** over the protected baseline without inflicting catastrophic collateral damage.
- Candidate models retrained with dedicated noise slices (EXP-2B-NOISE) either suffered severe clean-audio false-alarm explosions ($30.67\%\text{--}36.00\%$ FPR on Model N10/N15), complete threshold collapse (Model N20), or severe recall collapse (Model N25 missed $60.67\%$ of clean deepfakes).
- The protected production model remains the superior compromise across wideband clean speech ($81.33\%$ accuracy, $0.8733$ ROC-AUC, $75.33\%$ recall on unseen vocoders) and digital G.711 companding ($0.7849$ ROC-AUC on C2 μ-law, $0.7702$ on C3 A-law).

### 2. Prohibited Claims & Marketing Boundaries
The following commercial and technical claims are **strictly prohibited** across documentation, user interfaces, and customer presentations:
- **PROHIBIT**: Claiming "calibrated probabilities" or "calibrated confidence" (scores are uncalibrated sigmoids).
- **PROHIBIT**: Claiming "production-ready neural speaker verification" (weights are absent; DSP fallback is uncalibrated).
- **PROHIBIT**: Claiming "physical replay attack protection" (zero physical replay data exists; heuristic triggers 100% false alarms on mobile speech).
- **PROHIBIT**: Claiming "Indic deepfake detection" (zero synthetic Indic speech exists on disk).
- **PROHIBIT**: Claiming "real-world telephony / PSTN carrier robustness" (evidence is strictly digital software simulation).
- **PROHIBIT**: Claiming "noise robustness" (additive noise causes $88\%\text{--}93\%$ false alarms).
- **PROHIBIT**: Claiming "validated multilingual ASR" (runtime dependencies are uninstalled; WER/CER is unmeasured).

### 3. Operational Deployment Guidance
1. **Operating Thresholds**: On clean/wideband audio, deploy Policy B Wideband ($\theta = 0.7950$) or Policy C Wideband ($\theta = 0.6850$) to maintain false alarms $\le 5\%$. On tested 8 kHz digital streams, engage Policy C Telephony ($\theta = 0.5250$) while anticipating elevated false-alarm rates ($\approx 35\%$).
2. **Fail-Safe Abstention**: Operational safety must rely on structured abstention policies (`INCONCLUSIVE`, `POOR_QUALITY`, `INSUFFICIENT_AUDIO`) mapping to `MONITOR` or `REQUIRE_STEP_UP_VERIFICATION`, strictly preventing automated call termination on distorted bona-fide speech.
3. **Conversational Security**: Downstream intent signals (OTP/PIN solicitations) must only trigger advisory warnings and step-up authentication, never automated access grant or denial.

---

## Final Verification & Repository Integrity State

* **Git Branch**: `feature/bhavya-premium-ai`
* **Commit HEAD**: `7e4ced321e72bd16ffb6f7b2ad74c174fa8c3383`
* **Protected Checkpoint File**: `ai/neural_prototype/results/robust_training/best_robust_mini_acoustic_cnn.pt`
* **Protected Checkpoint Size**: $382{,}217\text{ bytes}$
* **Protected Checkpoint SHA-256**: `B8C0B623175A7D53204004690AAB3E1CBED921517189C80AD888EA5A3B7CBBC5` (Bitwise Match)
* **Tracked Production Files Modified**: **NONE**
* **Production Thresholds / Registries / Configs Modified**: **NONE**
* **Packages / Datasets / Models Downloaded or Installed**: **NONE**
* **Retraining Executed**: **NONE**
* **Validation Tasks Completed**: **Tasks 1 through 8 fully executed, audited, and consolidated.**
* **Git Commit**: **NONE**
