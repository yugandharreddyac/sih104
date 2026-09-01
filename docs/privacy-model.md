# VOXSHIELD: Privacy Model & Data Protection Architecture

## 1. Core Privacy Tenets

VOXSHIELD is built upon strict **Privacy-by-Design** principles compliant with global standards including GDPR, CCPA, HIPAA, and PCI-DSS:

1. **Zero Secret Retention**: The system shall never store raw, reversible authentication secrets, including OTPs, SMS codes, MFA tokens, passwords, PINs, card numbers, or CVVs.
2. **Pre-Persistence Redaction**: Redaction is executed in memory *before* data reaches database logs, caches, or persistent storage.
3. **Data Minimization**: Voice biometric vectors and audio samples are stored only when strictly authorized, using irreversible acoustic embeddings rather than raw biometric audio where feasible.
4. **Purpose Limitation**: Audio analysis is strictly confined to security risk evaluation; no acoustic or linguistic data is harvested for unrelated behavioral profiling.

---

## 2. Redaction Categories & Standardization

| Category | Description | Replacement Token |
| :--- | :--- | :--- |
| `OTP` | 4-8 digit numeric or alphanumeric one-time codes | `[OTP_CODE_REDACTED]` |
| `MFA` | Multi-factor verification digits / phrases | `[MFA_TOKEN_REDACTED]` |
| `PASSWORD` | Alphanumeric phrases uttered as passwords | `[PASSWORD_REDACTED]` |
| `PIN` | 4-6 digit personal identification numbers | `[PIN_REDACTED]` |
| `CVV` | 3-4 digit card security codes | `[CVV_REDACTED]` |
| `CARD_NUMBER` | 13-19 digit payment card numbers (PAN) | `[CARD_NUMBER_REDACTED]` |
| `ACCOUNT_CREDENTIAL`| Bank account numbers, IBANs, routing secrets | `[ACCOUNT_CREDENTIAL_REDACTED]` |
| `API_KEY` | Hex / Base64 programmatic API keys | `[API_KEY_REDACTED]` |
| `ACCESS_TOKEN` | Bearer tokens, OAuth codes, JWTs | `[ACCESS_TOKEN_REDACTED]` |
| `PERSONAL_INFORMATION`| Social Security Numbers (SSN), national IDs | `[PII_IDENTIFIER_REDACTED]` |
| `CONFIDENTIAL_INFO`| Trade secrets, NDA-protected financial figures | `[CONFIDENTIAL_INFO_REDACTED]` |

---

## 3. Privacy Firewall Architecture

```
                       +-------------------------------+
                       | Inbound Audio Stream & Chunk  |
                       +---------------+---------------+
                                       |
                                       v
                       +-------------------------------+
                       |    Real-Time ASR Engine       |
                       +---------------+---------------+
                                       | (Raw Transcript Stream)
                                       v
+-----------------------------------------------------------------------------+
|                            PRIVACY FIREWALL                                 |
|                                                                             |
|  +--------------------------------+   +----------------------------------+  |
|  | Regex & Pattern Redactor Engine|   | Named Entity Recognition (NER)   |  |
|  +--------------------------------+   +----------------------------------+  |
|                                                                             |
|  +-----------------------------------------------------------------------+  |
|  |                        Irreversible Masking Layer                     |  |
|  +-----------------------------------------------------------------------+  |
+--------------------------------------+--------------------------------------+
                                       | (Sanitized / Masked Stream)
                                       +------------------------+
                                       |                        |
                                       v                        v
                        +----------------------+ +---------------------------+
                        |  PostgreSQL Database | | SOC Dashboard & Analytics |
                        | (Zero Secret Storage)| |     (Clean Display)       |
                        +----------------------+ +---------------------------+
```

---

## 4. Encryption & Key Management
- **In-Transit**: Mutual TLS 1.3 for all internal microservice communication (Backend <-> AI Engine) and TLS 1.3 for client connections.
- **At-Rest**: AES-256-GCM encryption for stored evidence, audio chunks, and metadata archives.
- **Biometric Templates**: Speaker embeddings are normalized, salted, and stored as irreversible vector representations without raw audio linkage.
