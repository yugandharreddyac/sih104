# SIH104 — SECURITY INVARIANTS & PRIVACY SPECIFICATION

## 1. The Seven Security Invariants

1. **Invariant 1 — Genuine Human Voice $\neq$ Safe**: A natural genuine human voice requesting sensitive credentials (e.g. OTP, PIN, password) or urging an emergency wire transfer MUST produce elevated threat scores (`credential_theft`, `social_engineering`) and enforce `BLOCK_DISCLOSURE` / `REQUIRE_STEP_UP_VERIFICATION`.
2. **Invariant 2 — Low Deepfake Score Cannot Override Credential Theft**: Deepfake spoof score and credential theft intent operate as independent threat dimensions. Low deepfake score ($0.10$) never overrides policy rule triggers (`POL-CRED-001`).
3. **Invariant 3 — AI Unavailable $\neq$ Safe**: Missing AI services or model failures result in `NOT_AVAILABLE` status, `confidence = 0.0`, `uncertainty = 1.0`, and `INCONCLUSIVE` threat classification.
4. **Invariant 4 — Client-Provided Transcripts are Untrusted**: Any transcript or text supplied by the client payload is explicitly tagged as `[UNTRUSTED_CLIENT_HINT]` with `confidence = 0.0` and can never independently manufacture or bypass a security decision.
5. **Invariant 5 — Zero Raw Audio Persistence**: Raw PCM bytes, Base64 chunks, and uncompressed audio buffers are ephemeral and are NEVER written to PostgreSQL, disk, or audit log files.
6. **Invariant 6 — Strict Multi-Tenant Isolation**: Every entity (calls, incidents, interventions, policies, audit logs) enforces tenant scoping via `organizationId`. Cross-organization requests return HTTP `403 FORBIDDEN`.
7. **Invariant 7 — Privileged Action Auditability**: All administrative actions, policy modifications, and intervention overrides require authenticated credentials and are permanently recorded in the immutable audit trail with mandatory justification notes.

---

## 2. PrivacyFirewall Redaction Rules

`PrivacyFirewall` executes recursive pre-persistence sanitization across string and JSON metadata payloads:

| Data Type | Detection Pattern | Redaction Output |
| :--- | :--- | :--- |
| **Numeric OTPs** | 4-to-8 digit standalone numbers in auth context | `[AUTHENTICATION_CODE_REDACTED]` |
| **Credit Card Numbers** | 13-to-19 digit Luhn-conforming sequences | `[CARD_NUMBER_REDACTED]` |
| **CVV Security Codes** | 3-to-4 digit CVV/CVC tokens | `[CVV_REDACTED]` |
| **Passwords & PINs** | Secret tokens following credential keywords | `[PASSWORD_REDACTED]` |
| **MFA / 2FA Tokens** | Alphanumeric authenticator tokens | `[MFA_TOKEN_REDACTED]` |
