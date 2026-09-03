# Phase 3 — Step 3.4: Replay Narrowband Telephony Robustness & Confidence Hardening

## 1. Original Replay Behavior
In earlier iterations, `ReplayFeatureExtractor` and `ReplayDetector` evaluated acoustic playback cues using a hardcoded high-frequency roll-off threshold (`high_freq_cutoff_ratio < 0.04` and `spectral_decay_slope < -2.8`). When this cue triggered in isolation, the detector escalated the call to `LIKELY_REPLAY` (`replay_probability: 0.65`, `confidence: 0.60`).

## 2. Narrowband Telephony Risk
PSTN, VoIP (G.711 A-law/μ-law), and mobile cellular networks inherently band-limit audio to approximately $300\text{--}3400\text{ Hz}$. Even when resampled to the canonical $16\text{ kHz}$ linear PCM rate, legitimate human telephone audio possesses near-zero spectral energy above $4\text{ kHz}$. Consequently, legitimate callers routinely triggered the standalone high-frequency attenuation cue, resulting in false-positive replay alarms.

## 3. Root Cause
The feature extractor assumed all ingested audio was broadband microphone capture ($>4.5\text{ kHz}$ observable spectrum). It failed to differentiate between channel-induced bandpass filtering and physical loudspeaker transducer attenuation.

## 4. Design Decision
1. **Deterministic Channel Bandwidth Detection**: `ReplayFeatureExtractor` measures high-frequency power ratio ($f \ge 4500\text{ Hz}$ vs total energy). If high-band fraction is $<5\%$, it classifies the channel as `is_narrowband = True` ($3.8\text{ kHz}$ effective cutoff).
2. **Cue Attenuation on Narrowband Channels**: When `is_narrowband` is active, spectral roll-off is suppressed as a standalone replay cue and attributed to the transmission channel in explainability logs.
3. **Multi-Cue Verification**: Genuine replay attacks on narrowband channels can still be detected if secondary physical cues (e.g. double-room reverberation decay $>120\text{ ms}$ or non-linear impulse distortion $>8.0$) are present.
4. **Conservative Confidence Scaling**: On narrowband channels without playback cues, baseline `NOT_REPLAY` confidence is tempered from $0.82$ to $0.70$ to reflect that high frequencies were unobservable.

## 5. Files Changed
* `ai/app/replay/types.py`: Added `is_narrowband: bool` and `effective_bandwidth_hz: float` to `ReplayFeatureVector`.
* `ai/app/replay/features.py`: Implemented FFT power-ratio bandwidth classification and numerical clipping safety.
* `ai/app/replay/detector.py`: Implemented channel-aware cue attenuation and quality-penalized confidence scaling.
* `ai/tests/test_replay_detector.py`: Added comprehensive unit tests for narrowband speech, reverberation anomalies, and poor SNR uncertainty.

## 6. Tests Added & Modified
* `test_replay_narrowband_telephony_no_false_alarm`: Verifies $3.4\text{ kHz}$ bandlimited audio does not falsely trigger `REPLAY` or `LIKELY_REPLAY`.
* `test_replay_narrowband_with_independent_reverberation_and_distortion_cues`: Verifies secondary physical cues can still detect replay on telephone lines.
* `test_replay_poor_quality_increases_uncertainty`: Verifies POOR audio quality ratings trigger `UNCERTAIN` status with $0.20$ confidence.
* `test_replay_short_audio_insufficient_duration`: Verifies audio $<250\text{ ms}$ returns `UNCERTAIN` with `engine_type = None`.
* `test_replay_numeric_safety_on_silence`: Verifies all-zero audio evaluates cleanly without `NaN` or `Inf`.

## 7. Test Results
* `test_replay_detector.py`: **8 / 8 passed (100%)**.

## 8. Regression Results
* Full Python AI suite (`ai/tests/`): **89 / 89 passed (100%)**.
* Full Backend suite (`backend/tests/`): **97 / 97 passed (100%)**.
* TypeScript compilation (`tsc`): **0 errors (Clean build)**.

## 9. Confidence Semantics
Confidence values represent **heuristic decision certainty and signal quality margins**, NOT Bayesian posterior probabilities. Wording in docstrings and explainability metadata explicitly reflects heuristic evidence strength.

## 10. Uncertainty Behavior
Uncertainty expands ($\ge 0.80$) under:
* POOR audio quality ratings (severe clipping or low SNR $<4\text{ dB}$).
* Insufficient audio duration ($<250\text{ ms}$).
* Conflicting or ambiguous acoustic indicators.

## 11. Security Invariants
* $\text{Narrowband Channel} \ne \text{Automatically Authentic}$.
* $\text{Missing Features} \ne \text{Replay-Free}$.
* $\text{Poor Audio} \ne \text{Authentic}$.
* Numerical stability guaranteed: all probabilities and confidences strictly bounded in $[0.0, 1.0]$.
* No raw audio written to logs.

## 12. Known Limitations
* Heuristic DSP rules cannot detect software-equalized replay attacks designed to mimic telephone frequency profiles without secondary reverberation.
* In reverberant call centers, room reverberation decay may occasionally require multi-turn temporal aggregation.

## 13. Future Benchmark Validation Required
* Empirical Equal Error Rate (EER) on ASVspoof 2021 Physical Access (PA) and synthetic Indian telephony replay corpora.
* Statistical Platt / Isotonic probability calibration on real PSTN test splits.
