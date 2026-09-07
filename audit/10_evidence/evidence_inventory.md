# VOXSHIELD — Evidence Inventory & Claim Mapping

**Audit Date:** 2026-09-07  
**Scope:** Mapping every technical claim to empirical test evidence and file artifacts  

---

## 1. Claim-to-Evidence Traceability Matrix

| Major Project Claim | Verification Test / Method | Measured Empirical Result | Verifying Artifact / File Path |
| :--- | :--- | :--- | :--- |
| **1. "VOXSHIELD detects synthetic acoustic deepfakes"** | Held-Out Test Evaluation on ASVspoof Benchmark ($N=300$) | **Accuracy: 79.33%, Precision: 83.33%, Recall: 73.33%, F1: 78.01%, ROC-AUC: 0.8876** | [`audit/13_metrics/model_metrics.json`](file:///c:/Users/supre/OneDrive/Desktop/sih104/audit/13_metrics/model_metrics.json) & [`confusion_matrix.png`](file:///c:/Users/supre/OneDrive/Desktop/sih104/audit/13_metrics/confusion_matrix.png) |
| **2. "VOXSHIELD significantly outperforms traditional ML baselines"** | Controlled comparison against 48-D DSP Random Forest | **Accuracy +15.0% (79.33% vs 64.33%), Recall +33.3% (73.33% vs 40.0%), F1 +25.15%** | [`audit/13_metrics/traditional_vs_voxshield.md`](file:///c:/Users/supre/OneDrive/Desktop/sih104/audit/13_metrics/traditional_vs_voxshield.md) |
| **3. "Inference is real-time and CPU-capable"** | Timed ONNX runtime & PyTorch benchmark | **Median latency 6.57 ms (MiniAcousticCNN) and 57.7 ms (Wav2Vec2 ONNX 256ms chunk)** | [`audit/08_performance/performance_report.md`](file:///c:/Users/supre/OneDrive/Desktop/sih104/audit/08_performance/performance_report.md) |
| **4. "System handles concurrent telephony streams at scale"** | 100-stream concurrent WebSocket stress test | **100% throughput sustained across 100 streams, memory delta bounded (+47.87 MB)** | [`backend/tests/phase4b_load.test.ts`](file:///c:/Users/supre/OneDrive/Desktop/sih104/backend/tests/phase4b_load.test.ts) |
| **5. "Financial PII and OTPs are redacted in transit"** | Privacy firewall test suite | **100% of numeric OTPs, CVVs, PAN, and card numbers masked to `[REDACTED_*]`** | [`backend/tests/privacy_firewall.test.ts`](file:///c:/Users/supre/OneDrive/Desktop/sih104/backend/tests/privacy_firewall.test.ts) |
| **6. "System is resilient against adversarial attacks"** | 12 Red-Team security tests | **12 / 12 attacks blocked (Zero privilege escalations, zero cross-tenant leaks)** | [`audit/06_security/red_team_results.md`](file:///c:/Users/supre/OneDrive/Desktop/sih104/audit/06_security/red_team_results.md) |
| **7. "All software interfaces and contracts pass automated tests"** | Pytest (128 tests) + Jest (336 tests) | **464 / 464 tests passing (100% pass rate, 0 failures, 0 regressions)** | [`audit/09_testing/test_report.md`](file:///c:/Users/supre/OneDrive/Desktop/sih104/audit/09_testing/test_report.md) |
| **8. "Frontend SOC dashboard is production ready"** | Next.js 14 Production Static Build | **10/10 routes successfully prerendered, 0 TypeScript/lint errors** | [`audit/03_frontend/frontend_audit.md`](file:///c:/Users/supre/OneDrive/Desktop/sih104/audit/03_frontend/frontend_audit.md) |

---

## 2. Evidence Integrity Declaration
All numbers and metrics in this inventory are strictly reproduced from live code executions and verified local audit artifacts.
