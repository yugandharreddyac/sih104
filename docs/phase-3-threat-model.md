# VOXSHIELD Phase 3 Threat Model: Acoustic & Biometric Attack Surfaces

## 1. Threat Taxonomy

| Threat Vector | Attack Mechanism | Countermeasure in Phase 3 |
| :--- | :--- | :--- |
| **TTS / Neural Vocoder Clones** | Generating speech via HiFi-GAN / WaveGrad | LFCC higher-order variance & phase jitter analysis in `DeepfakeDetector` |
| **Voice Conversion (VC)** | Modulating attacker voice pitch/formants | Acoustic spectral flatness & temporal prosody deviation detection |
| **Loudspeaker Replay** | Replaying pre-recorded executive audio | High-frequency cutoff & double reverberation decay estimation |
| **Biometric Impersonation** | Claiming VIP identity with unmatched voice | 128-dim x-vector cosine similarity comparison ($\tau = 0.70$) |
| **Enrollment Poisoning** | Submitting deepfake audio to create profile | Mandatory anti-spoof & quality pre-screening during enrollment |
| **Audio Splicing / Injection** | Injecting synthesized phrases mid-call | Waveform step discontinuity & packet repetition detection |
| **Adversarial Quality Exploitation** | Degrading audio quality to force spoof alarms | Quality-aware uncertainty scaling yielding `INCONCLUSIVE`, not `SUSPICIOUS` |
