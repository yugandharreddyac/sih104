# VOXSHIELD Phase 5 Multi-Modal Risk Fusion Architecture

## 1. Multi-Dimensional Risk Model
VOXSHIELD rejects flat single-number threat scoring. Risk is evaluated across **10 discrete operational risk dimensions**:

1. **Overall Threat Risk** ($R_{\text{overall}} \in [0, 100]$): Composite executive threat index.
2. **Identity Impersonation Risk** ($R_{\text{id}}$): Speaker biometric mismatch + authority claim divergence.
3. **Deepfake / Synthetic Voice Risk** ($R_{\text{df}}$): Vocoder artifacts + spectral flatness anomalies + phase jitter.
4. **Replay & Injection Risk** ($R_{\text{rp}}$): Loudspeaker acoustic decay + packet waveform step splicing.
5. **Social Engineering Risk** ($R_{\text{se}}$): Authority, urgency, fear, secrecy, isolation, emotional manipulation.
6. **Credential Harvesting Risk** ($R_{\text{cred}}$): Direct solicitation of OTP, PIN, password, CVV, or 2FA codes.
7. **Financial Fraud Risk** ($R_{\text{fin}}$): Wire transfer, beneficiary change, or unauthorized payment requests.
8. **Account Takeover Risk** ($R_{\text{ato}}$): Password reset, remote access tool installation, or bypass solicitation.
9. **Verification Bypass Risk** ($R_{\text{byp}}$): Explicit instruction to ignore out-of-band protocols or avoid callbacks.
10. **Conversational Inconsistency Risk** ($R_{\text{inc}}$): Multi-turn identity contradictions and behavioral reversals.

---

## 2. Mathematical Fusion Formulation

### A. Quality-Weighted Base Contribution
For each intelligence signal $i$ with raw score $s_i \in [0, 1]$, confidence $c_i \in [0, 1]$, and audio signal health penalty $u \in [0, 1]$:

$$\tilde{c}_i = c_i \cdot (1.0 - \lambda_{\text{quality}} \cdot u)$$

$$\text{WeightedScore}_i = s_i \cdot \tilde{c}_i \cdot w_i$$

where $w_i$ is the canonical dimension weight ($\sum w_i = 1.0$).

### B. Cross-Modal Corroboration Multiplier ($\Gamma_{\text{corrob}}$)
When independent intelligence sources (Acoustic + Semantic + Behavioral) simultaneously detect threat indicators:

$$\Gamma_{\text{corrob}} = 1.0 + \sum_{j=1}^{K} \alpha_j \cdot \mathbb{I}(\text{Signal}_j \text{ is active})$$

For example, when:
- Speaker Biometrics indicate **MISMATCH** ($+0.15$)
- Caller claims **BANK OFFICIAL** ($+0.15$)
- Conversational Intent indicates **OTP REQUEST** ($+0.30$)
- Behavioral Tactics indicate **URGENCY + BYPASS** ($+0.25$)

$$\Gamma_{\text{corrob}} = 1.0 + 0.85 = 1.85$$

This scales the composite risk from moderate to **CRITICAL**, reflecting high threat coordination.

### C. Contradiction & Damping Penalty ($\Delta_{\text{contra}}$)
If high acoustic authenticity ($s_{\text{df}} < 0.10$, $c_{\text{df}} > 0.90$) coincides with benign conversational dialogue, or if poor audio quality causes high uncertainty, the composite score is damped:

$$R_{\text{dim}} = \min\left(100.0, \max\left(0.0, \frac{\sum \text{WeightedScore}_i}{\sum \tilde{c}_i} \cdot \Gamma_{\text{corrob}} \cdot 100.0 \cdot (1.0 - \Delta_{\text{contra}})\right)\right)$$

---

## 3. Temporal Risk Dynamics: Velocity, Trajectory & Decay

### A. Risk Trajectory & Velocity
- **Risk Velocity** ($V_R(t) = \frac{\Delta R}{\Delta t}$): Measures the rate of threat escalation per second. A jump of $+40$ risk points in $< 3\text{ seconds}$ triggers instant emergency SOC alerts.
- **Risk Trajectory**: Tracks state history over a rolling 60-second window across turns $t_0, t_1, \dots, t_N$.

### B. Controlled Risk Decay
- If subsequent turns return to benign conversation and acoustic authenticity is confirmed, transient urgency risk decays at a rate of:
  $$R(t + \Delta t) = R(t) \cdot e^{-\kappa \cdot \Delta t}$$
- **Critical Invariant**: Hard credential requests (`OTP_REQUEST`, `DISCLOSE_CREDENTIAL`) are **immutable milestones** that remain permanently recorded in the call's audit history even if transient acoustic scores decrease.
