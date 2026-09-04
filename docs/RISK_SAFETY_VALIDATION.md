# SIH104 — Phase 2: Risk Engine Safety & Threat Scenario Validation

## 1. Objective

The objective of Phase 2 is to logically, mathematically, and empirically harden the SIH104 Voice Threat Intelligence Risk Engine against critical multi-modal voice threats. 

### Core Principle
> **A low deepfake score MUST NOT override strong evidence of credential theft, OTP/PIN/password solicitation, social engineering, impersonation, replay/injection, financial fraud, account takeover, or verification bypass.**

SIH104 is an end-to-end voice-channel threat intelligence platform, **not merely a deepfake detector**.

---

## 2. Risk Dimensions & Mathematical Threat Model

SIH104 implements a **10-dimensional canonical threat model**:

| Dimension ID | Description | Configured Weight | Status |
| :--- | :--- | :---: | :---: |
| `identity_impersonation` | Biometric speaker mismatch and vocal tract divergence | `0.150` | `TESTED` |
| `deepfake_synthetic` | Neural vocoder artifacts and synthetic spoof logit | `0.200` | `TESTED` |
| `replay_injection` | High-frequency roll-off, secondary room impulse decay | `0.100` | `TESTED` |
| `voice_inconsistency` | Intra-call acoustic variance and pitch/formant instability | `0.050` | `TESTED` |
| `behavioral_anomaly` | Conversational pacing and speech pattern anomalies | `0.050` | `TESTED` |
| `social_engineering` | Urgency manipulation, authority coercion, fear induction | `0.150` | `TESTED` |
| `credential_theft` | Direct solicitation of OTP, PIN, password, CVV, or tokens | `0.150` | `TESTED` |
| `financial_fraud` | High-value outbound wire, transfer, or beneficiary change | `0.100` | `TESTED` |
| `account_takeover` | Remote access tool solicitation, recovery credential reset | `0.025` | `TESTED` |
| `verification_bypass` | MFA circumvention, protocol deviation, security override | `0.025` | `TESTED` |
| **Sum** | **Total Canonical Risk Weight** | **`1.000`** | `TESTED` |

---

## 3. Policy Precedence Hierarchy

Policy evaluation enforces deterministic priority ranking where destructive or high-risk threats cannot be masked or bypassed by benign signals from other modalities:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CRITICAL_BLOCK                                           │
│    (BLOCK_DISCLOSURE, BLOCK_PROTECTED_WORKFLOW, TERMINATE)   │
├─────────────────────────────────────────────────────────────┤
│ 2. MANDATORY_STEP_UP                                        │
│    (REQUIRE_STEP_UP_VERIFICATION, RESTRICT_TRANSACTION)     │
├─────────────────────────────────────────────────────────────┤
│ 3. WARN_OPERATOR / MONITOR                                  │
│    (WARN_OPERATOR, WARN_ANALYST, MONITOR)                   │
├─────────────────────────────────────────────────────────────┤
│ 4. ALLOW                                                    │
│    (ALLOW: Granted ONLY when zero blocking/step-up triggers) │
└─────────────────────────────────────────────────────────────┘
```

- If `BLOCK_DISCLOSURE`, `BLOCK_PROTECTED_WORKFLOW`, or `TERMINATE_CALL` is triggered, `allowed` resolves strictly to `false`.
- Dangerous threats (e.g. credential harvesting) with clean acoustic profiles never resolve to `ALLOW`.

---

## 4. Threat Scenarios & Validation Results

All 12 core threat scenarios and safety regressions were exercised against the live backend decision engine:

| Scenario | Threat Inputs | Expected Decision | Actual Test Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **A: Normal Human** | Bona fide voice, no replay, verified speaker, benign balance inquiry | `SAFE` / Score <= 20 / `ALLOW` | `SAFE` (8.5), conf=0.95, `ALLOW` | `TESTED` |
| **B: Deepfake Voice** | High acoustic spoof logit (0.96), vocoder spectral phase distortion | `CRITICAL` / `BLOCK_PROTECTED_WORKFLOW` | `CRITICAL` (92.0), spoof=96.0, Block | `TESTED` |
| **C: Human Voice + OTP Theft** | Natural human voice (spoof 4%), active OTP/PIN harvesting (98%) | `HIGH/CRITICAL` / `BLOCK_DISCLOSURE` | `HIGH` (86.0), cred=98.0, df=4.0, Block | `TESTED` |
| **D: Social Engineering** | High urgency, IT director impersonation, coercion pressure | `HIGH` / `REQUIRE_STEP_UP_VERIFICATION` | `HIGH` (76.0), se=94.0, Step-Up | `TESTED` |
| **E: Replay Attack** | Room impulse reverb decay, high-frequency roll-off (> 120ms) | `HIGH` / `REQUIRE_STEP_UP_VERIFICATION` | `HIGH` (78.0), replay=92.0, Step-Up | `TESTED` |
| **F: Speaker Impersonation** | Claimed identity fails ECAPA biometric similarity (< 0.35) | `HIGH` / `REQUIRE_STEP_UP_VERIFICATION` | `HIGH` (82.0), identity=94.0, Step-Up | `TESTED` |
| **G: Financial Fraud** | $250,000 urgent wire request to unverified overseas account | `CRITICAL` / `BLOCK_PROTECTED_WORKFLOW` | `CRITICAL` (88.0), fraud=95.0, Block | `TESTED` |
| **H: Account Takeover** | Remote password reset + MFA bypass request | `HIGH` / `REQUIRE_STEP_UP_VERIFICATION` | `HIGH` (83.0), ato=92.0, bypass=88.0 | `TESTED` |
| **I: Compound Threats** | Deepfake + Impersonation + Replay + Social Eng + OTP Theft | `CRITICAL` / Corroboration Escalation | `CRITICAL` (98.0), Multi-trigger | `TESTED` |
| **J: AI Unavailable** | Connection refused / Abort timeout / HTTP 500 error | `NOT_AVAILABLE` / `INCONCLUSIVE` / `null` | status=`NOT_AVAILABLE`, score=`null` | `TESTED` |
| **K: Low-SNR Audio** | Heavy background noise (SNR < 6 dB), acoustic uncertainty penalty | `GUARDED` / Elevated Uncertainty (> 0.60) | conf=0.35, uncertainty=0.65, non-safe | `TESTED` |
| **L: Contradictory Signals** | High acoustic spoof (0.88) vs strong biometric match (0.92) | `ELEVATED` / Contradictions Preserved | uncertainty=0.38, graph nodes tracked | `TESTED` |

---

## 5. Specialized Safety Mechanisms

### 5.1 AI Unavailable Fail-Safe Behavior
When the AI Risk Fusion service is unreachable, timed out, or returns HTTP 5xx errors:
- The system returns `status: "NOT_AVAILABLE"` and `risk_level: "INCONCLUSIVE"`.
- `overall_risk_score` is explicitly `null` (never converted to 0.0, never assumed benign).
- `uncertainty` is set to `1.0` and `confidence` is set to `0.0`.
- All sub-dimensions are `null`.
- Audit event `RISK_FUSION_UNAVAILABLE` is recorded.

### 5.2 Low-SNR Audio Handling
- Audio with poor SNR or high clipping incurs an acoustic quality uncertainty penalty.
- Confidence is dampened (`<= 0.40`) and uncertainty is elevated (`>= 0.60`).
- The system never converts missing or noisy acoustic evidence into safe/ALLOW evidence.

### 5.3 Contradictory Evidence Preservation
- When acoustic and biometric signals conflict, both findings are recorded in `contradicting_signals` and the `evidence_graph`.
- One signal does not silently cancel out another signal.
- The advisory policy escalates to out-of-band step-up verification (`REQUIRE_STEP_UP_VERIFICATION`).

### 5.4 Privacy & Secret Redaction
- Transcripts and metadata are filtered through the deterministic `PrivacyFirewall` prior to forwarding or persistence.
- Numeric OTPs are sanitized to `[AUTHENTICATION_CODE_REDACTED]`.
- CVVs are sanitized to `[CVV_REDACTED]`.
- Passwords and PINs are sanitized to `[PASSWORD_REDACTED]` / `[PIN_REDACTED]`.
- Zero cleartext secrets are leaked into risk drivers, evidence graphs, or audit logs.

### 5.5 Boundary & Data Robustness
- Payloads with `NaN`, `Infinity`, negative scores, out-of-bounds values (`> 100`), or invalid enum strings are rejected by `isValidRiskResponse` and safely degraded to `NOT_AVAILABLE` without application crashes.

---

## 6. Verification and Test Results

### 6.1 Backend Test Execution
- **Command**: `npm test --prefix backend`
- **Result**:
  - Test Suites: **16 passed**, 16 total
  - Tests: **131 passed**, 131 total
  - Snapshots: 0 total
  - Time: ~78.9s

### 6.2 Python Risk Fusion Tests
- **Command**: `python -m pytest ai/tests/test_risk_fusion.py`
- **Result**:
  - Tests: **3 passed**, 3 total
  - Time: 2.17s

### 6.3 Frontend Production Build
- **Command**: `npm run build --prefix frontend`
- **Result**:
  - Next.js 14.2.4: **Compiled successfully**
  - Type checking and linting: **0 errors**
  - Static page generation: **12/12 static pages generated**

---

## 7. Files Changed in Phase 2

1. `backend/tests/risk_safety_scenarios.test.ts` (`TESTED`)
   - Comprehensive test suite covering Scenarios A through L, Policy Precedence, Explainability & Privacy Redaction, and Mathematical Robustness edge cases.
2. `backend/src/policies/policy.types.ts` (`IMPLEMENTED`)
   - Added `MONITOR` and `RESTRICT_TRANSACTION` actions to `PolicyAction` union.
3. `backend/src/policies/policies.service.ts` (`IMPLEMENTED`)
   - Expanded default policies with rules covering PIN/password exfiltration, speaker mismatch step-up, replay containment, social engineering defense, and account takeover containment.
4. `backend/src/risk/risk.service.ts` (`IMPLEMENTED`)
   - Enhanced `isValidRiskResponse` structural validator to verify finite bounds on all dimension entries.
5. `docs/RISK_SAFETY_VALIDATION.md` (`DOCUMENTED`)
   - Created comprehensive validation documentation and evidence record.

---

## 8. Limitations & Scope Notice

- **Software Safety vs Model Accuracy**: This validation proves the mathematical logic, fail-safe degradation, policy precedence, and threat boundary contracts of the risk engine. It does **not** claim 100% real-world acoustic model generalization, which requires dataset-wide empirical evaluation on live telephony audio.
- **Out-of-Band IdP Integration**: Step-up verification dispatch contracts are tested; live telephony carrier integration requires external SIP/SMPP infrastructure.

---

## 9. Status Summary

- **Phase 2 Implementation**: `IMPLEMENTED`
- **Phase 2 Regression Testing**: `TESTED`
- **Fail-Safe Degradation**: `TESTED`
- **Privacy Redaction**: `TESTED`
- **Live Production Telephony**: `NOT VERIFIED` (Requires live telecom carrier deployment)
