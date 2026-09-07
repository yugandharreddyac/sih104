# VOXSHIELD — API Verification Matrix

**Audit Date:** 2026-09-07  
**Test Suite:** Backend Jest Integration & Supertest Harness  

---

## 1. Comprehensive Endpoint Test Matrix

| # | HTTP Method | Endpoint Path | Test Type | Input Condition | Expected Status | Actual Status | Validation Result |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `GET` | `/health` | Positive | Standard ping | 200 OK | 200 OK | **PASS** |
| 2 | `GET` | `/metrics` | Positive | Prometheus scrape | 200 OK | 200 OK | **PASS** |
| 3 | `POST` | `/api/auth/login` | Positive | Valid admin user & password | 200 OK | 200 OK | **PASS** |
| 4 | `POST` | `/api/auth/login` | Negative | Invalid password | 401 Unauthorized | 401 Unauthorized | **PASS** |
| 5 | `POST` | `/api/auth/login` | Boundary | Empty JSON payload `{}` | 400 Bad Request | 400 Bad Request | **PASS** |
| 6 | `GET` | `/api/calls` | Positive | Valid JWT token | 200 OK | 200 OK | **PASS** |
| 7 | `GET` | `/api/calls` | Security | Missing JWT token | 401 Unauthorized | 401 Unauthorized | **PASS** |
| 8 | `GET` | `/api/calls/non-existent-id` | Negative | Random UUID | 404 Not Found | 404 Not Found | **PASS** |
| 9 | `POST` | `/api/calls` | Positive | Valid initialization JSON | 201 Created | 201 Created | **PASS** |
| 10 | `POST` | `/api/calls` | Boundary | Missing caller number | 400 Bad Request | 400 Bad Request | **PASS** |
| 11 | `POST` | `/api/calls/:id/terminate` | Security | Non-admin/Viewer role | 403 Forbidden | 403 Forbidden | **PASS** |
| 12 | `POST` | `/api/calls/:id/terminate` | Positive | Authorized Analyst/Admin | 200 OK | 200 OK | **PASS** |
| 13 | `POST` | `/api/risk/transaction-context` | Security | Missing auth token | 401 Unauthorized | 401 Unauthorized | **PASS** |
| 14 | `POST` | `/api/risk/transaction-context` | Negative | Negative transfer amount | 400 Bad Request | 400 Bad Request | **PASS** |
| 15 | `POST` | `/api/risk/transaction-context` | Positive | Valid wire transfer context | 200 OK | 200 OK | **PASS** |
| 16 | `GET` | `/api/incidents` | Positive | Filter by status=OPEN | 200 OK | 200 OK | **PASS** |
| 17 | `POST` | `/api/incidents/:id/interventions` | Positive | Submit SOC override | 200 OK | 200 OK | **PASS** |
| 18 | `GET` | `/api/policies` | Positive | Retrieve active rules | 200 OK | 200 OK | **PASS** |
| 19 | `GET` | `/api/audit/logs` | Security | Viewer role access attempt | 403 Forbidden | 403 Forbidden | **PASS** |
| 20 | `GET` | `/api/audit/logs` | Positive | Admin role query | 200 OK | 200 OK | **PASS** |

---

## 2. API Test Conclusion
- **Total Tested Endpoints:** 20 Scenarios
- **Passed Scenarios:** 20 (100%)
- **Failed Scenarios:** 0
