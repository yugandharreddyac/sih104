# VOXSHIELD Phase 5 Evidence Graph & Explainability Model

## 1. Evidence Graph Structure
Every risk elevation produces a directed acyclic graph (DAG) connecting raw sensory cues to high-level policy conclusions:

```
[ Sensor Layer ]
  ├── Acoustic Signal Health (RMS: -24 dBFS, SNR: 22 dB)
  ├── Deepfake Detector (AASIST Phase Distortion: 0.12)
  ├── Speaker Verification (Cosine Similarity: 0.38 vs Enrolled CFO Profile)
  └── Streaming ASR (Word Confidence: 0.94, Language: EN)
        │
        ▼
[ Semantic & Behavioral Layer ]
  ├── Caller Claims ("Calling from Bank Security Department")
  ├── Intent Classifier ("OTP_REQUEST", Confidence: 0.92)
  ├── Behavioral Tactics (Authority Exploitation + Urgency + Verification Bypass)
  └── Multi-Turn Sequence (Stage: SECRET_HARVESTING_ATTEMPTED, Score: 0.88)
        │
        ▼
[ Evidence Corroboration Layer ]
  ├── Finding 1: Biometric speaker mismatch contradicts claimed CFO authority.
  ├── Finding 2: Direct OTP request accompanied by verification bypass warning.
  └── Finding 3: Attack sequence escalated over 3 consecutive turns.
        │
        ▼
[ Risk Assessment Layer ]
  ├── Overall Risk: 88/100 (CRITICAL)
  ├── Primary Drivers: Credential Theft (94/100), Impersonation (85/100)
  └── Policy Rule Fired: POL-CRED-001 (Require Out-of-Band Step-Up)
```

---

## 2. Analyst Explainability & Diagnostic Summary
Every risk event produces a human-readable summary answering the 8 mandatory explainability questions:
1. **Why did risk increase?**: High-confidence credential solicitation detected under active social engineering pressure.
2. **Which signals contributed?**: Speaker mismatch, authority claim, OTP request intent, urgency tactic, verification bypass tactic.
3. **What evidence supports each signal?**: Exact timestamps, redacted quotes, and acoustic metrics.
4. **How confident is each signal?**: All contributing signals exceed $0.85$ calibrated confidence.
5. **What contradictory evidence exists?**: Spectral deepfake score was low ($0.12$), indicating human speech rather than synthetic voice.
6. **What action is recommended?**: Dispatch out-of-band push challenge to registered enterprise hardware token.
7. **Which policy caused the recommendation?**: Policy `POL-CRED-001`.
8. **Can a SOC analyst override it?**: Yes, authorized Security Analysts and Supervisors can override with audit reason.
