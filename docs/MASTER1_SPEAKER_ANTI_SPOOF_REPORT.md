# MASTER 1 — AI SPEAKER & ANTI-SPOOF FINAL REPORT

**Document Version:** 1.0.0  
**Audit Date:** 2026-09-06  
**Repository Branch:** `feature/master1-speaker-antispoof`  
**Classification:** Engineering Audit & Production Integration Certification  

---

## 1. Executive Summary

This report documents the final audit and verification results for **MASTER 1 — AI SPEAKER & ANTI-SPOOF** in the VOXSHIELD SIH104 repository.

The scope of Master 1 is strictly confined to:
1. **Task 1 (Model Registry / Provenance Correction):** Removing false ASVspoof-trained claims and fabricated SHA-256 checksums from the replay detector registry entry.
2. **Task 2 (Deterministic DSP Replay Hardening):** Strengthening the multi-cue DSP physical loudspeaker playback detector against narrowband telephony false positives, silence, NaNs, and Infs.
3. **Task 3 (ECAPA Test Resilience):** Adapting the ECAPA-TDNN test suite to cleanly test both State A (real neural model available) and State B (deterministic DSP fallback active) without fabricating neural results or skipping required contract verifications.
4. **Task 4 (Pipeline Integration & Regression Validation):** Ensuring seamless integration through `ReplayDetector` $\rightarrow$ `UnifiedPipelineOrchestrator` $\rightarrow$ `CanonicalSignalBus` $\rightarrow$ `MultiModalRiskFusionEngine` $\rightarrow$ `Policy Decision` without modifying existing fusion, policy, or deepfake logic.

---

## 2. Model Architecture & Provenance Inventory

| Model / Subsystem | Registered ID | Architecture Type | Model Weights Status | Training Dataset / Provenance | Real-World Validation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Speaker Biometrics (Primary)** | `speaker_xvector_biometric_v3` | 192-dim ECAPA-TDNN (ONNX) | **NOT AVAILABLE** in repo checkout (`ai/models/speaker/ecapa_tdnn.onnx` absent) | SpeechBrain VoxCeleb 1 & 2 design | Offline simulated fixture calibration ($\theta=0.8800$); real model checkpoint absent on disk |
| **Speaker Biometrics (Fallback)** | `speaker_xvector_biometric_v3` | 128-dim FFT filterbank random projection | **EMBEDDED** in code (`ai/app/speaker/embedding.py`) | Deterministic mathematical pseudo-random projection (seed=42) | Functionally verified; unit L2 norm; $\theta=0.7000$ |
| **Physical Replay Detection** | `replay_spectral_decay_v3` | Multi-cue DSP / Heuristic | **NOT APPLICABLE** (Pure NumPy code; no weights) | **NONE** (No training dataset; no ASVspoof training) | **NOT SCIENTIFICALLY VALIDATED** against physical replay recordings; verified in unit/regression tests |

### Explicit Provenance Declarations
```text
TRAINED REPLAY MODEL: NOT AVAILABLE
REAL PHYSICAL REPLAY DATASET: NOT AVAILABLE / NOT USED
ACTIVE REPLAY ENGINE: DETERMINISTIC DSP / HEURISTIC FALLBACK
REAL-WORLD REPLAY METRICS: NOT VALIDATED
```

---

## 3. Mathematical Replay Feature Audit

The 7 deterministic acoustic cues implemented in `ai/app/replay/features.py` were audited for mathematical rigor:

1. **High-Frequency Spectral Cutoff Ratio:**
   $$\text{ratio} = \frac{\sum_{f \ge 4500} |X(f)|}{\max\left(\sum_{f < 3000} |X(f)|, 10^{-5}\right)}$$
   - *Audit:* Numerator and denominator use magnitude spectrum. Guarded against zero energy. Narrowband PSTN/telephony channels attenuate frequencies $>3.4\text{ kHz}$; the detector explicitly accounts for this via `is_narrowband` attenuation to prevent false alarms on phone calls.
2. **Spectral Flatness (Wiener Entropy):**
   $$\text{SF} = \frac{\exp\left(\frac{1}{K}\sum_{k=1}^K \ln(|X(k)|^2 + 10^{-12})\right)}{\frac{1}{K}\sum_{k=1}^K |X(k)|^2}$$
   - *Audit:* Evaluated on power spectrum $|X(k)|^2$. Bounded in $[0.0, 1.0]$. Clean harmonic voices have low flatness; loudspeaker transmission increases diffuse spectral flatness. Gated off when $\text{RMS} < 0.005$.
3. **Spectral Centroid & Spectral Bandwidth:**
   $$\mu_f = \frac{\sum f \cdot |X(f)|}{\sum |X(f)|}, \quad \sigma_f = \sqrt{\frac{\sum (f - \mu_f)^2 \cdot |X(f)|}{\sum |X(f)|}}$$
   - *Audit:* Denominators strictly match the magnitude spectrum weighting of the numerators ($\sum |X(f)|$). Numerically safe with positive clipping under the square root.
4. **Spectral Decay Slope:**
   $$\text{Log-linear regression of } \ln(|X(f)|) \text{ against } \ln(f)$$
   - *Audit:* Regularized with $\max(f, 1.0)$ and $\max(|X(f)|, 10^{-6})$. Slope is clipped to $[-20.0, 20.0]$ and guarded against flat or zero variance spectra.
5. **Reverberation Autocorrelation Decay:**
   $$\text{Envelope Autocorrelation: } R_{ee}(\tau) = \sum |s(t)| \cdot |s(t+\tau)|$$
   - *Audit:* Evaluates decay time to $R_{ee}(\tau) < 0.3 \cdot R_{ee}(0)$. Gated by energy variance ($\text{var} > 10^{-5}$, $\text{RMS} \ge 0.01$) to prevent false decay estimates on stationary silence or noise. Bounded in $[0, 1000]\text{ ms}$.
6. **Transducer Harmonic Non-Linearity:**
   $$\text{Residual Distortion} = \frac{\frac{1}{N}\sum (s(t)^3)^2}{(\text{var}(s) + 10^{-3})^3}$$
   - *Audit:* Normalizes cubic non-linear excursion against signal variance cubed. Gated when ADC clipping $> 15\%$ or when signal energy is near zero. Bounded in $[0.0, 100.0]$.
7. **Narrowband Telephony Channel Classifier:**
   $$f_{\max} \le 4500\text{ Hz} \quad \lor \quad (\text{ratio} < 0.04 \land \text{fraction} < 0.05 \land \mu_f < 2800\text{ Hz})$$
   - *Audit:* Accurately identifies 8 kHz PSTN/VoIP telephony audio and suppresses false positive loudspeaker alarms.
8. **Temporal Modulation Spectrum Analysis (4–20 Hz band):**
   $$E_{\text{mod, 4-20}} = \sum_{4 \le f_{\text{mod}} \le 20} |\text{FFT}(E_{\text{env}} \cdot w)|, \quad \text{ratio}_{4-20} = \frac{E_{\text{mod, 4-20}}}{\max(E_{\text{total}}, 10^{-6})}$$
   - *Audit:* Evaluates envelope downsampled at $f_{\text{env}} = 200\text{ Hz}$ ($10\text{ ms}$ window, $5\text{ ms}$ hop). Captures syllabic modulation dynamics and secondary enclosure smearing in the critical 4–20 Hz region. Bounded in $[0.0, 1.0]$.
9. **Cepstral / Homomorphic Quefrency Analysis (CPP & CER):**
   $$c[n] = \mathcal{F}^{-1}\{\ln(|X(f)|^2 + 10^{-12})\}, \quad \text{CPP} = \frac{c_{\text{peak}} - \mu_q}{\max(\sigma_q, 10^{-6})}$$
   - *Audit:* Operates in power spectrum domain consistently with spectral flatness. Quefrency search dynamically scales with sample rate ($2.5\text{ ms} - 15.0\text{ ms}$). Evaluates excitation peak prominence degradation caused by multipath reverberation. Bounded in $[0.0, 20.0]$. Low-quefrency ratio (CER) captures macro-envelope transfer characteristics in $[0.0, 1.0]$.

---

---

## 4. Phase 2 — Task 2.1: Temporal Replay Smoothing & Multi-Turn Gating

### Why Temporal Smoothing is Needed
Prior to Task 2.1, the deterministic DSP replay detector operated on independent, single-chunk audio frames (typically 250ms–1000ms). The Phase 2 audit identified three key vulnerabilities:
1. **Single-frame transient sensitivity:** Isolated noise, ambient room reflection spikes, or transient microphone bumps could abruptly alter replay status.
2. **No temporal hysteresis:** A single momentary clean frame inside an ongoing physical playback sequence could prematurely erase replay suspicion, and vice versa.
3. **Flapping on boundary conditions:** Rapidly alternating observations caused violent state transitions between frames.

### Architecture Decision & Integration
Rather than creating duplicate aggregation frameworks or mutating the stateless per-chunk detector, temporal tracking was designed as an aggregation/integration layer:
- **`ai/app/replay/temporal.py`:** Core `ReplayTemporalTracker` state machine managing hysteresis, bounded rolling observations, and deterministic score smoothing.
- **`ai/app/audio/temporal_aggregator.py`:** Embedded within `StreamTemporalSession` and `TemporalAggregator`. Tracks replay alongside existing deepfake spoof temporal metrics per `stream_id` / `call_id`.
- **`ai/app/pipeline/orchestrator.py` & `ai/app/audio/stream_pipeline.py`:** Ingests per-chunk observations and feeds temporally smoothed status and scores to downstream fusion and reporting.

### State Design & Strict Privacy Guarantees
The temporal layer stores **only minimal numeric and categorical metadata** in a bounded `collections.deque(maxlen=window_size)`:
```python
@dataclass(frozen=True)
class ReplayObservation:
    raw_probability: Optional[float]
    status: ReplayStatus
    confidence: Optional[float]
    high_frequency_loss: bool
    reverberation_decay_anomaly: bool
    is_speech: bool
    is_valid: bool
```
**Security & Privacy Verification:**
- Zero raw audio samples or PCM bytes stored.
- Zero base64 audio payloads stored.
- Zero transcripts or textual data stored.
- Zero speaker embeddings or biometric vectors stored.
- Strict $O(1)$ memory bound with default `window_size = 8` (2.0 seconds at 250ms chunk rate).

### Hysteresis State Machine & Transition Heuristics
The state machine implements conservative engineering heuristics:
1. **Confirmation Gating ($\ge 2$ consecutive chunks):** An initial replay observation transitions the state to `LIKELY_REPLAY` (suspicion). At least 2 consecutive replay-like frames are strictly required to confirm `REPLAY`.
2. **Recovery Cooldown ($\ge 3$ consecutive clean chunks):** An isolated clean chunk inside confirmed replay demotes state to `LIKELY_REPLAY`, holding suspicion. At least 3 consecutive clean frames are required to transition back to `NOT_REPLAY`.
3. **Transient Attenuation:** A single isolated replay transient immediately followed by clean audio reverts cleanly to `NOT_REPLAY`.
4. **Alternation / Instability Gating:** Rapidly flipping observations ($\ge 3$ status flips in 4 chunks) trigger `UNCERTAIN` status with penalized confidence ($\le 0.45$), avoiding decision flapping.
5. **Decay on Uncertainty:** Persistent degraded/uncertain audio ($\ge 3$ chunks) decays confidence and transitions state to `UNCERTAIN`, preventing stale replay hypotheses from persisting indefinitely on invalid input.

### Reset Semantics
- `ReplayTemporalTracker.reset()` completely clears the deque, resets consecutive counters, and restores initial `NOT_REPLAY` state.
- `TemporalAggregator.remove_session(stream_id)` resets and destroys the associated session tracker, guaranteeing zero state leakage across calls or speakers.

### Provenance Declaration
```text
TEMPORAL AGGREGATION PROVENANCE:
DSP / HEURISTIC TEMPORAL AGGREGATION
NOT a trained, calibrated, or scientific machine learning model.
Operating scores (e.g. 0.88, 0.65, 0.25, 0.12) are heuristic metrics aggregated via rolling median.
```

---

## 5. Phase 2 — Task 2.2: Temporal Modulation & Cepstral / Homomorphic Features

### Acoustic Rationale & Domain Analysis
Physical loudspeaker playback introduces dual-enclosure convolutive smearing, non-linear speaker driver compression, and multipath acoustic reflections:
1. **Temporal Modulation Spectrum:** Natural speech exhibits syllabic envelope modulation concentrated in 2–8 Hz. Loudspeaker playback in secondary enclosures smears envelope dynamics and alters modulation energy distribution in the 4–20 Hz band.
2. **Cepstral / Homomorphic Analysis:** By operating in the quefrency domain ($c[n] = \mathcal{F}^{-1}\{\ln P(f)\}$), convolutive room transfer functions become additive. Direct human speech exhibits a sharp, prominent cepstral pitch peak ($2.5\text{ ms} - 15.0\text{ ms}$). Replay through loudspeakers and room reflections causes multipath phase cancellation that degrades Cepstral Peak Prominence (CPP) while inflating the low-quefrency macro-envelope ratio (CER).

### Mathematical Formulations
- **Envelope Modulation Ratio (4–20 Hz):**
  $$E[m] = \sqrt{\frac{1}{L}\sum_{k=0}^{L-1} s[mH + k]^2}, \quad f_{\text{env}} = 200\text{ Hz} \ (H = 5\text{ ms}, L = 10\text{ ms})$$
  $$E_{\text{mod, 4-20}} = \sum_{4 \le f_{\text{mod}} \le 20} |\text{rfft}(E_{\text{detrend}} \cdot w)|, \quad \text{ratio}_{4-20} = \frac{E_{\text{mod, 4-20}}}{\max(E_{\text{total}}, 10^{-6})}$$
- **Modulation Spectral Entropy:**
  $$p[k] = \frac{M[k]}{\sum M[k] + 10^{-12}}, \quad H_{\text{mod}} = -\frac{\sum p[k] \ln(p[k] + 10^{-12})}{\ln(K)}$$
- **Cepstral Peak Prominence (CPP):**
  $$c[n] = \text{irfft}(\ln(|X(f)|^2 + 10^{-12})), \quad \text{CPP} = \frac{\max(c_{\text{pitch}}) - \mu_q}{\max(\sigma_q, 10^{-6})}$$
  Evaluated across physical pitch quefrency range $2.5\text{ ms} \le q \le 15.0\text{ ms}$ (dynamically scaled by $f_s$).
- **Low-Quefrency Energy Ratio (CER):**
  $$\text{CER} = \frac{\sum_{n=1}^{12} c[n]^2}{\max\left(\sum_{n=1}^{128} c[n]^2, 10^{-6}\right)}$$

### Sample-Rate & Narrowband Telephony Handling
- $f_{\text{env}} = 200\text{ Hz}$ is invariant to audio sample rate because hop $H = 0.005 \times f_s$.
- Quefrency search ranges ($q_{\min} = 0.0025 \times f_s, q_{\max} = 0.0150 \times f_s$) scale dynamically to maintain exact physical pitch bounds across both 8 kHz telephony and 16 kHz wideband.
- Operates within speech band ($< 3.4\text{ kHz}$), providing valuable corroboration over telephony channels where high-frequency roll-off cues are unobservable.

### Detector Integration & Provenance
- **Corroborating Evidence Only:** The new features **never** trigger `REPLAY` in isolation without physical playback cues (reverberation decay anomaly, non-linear distortion, or high-frequency roll-off).
- **Confidence Adjustment:** When physical cues are present, corroborated modulation smear or degraded CPP increases confidence ($+0.03$ to $+0.05$).
- **Threshold Provenance:** All thresholds are explicitly classified as **ENGINEERING HEURISTICS**.
- **Formal Provenance Declaration:**
  ```text
  These DSP features have not been scientifically validated against a labeled physical replay corpus.
  ```

### Performance & Latency Benchmark (Measured)
Measured on local environment (Windows 11, Python 3.13.7, NumPy 2.x on standard x86-64 CPU, 100 runs after warmup):
- **0.25s audio chunk (streaming pipeline default):**
  - Mean: $5.253\text{ ms}$
  - Median (p50): $5.308\text{ ms}$
  - 95th percentile (p95): $6.897\text{ ms}$
- **1.0s audio segment:**
  - Mean: $22.791\text{ ms}$
  - Median (p50): $18.836\text{ ms}$
  - 95th percentile (p95): $56.065\text{ ms}$

---

## 6. ECAPA-TDNN Speaker Verification Status

* **Model File on Disk:** `ai/models/speaker/ecapa_tdnn.onnx` is absent (listed in `.gitignore`).
* **Active Runtime Mode:** State B (Deterministic DSP Fallback).
* **Dimensionality:**
  - Neural mode (State A): 192 dimensions ($||\mathbf{e}||_2 = 1.0 \pm 10^{-3}$).
  - Fallback mode (State B): 128 dimensions ($||\mathbf{e}||_2 = 1.0 \pm 10^{-3}$).
* **Thresholds:**
  - Neural operating point: $\tau_{\text{neural}} = 0.8800$ (untouched).
  - Fallback operating point: $\tau_{\text{fallback}} = 0.7000$ (untouched).
* **Dimension Mismatch Rejection:** Enrolled profile of one dimension compared against an incoming embedding of a different dimension safely produces `SpeakerVerificationStatus.MISMATCH` with `verification_method="DIMENSION_MISMATCH_REJECT"` and similarity $0.0$.
* **Production Speaker Code:** 100% untouched (`ai/app/speaker/*`).

---

## 7. Risk Fusion & Policy Preservation

* **Untouched Modules:**
  - `ai/app/fusion/engine.py` (MultiModalRiskFusionEngine)
  - `ai/app/fusion/signal_contract.py` (CanonicalSignalBus)
  - `ai/app/fusion/matrix.py` (RiskMatrixCalculator)
  - `ai/app/fusion/temporal.py` (TemporalRiskEngine)
  - `ai/app/deepfake/calibration.py` (AcousticThresholdProfile, Wideband 0.6850, Telephony 0.5250)
  - `ai/app/policy/*`
* **Signal Integration:**
  - Replay signals map cleanly to `SignalCategory.REPLAY`, contributing to `dimensions.replay_injection` (weight 0.10).
  - Speaker signals map cleanly to `SignalCategory.IDENTITY`, contributing to `dimensions.identity_impersonation` (weight 0.20).
  - Combined threats trigger cross-modal corroboration multipliers ($1.25\times$ to $1.80\times$) in the fusion matrix without altering decision logic.

---

## 8. Physical Replay Dataset Availability & Evaluation Audit (Phase 2)

### 8.1 Dataset Discovery Findings
An exhaustive inspection of the local workspace, storage manifests, and documentation revealed:
* **ASVspoof 2021 DF Track:** Present in `datasets/raw/asvspoof/` (partially downloaded, evaluated for synthetic speech / neural vocoders A07–A19). This is the **Deepfake (DF)** track, NOT the Physical Access (PA) replay track.
* **IndicVoices:** Present in `datasets/metadata/` with only `bona_fide` live human speech across 6 Indian languages.
* **Indic Parler-TTS:** Synthetic text-to-speech corpus.
* **Physical Replay / PA Corpora:** **Zero** physical replay datasets (e.g., ASVspoof 2017 v2, ASVspoof 2019 PA, ASVspoof 2021 PA, or Replayed Acoustic Corpus) exist in the repository or are configured locally.

### 8.2 Evaluation Decision: OPTION C — DATASET UNAVAILABLE
* **Status Statement:**
  > **"Not evaluated due to unavailable labeled physical replay dataset."**
  > **"These DSP features have not been scientifically validated against a labeled physical replay corpus."**
* **Calibration Decision:** **Data insufficient for defensible trained calibration.** No classifier (e.g. Logistic Regression or neural net) was trained or calibrated, preventing fabricated or overfitted accuracy metrics.
* **Active Backend:** Explicitly preserved as **DSP / HEURISTIC FALLBACK**.

### 8.3 Reproducible Evaluation Pathway
To enable future evaluation without committing raw audio corpora into Git:
* Evaluator Module: `ai/app/replay/evaluator.py` (`ReplayDatasetEvaluator`)
* CLI Evaluation Tool: `ai/scripts/evaluate_replay_dataset.py`
  - Accepts external dataset directory (`--dataset-dir`) and protocol file (`--protocol`).
  - Discovers samples and parses labels (`bonafide` vs `replay`).
  - Supports `--compare-baseline` to run exact ablation between Baseline (Cues 1–4) and Phase 2 Enhanced (Cues 1–6).
  - Computes exact binary metrics (TPR, FPR, Precision, F1, Accuracy) and ranking metrics (ROC-AUC via Mann-Whitney U, EER via crossover).
  - Outputs structured markdown evaluation reports.
  - Exits cleanly with status message when dataset path is unavailable or empty.

---

## 9. Test Suite & Validation Results

| Test Suite | File | Tests Run | Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Replay Dataset Evaluator (Task 2.3)** | `ai/tests/test_replay_evaluator.py` | 11 passed | **PASS** | Missing path, empty dir, malformed metadata, deduplication, determinism, ROC-AUC, EER, degenerate distributions, train/test separation |
| **Replay Modulation & Cepstral Features (Task 2.2)** | `ai/tests/test_replay_features_task2_2.py` | 15 passed | **PASS** | Synthetic AM, reverberant, 8k/16k, short, silence, NaN/Inf |
| **Replay Temporal Smoothing (Task 2.1)** | `ai/tests/test_replay_temporal.py` | 15 passed | **PASS** | Hysteresis, transients, recovery, reset, determinism, privacy |
| **Replay Per-Chunk Detector** | `ai/tests/test_replay_detector.py` | 14 passed | **PASS** | Multi-cue, narrowband, silence, NaN/Inf safety |
| **Phase 3 Temporal & Robustness** | `ai/tests/test_phase3_temporal_and_robustness.py` | 6 passed | **PASS** | Warm-up, transient spike recovery, call isolation |
| **Speaker Verification (P1-1)** | `ai/tests/test_p1_1_speaker_verification.py` | 17 passed, 6 skipped | **PASS** | 6 neural tests skipped cleanly due to absent ONNX file |
| **Risk Fusion Engine & Signal Bus** | `ai/tests/test_risk_fusion.py` | 5 passed | **PASS** | Signal bus, dimension mapping, combined risk |
| **P0-4 Telephony Policy** | `ai/tests/test_p0_4_telephony_policy.py` | 21 passed | **PASS** | Dual-mode $\theta=0.6850$ vs $\theta=0.5250$ switching |
| **End-to-End Pipeline** | `ai/tests/test_end_to_end_pipeline.py` | 2 passed | **PASS** | Telephony replay + speaker fallback + NaN/Inf safety |
| **Total Test Count** | — | **106 passed, 6 skipped** | **100% PASS** | Zero failures across all suites |

---

## 10. Security, Privacy & Safety Verification

1. **Zero Raw Audio Persistence:** Audio base64 payloads and raw sample arrays are never saved to disk or serialized in logs.
2. **Zero Biometric Vector Leaks:** Raw floating-point embedding vectors are not logged; only dimensionality and cosine similarity are recorded.
3. **Zero Audio Stored in Temporal Layer:** Observation history stores only float metrics and categorical flags; arrays and bytes are never retained.
4. **Sanitization:** `np.nan_to_num` sanitizes all audio arrays against `NaN`, `+Inf`, and `-Inf`.
5. **Failure Isolation:** Any exception raised within `SpeakerVerifier` or `ReplayDetector` is trapped by `UnifiedPipelineOrchestrator`, marked as `MODEL_UNAVAILABLE`, and active calls continue without crashing.

---

## 11. Remaining Limitations & Future Work

1. **Real Physical Replay Validation:** The active replay detector and temporal smoothing layer are deterministic DSP heuristics. While mathematically sound and stabilized against transient false alarms, **they have not been benchmarked on physical loudspeaker re-recording datasets (e.g. ASVspoof 2019 PA)**. True calibration requires downloading a physical re-recorded corpus (e.g. ASVspoof 2019 PA, ~30GB) and running `python ai/scripts/evaluate_replay_dataset.py`.
2. **ECAPA Checkpoint Procurement:** To achieve neural 192-dim speaker verification, the verified SpeechBrain ONNX model file (`ai/models/speaker/ecapa_tdnn.onnx`) must be placed in the designated path. Until then, the system safely and reliably runs on the 128-dim DSP fallback.


