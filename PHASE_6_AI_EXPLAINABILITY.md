# VOXSHIELD — PHASE 6: AI EXPLAINABILITY & RISK VISUALIZATION

## 1. PHASE OBJECTIVE
Phase 6 establishes transparent, operationally actionable, and traceable AI explainability for VOXSHIELD without altering underlying detection logic or neural model inference. 

The primary investigative question this architecture answers is:
> **"Why did VOXSHIELD assign this risk level, which detector produced each signal, and what evidence supports the decision?"**

---

## 2. EXPLAINABILITY ARCHITECTURE
VOXSHIELD's explainability model follows a strict, traceable causal progression from raw telemetry to operational intervention:

$$\text{OBSERVED EVIDENCE} \longrightarrow \text{DETECTED SIGNAL} \longrightarrow \text{RISK DIMENSION} \longrightarrow \text{RISK AGGREGATION} \longrightarrow \text{RISK LEVEL} \longrightarrow \text{POLICY TRIGGER} \longrightarrow \text{RESPONSE}$$

### Modular Explainability Suite (`frontend/src/components/explainability/`)
1. **`ExplainabilitySummary.tsx`**: High-contrast operational verdict card displaying the current composite threat score, risk trajectory, AI model confidence, risk velocity, and governing policy.
2. **`WhyThisRisk.tsx`**: Interactive 7-step causal progression answering:
   - *What was observed?* (Raw evidence cue)
   - *Which detector identified it?* (Specific neural model / DSP detector)
   - *Which dimension was affected?* (10D category affected)
   - *How did it impact risk?* (Threat score contribution)
   - *What is the resulting risk?* (Operational severity)
   - *Which policy was triggered?* (Deterministic rule ID)
   - *What response followed?* (Enforced countermeasure)
3. **`RiskDimensionMatrix.tsx`**: Decomposes threat scores across 10 security dimensions with threshold limit exceedances, model attributions, and filter toggles (`ALL`, `ACTIVE`, `NOMINAL`).
4. **`DetectorProvenance.tsx`**: Comprehensive subsystem view distinguishing raw detector values (e.g. cosine similarity, spoof probability) from normalized risk factors and operational risk.
5. **`RiskTimeline.tsx`**: Chronological multi-turn risk evolution and dynamic recovery trajectory (verifying that risk unlatches when threats cease).
6. **`SignalEvidenceModal.tsx`**: Deep-dive inspection modal displaying full technical provenance, evidence findings, latency, and threshold limits.

---

## 3. REAL DATA SOURCES & BACKEND INTEGRATION
All explainability metrics and signals are directly bound to authentic backend APIs and runtime state:
- **`GET /api/calls`**: Active and historic voice sessions.
- **`GET /api/risk/:callId`**: Returns composite risk score, risk level, confidence, velocity, 10D factor decomposition, primary drivers, and `dimension_provenance`.
- **`GET /api/risk/:callId/timeline`**: Chronological array of turn-by-turn evaluations recording `turnIndex`, `overallScore`, `riskLevel`, `velocity`, `timestamp`, `primaryDrivers`, `policyId`, and `recommendedAction`.
- **`GET /api/risk/:callId/evidence`**: Evidence graph nodes, edges, and corroborated findings.

---

## 4. RISK IS NOT CONFIDENCE (CRITICAL DECOUPLING)
A core principle of Phase 6 is the explicit conceptual and visual separation of **Operational Risk** from **AI Model Confidence**:
- **Operational Risk (0–100)**: Reflects the severity and policy impact of the interaction computed by the deterministic fusion engine. A score of `100/100` signifies a critical threat requiring immediate containment.
- **AI Model Confidence (0–100%)**: Represents detector certainty. A detector may have 66% confidence in a spoof finding, yet that finding triggers a critical policy resulting in 100/100 risk.
- **Risk is never labeled as confidence, probability of attack, or AI certainty.**

---

## 5. DETECTOR PROVENANCE MAPPING
VOXSHIELD maps observed signals directly to the governing models:
- **Neural Acoustic Deepfake Detection**: `robust_mini_acoustic_cnn_v1` + `aasist` (Raw spoof probability, threshold `0.525` telephony / `0.685` wideband).
- **Speaker Biometric Verification**: `speaker_xvector_biometric_v3` (ECAPA-TDNN) (Raw cosine similarity vs enrolled biometric embedding, threshold `0.72`).
- **Sensitive Data & Credential Protection**: `sensitive_data_detector_v4` (Deterministic pattern matching for OTP, PIN, MFA solicitations).
- **Conversational Social Engineering**: `social_eng_multi_turn_v4` (Multi-turn psychological manipulation and urgency index).
- **Physical Replay & Loudspeaker Detection**: `replay_spectral_decay_v3` (Acoustic roll-off and room impulse response decay).
- **Automated Speech Recognition**: `faster_whisper_large_v3` (Real-time token sequence and turn segmentation).

---

## 6. 10-DIMENSIONAL DECOMPOSITION
The 10 standard security dimensions decomposed by VOXSHIELD:
1. `credential_theft`: Solicitation of MFA codes, OTPs, PINs, or password credentials.
2. `financial_fraud`: Unauthorized funds transfer or beneficiary modification requests.
3. `identity_impersonation`: Biometric mismatch against enrolled voice profile.
4. `deepfake_synthetic`: Synthetic vocoder artifacts or neural spoofing cues.
5. `account_takeover`: Requests for remote desktop tool installation (AnyDesk, TeamViewer).
6. `verification_bypass`: Coercive tactics to bypass secondary authentication.
7. `social_engineering`: False urgency, emotional pressure, or authority exploitation.
8. `replay_injection`: Acoustic loudspeaker playback and secondary reverberation.
9. `inconsistency`: Contradictory statements or identity claims across dialogue turns.
10. `channel_anomaly`: PSTN / VoIP transcoding anomalies and atypical spectral cutoffs.

---

## 7. MULTI-TURN RISK EVOLUTION & DYNAMIC RECOVERY
The system models risk as dynamic and responsive to the current conversation state:
- **Zero Frontend Latching**: The UI does not use `Math.max(previousRisk, currentRisk)`.
- **Dynamic Threat Decay**: When malicious intent (e.g. OTP request) ceases and the caller resumes benign conversation, the operational risk decays from `100` (`CRITICAL`) back down to `28.3` (`LOW`).
- **Timeline Trajectory**: Visualized as a turn-by-turn sparkline and chronological audit sequence with score deltas ($\Delta$).

---

## 8. DEGRADED MODES & MISSING DATA BEHAVIOR
Where data is absent, VOXSHIELD presents explicit, honest states:
- Missing confidence $\rightarrow$ `NOT AVAILABLE`
- Absent threshold $\rightarrow$ `THRESHOLD NOT AVAILABLE`
- Missing detector output $\rightarrow$ `NOT PROVIDED BY DETECTOR`
- Missing evidence cues $\rightarrow$ `NO EVIDENCE AVAILABLE`
- Empty session timeline $\rightarrow$ `NO TIMELINE TELEMETRY RECORDED`
- Degraded / offline AI engine $\rightarrow$ `INCONCLUSIVE` (Never defaults to false-safe 0 or GREEN).

---

## 9. VERIFICATION & TEST SUMMARY
- **TypeScript**: `npx tsc --noEmit` passed with 0 errors.
- **Backend Tests**: 32 suites passed (including all authentication, tenant isolation, privacy firewall, and risk safety tests).
- **Explainability Suite (`test_phase6_explainability.js`)**: All 10 Section 26 requirements passed.
- **Live Calls E2E (`test_phase7_live_e2e.js`)**: Full 4-turn benign $\rightarrow$ attack $\rightarrow$ recovery cycle verified live against WebSocket server.
- **Browser Audit**: 0 console errors, 0 failed network requests.
- **Responsive Viewports**: All 7 viewports verified with zero overflow and clean stacking.

---

## 10. HONEST OPERATIONAL LIMITATIONS
1. **Channel Codec Variations**: PSTN 8kHz G.711 narrow-band audio has lower spectral resolution than 16kHz wide-band, so acoustic deepfake confidence is calibrated against a lowered threshold (`0.525` vs `0.685`).
2. **First-Turn Baseline**: On Turn 0, speaker biometric verification and multi-turn social engineering require initial audio frames before emitting stable confidence metrics.
