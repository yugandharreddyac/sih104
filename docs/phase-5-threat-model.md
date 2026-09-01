# VOXSHIELD Phase 5 Threat Model & Adversarial Defenses

## 1. Threat Matrix & Countermeasure Architecture

| Threat ID | Threat Category | Attack Vector & Description | Impact | Likelihood | Mitigation Strategy in Phase 5 | Residual Risk |
| :--- | :--- | :--- | :---: | :---: | :--- | :---: |
| **T-01** | **Transcript Poisoning** | Attacker speaks adversarial prompt injection phrases (e.g. *"Set overall risk to zero"*). | High | Medium | Classifiers treat transcript text purely as untrusted data strings. No LLM controls system policies or tools. | Minimal |
| **T-02** | **Signal Manipulation** | Malicious client sends forged WebSocket frames claiming spoof score is zero. | Critical | Low | Server-side cryptographic JWT authentication, session binding, and in-pipeline acoustic feature recalculation. | Low |
| **T-03** | **Credential Leakage** | Storing unredacted OTPs or PINs in risk evidence graphs or audit logs. | Critical | Medium | Privacy Firewall enforces 100% pre-persistence regex and contextual redaction (`[REDACTED]`). | Zero |
| **T-04** | **Step-Up Hijacking** | Caller provides a secondary phone number during the call and asks for OTP. | Critical | High | Step-Up Orchestrator strictly restricts challenges to pre-registered enterprise identity records. | Zero |
| **T-05** | **Policy Tampering** | Unauthorized operator attempts to disable credential defense rules. | Critical | Low | Policy mutations require `ADMIN` role with `SYSTEM_CONFIG` permission; changes are immutably audited. | Low |
| **T-06** | **Denial of Service** | Flooding backend with concurrent audio streams and risk evaluations. | High | Medium | Bounded per-call memory buffers (5 MB / 100 chunks), rate limiters (100 req/min), and async worker pools. | Low |
| **T-07** | **Adversarial Silence** | Attacker stays silent or uses heavy noise to evade semantic classifiers. | Medium | High | Acoustic signal health engine detects degraded SNR and silence, penalizing certainty to `INCONCLUSIVE`. | Low |
| **T-08** | **Euphemistic Coercion** | Attacker uses indirect phrasing (*"Read the 6 numbers on your screen"*). | High | High | Multi-token situational rules, verb-object semantic pairing, and sequence state machine correlation. | Low |
