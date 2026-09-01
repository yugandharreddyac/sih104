# VOXSHIELD Phase 5 Deterministic Policy Engine Specification

## 1. Core Architectural Invariants
1. **Deterministic Execution**: Given identical risk inputs and transaction context, the policy engine produces identical decisions 100% of the time.
2. **Decoupled from ML Weights**: Security rules are declarative code / JSON structures, never hardcoded inside neural inference layers.
3. **Auditability & Versioning**: Every policy change is cryptographically versioned and tracked with timestamps and author IDs.

---

## 2. Policy Priority Hierarchy & Conflict Resolution

When multiple rules match a single call state, the engine applies the **Deterministic Precedence Hierarchy**:

```
1. EMERGENCY_SAFETY          (e.g., Physical threat, critical system breach)
         ↓
2. CRITICAL_CREDENTIAL_DEFENSE (e.g., OTP solicitation, password harvesting)
         ↓
3. FINANCIAL_ASSET_PROTECTION  (e.g., High-value wire transfers, beneficiary alteration)
         ↓
4. IDENTITY_ASSURANCE        (e.g., Executive / VIP biometric mismatches)
         ↓
5. COMPLIANCE_AND_PRIVACY    (e.g., PII redaction audit, regulatory logging)
         ↓
6. STANDARD_MONITORING       (e.g., Benign conversation telemetry)
```

**Conflict Resolution Invariant**: The highest-priority rule takes precedence. If two rules share identical priority levels, the **most restrictive security response** (`TERMINATE` > `BLOCK` > `STEP_UP` > `WARN` > `MONITOR`) is enforced.

---

## 3. Canonical Policy Rule Specification

```json
{
  "policy_id": "POL-CRED-001",
  "name": "Enforce Out-of-Band Step-Up on Credential Harvesting",
  "version": "1.2.0",
  "priority": "CRITICAL_CREDENTIAL_DEFENSE",
  "conditions": {
    "or": [
      { "field": "intent.primary_intent", "operator": "EQUALS", "value": "OTP_REQUEST" },
      { "field": "sensitive_data.contains_direct_request", "operator": "EQUALS", "value": true },
      { "field": "requested_action.action_type", "operator": "EQUALS", "value": "DISCLOSE_CREDENTIAL" }
    ],
    "and": [
      { "field": "risk.dimensions.credential_theft", "operator": "GREATER_THAN_OR_EQUAL", "value": 75.0 },
      { "field": "social_engineering.attack_sequence_score", "operator": "GREATER_THAN_OR_EQUAL", "value": 0.60 }
    ]
  },
  "action": "REQUIRE_STEP_UP_VERIFICATION",
  "target_channel": "OUT_OF_BAND_HARDWARE_TOKEN",
  "requires_human_approval": true,
  "explanation_template": "Policy POL-CRED-001 triggered: High-confidence credential solicitation detected under active social engineering pressure ({social_engineering.progression_state})."
}
```
