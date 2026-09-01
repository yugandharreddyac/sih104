# VOXSHIELD: Security Model & RBAC Framework

## 1. Zero Trust Architecture

VOXSHIELD assumes an untrusted execution environment where networks are hostile, caller identities are malleable, and client-side interfaces cannot be trusted to enforce policy constraints.

### Core Security Tenets
1. **Server-Side Enforcement**: All security decisions, role checks, policy rules, and verification validations are executed strictly on the backend.
2. **Principle of Least Privilege**: Users, services, and API tokens are granted the minimum set of permissions necessary to execute their duties.
3. **Explicit Verification**: Every caller claiming an identity must be continuously evaluated across acoustic, contextual, and out-of-band channels.
4. **Tamper-Evident Auditing**: Every security-sensitive transaction produces an immutable audit record tied to a cryptographic correlation ID.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Role | Description | Permissions |
| :--- | :--- | :--- |
| **`ADMIN`** | System administrator with full operational privileges | Manage users, configure system parameters, update policies, view all calls & audits, manage API keys. |
| **`SECURITY_ANALYST`** | SOC analyst handling incidents, risk assessments, and policy tuning | View live calls, investigate incidents, review risk scores, trigger step-up verification, update incident statuses. |
| **`SUPERVISOR`** | Contact center team lead overseeing live operations | Monitor live calls, review operator alerts, override false positives with justification, inspect agent queues. |
| **`OPERATOR`** | Frontline agent receiving incoming calls | View live call security alerts, receive step-up verification prompts, request supervisor escalation. Cannot alter policies or view system audit logs. |
| **`VIEWER`** | Read-only auditor or executive | Read-only access to aggregated analytics, compliance reports, and sanitized post-incident summaries. |

---

## 3. Permission Definitions

```typescript
export enum Permission {
  // Call Operations
  CALLS_READ = 'calls:read',
  CALLS_STREAM = 'calls:stream',
  CALLS_INTERVENE = 'calls:intervene',
  CALLS_TERMINATE = 'calls:terminate',

  // Incidents
  INCIDENTS_READ = 'incidents:read',
  INCIDENTS_WRITE = 'incidents:write',
  INCIDENTS_RESOLVE = 'incidents:resolve',

  // Policies
  POLICIES_READ = 'policies:read',
  POLICIES_WRITE = 'policies:write',

  // Verifications
  VERIFICATION_TRIGGER = 'verification:trigger',
  VERIFICATION_OVERRIDE = 'verification:override',

  // Audits & Configs
  AUDIT_READ = 'audit:read',
  SYSTEM_CONFIG = 'system:config',
  USER_MANAGE = 'user:manage',
}
```

---

## 4. API Security & Threat Protection
- **JWT Authentication**: Short-lived Access Tokens (15 min) signed with HS256/RS256, paired with HTTP-only secure refresh tokens.
- **Input Validation**: Strict schema enforcement on all API routes using Zod to block injection attacks (SQLi, NoSQLi, Command Injection).
- **Rate Limiting**: Tiered rate limiting per IP and per API key to prevent brute-force attacks and denial-of-service attempts.
- **Header Hardening**: Implementation of Helmet.js security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options).
- **Secrets Management**: Zero hardcoded secrets; mandatory validation of all environment variables on boot.
