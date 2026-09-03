# VOXSHIELD Phase 4 — Social Engineering Taxonomy & Behavioral Detection Framework

## 1. Structured Taxonomy

### Category 1: Authority Manipulation
* `BANK_OFFICIAL_CLAIM`: Impersonating bank fraud department, branch manager, or account security officer.
* `POLICE_AUTHORITY_CLAIM`: Impersonating police, cyber crime cell, CBI, FBI, or judicial officers.
* `GOVERNMENT_AUTHORITY_CLAIM`: Claiming representation from tax authorities (IRS, Income Tax), customs, or telecom regulators (TRAI/DoT).
* `COMPANY_EXECUTIVE_CLAIM`: Impersonating CEO, CFO, Managing Director, or corporate executive.
* `TECH_SUPPORT_CLAIM`: Impersonating IT helpdesk, Microsoft/Google support, or system administrator.

### Category 2: Urgency Manipulation
* `IMMEDIATE_ACTION`: Demanding instant action within minutes.
* `THREAT_OF_ACCOUNT_CLOSURE`: Threatening that bank account, SIM card, or service will be blocked/suspended.
* `THREAT_OF_LEGAL_ACTION`: Threatening arrest, court warrants, or heavy legal penalties.
* `TIME_PRESSURE`: Asserting that time is running out.
* `EMERGENCY_CLAIM`: Fabricating medical, family, or urgent security emergencies.

### Category 3: Credential & Secret Extraction
* `PASSWORD_REQUEST`: Asking for login password or passphrase.
* `OTP_REQUEST`: Soliciting One-Time Passwords or SMS authentication codes.
* `PIN_REQUEST`: Asking for ATM or UPI MPIN.
* `CVV_REQUEST`: Soliciting 3-digit card security codes.
* `SECURITY_ANSWER_REQUEST`: Asking for mother's maiden name, pet name, or security questions.
* `LOGIN_REQUEST`: Requesting user credentials under the guise of validation.

### Category 4: Financial Manipulation
* `PAYMENT_REQUEST`: Demanding direct money payment.
* `TRANSFER_REQUEST`: Instructing fund transfer to "safe" or "verification" accounts.
* `UPI_REQUEST`: Instructing scan of UPI QR codes or sending money via UPI collect requests.
* `BANK_TRANSFER_REQUEST`: Instructing NEFT/RTGS wire transfers.
* `GIFT_CARD_REQUEST`: Demanding payment via gift cards or prepaid vouchers.
* `REFUND_SCAM_PATTERN`: Offering fake refunds requiring payment of processing fees.

### Category 5: Access Manipulation
* `REMOTE_ACCESS_REQUEST`: Instructing installation of AnyDesk, TeamViewer, QuickSupport, or RustDesk.
* `SCREEN_SHARING_REQUEST`: Asking victim to share mobile or desktop screen.
* `APP_INSTALL_REQUEST`: Instructing installation of malicious `.apk` or support tools.
* `DEVICE_CONTROL_REQUEST`: Demanding permission grants for device accessibility services.

### Category 6: Verification Bypass
* `SKIP_VERIFICATION`: Instructing victim to ignore official 2FA / manager approvals.
* `DISABLE_SECURITY`: Asking victim to disable antivirus or security controls.
* `BYPASS_AUTHENTICATION`: Claiming the caller will "manually verify" the victim without standard protocols.
* `SHARE_CODE`: Instructing victim to forward authentication tokens.
* `SHARE_TOKEN`: Requesting session tokens or reset links.

### Category 7: Information Harvesting
* `PERSONAL_INFORMATION_REQUEST`: Asking for full name, date of birth, mother's name.
* `BANK_INFORMATION_REQUEST`: Soliciting account numbers, branch IFSC codes, debit card numbers.
* `IDENTITY_DOCUMENT_REQUEST`: Soliciting Aadhaar, PAN, SSN, or Passport details.
* `ADDRESS_REQUEST`: Asking for residential or billing addresses.

---

## 2. Multi-Turn Attack Progression State Machine

```
   [BENIGN_CONVERSATION]
            │
            ▼
 [AUTHORITY_ESTABLISHED] ──► [TRUST_BUILDING]
            │
            ▼
  [FEAR_URGENCY_INDUCED]
            │
            ▼
[AUTHENTICATION_BYPASS_ATTEMPTED]
            │
            ▼
[SECRET_HARVESTING_ATTEMPTED]
            │
            ▼
[CRITICAL_ACTION_EXPLOITATION] (High-Risk Attack)
```

---

## 3. Multilingual & Indian Regional Patterns
* **Hindi**: `OTP bhejiye`, `Account block ho jayega`, `Mai police station se bol raha hu`, `Jaldi kijiye`.
* **Telugu**: `OTP cheppandi`, `Account block avutundi`, `Bank nundi call chestunnam`, `Ventane transfer cheyandi`.
* **Tamil**: `OTP sollu`, `Account freeze aagidum`, `Police station la irunthu pesurom`, `Seekkiram seiyunga`.
* **Bengali**: `OTP bolun`, `Account bondho hoye jabe`, `Police theke bolchi`, `Ekhoni korun`.
* **Marathi**: `OTP sanga`, `Account band hoil`, `Police station madhun boltoy`, `Lavkhar kara`.
