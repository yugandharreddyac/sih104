# VOXSHIELD — Live SIH Demo Readiness & Runbook

**Audit Date:** 2026-09-07  
**Status:** **DEMO READY (100% OPERATIONAL)**  

---

## 1. Live Demonstration Workflow (SIH Presentation Flow)

```
+-------------------------------------------------------------------------------+
| STAGE 1: SYSTEM OVERVIEW & ARCHITECTURE (1 Minute)                            |
| - Present VOXSHIELD problem statement (SIH104): Real-time voice impersonation |
|   and multi-lingual financial social engineering defense.                     |
| - Show active system health probe (All microservices green).                  |
+-------------------------------------------------------------------------------+
                                     │
                                     ▼
+-------------------------------------------------------------------------------+
| STAGE 2: LIVE CALL SIMULATION — BENIGN CALL (1.5 Minutes)                      |
| - Stream a legitimate customer call via WebSocket / audio player.             |
| - Show real-time streaming ASR transcript with live privacy redaction.        |
| - Observe low risk composite score (0.12 - SAFE). Policy action: ALLOW.       |
+-------------------------------------------------------------------------------+
                                     │
                                     ▼
+-------------------------------------------------------------------------------+
| STAGE 3: LIVE ATTACK SCENARIO — DEEPFAKE VOICE CLONE & URGENT OTP (2 Minutes) |
| - Stream a cloned voice audio requesting an immediate wire transfer & OTP.    |
| - AI acoustic model triggers high spoof score (0.88 - RED).                   |
| - ECAPA-TDNN speaker biometrics triggers mismatch alert.                     |
| - Conversational AI highlights high urgency and OTP extortion.                |
| - 10-D Multi-Modal Risk Radar escalates to 0.91 (CRITICAL).                   |
| - Policy Engine triggers REQUIRE_STEP_UP_VERIFICATION & dispatches webhook.   |
| - Incident auto-created in Incident Management console.                       |
+-------------------------------------------------------------------------------+
                                     │
                                     ▼
+-------------------------------------------------------------------------------+
| STAGE 4: SOC ANALYST INTERVENTION & AUDIT LOGS (1.5 Minutes)                  |
| - Open `/incidents` view to show incident details and evidence timeline.      |
| - Execute manual SOC intervention (Approve / Step-Up / Kill Switch).          |
| - Navigate to `/audit` to show tamper-proof compliance trail with zero PII.   |
| - Present Confusion Matrix & Benchmark Comparison against baseline.          |
+-------------------------------------------------------------------------------+
```

---

## 2. Pre-Demo Checklist

- [x] Python AI microservice starts without warnings on port 8000
- [x] Node.js Backend server starts on port 5000/3001
- [x] Next.js 14 Frontend portal renders cleanly on port 3000
- [x] WebSocket feeds connect and stream audio packets smoothly
- [x] Live waveform visualizer and 10D radar update in real time
- [x] PII redaction masks sensitive credentials before rendering
- [x] Demo data and synthetic test samples are available locally

---

## 3. Demo Readiness Verdict
- **Status:** **READY FOR LIVE JUDGE DEMONSTRATION**
- **Estimated Demonstration Time:** 5 to 6 minutes
