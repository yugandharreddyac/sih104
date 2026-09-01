# VOXSHIELD Phase 5 Evaluation Metrics & Latency Budgets

## 1. Latency Budgets & Target Performance

| Pipeline Stage | Target Latency Budget | Maximum Permissible Latency |
| :--- | :---: | :---: |
| **Canonical Signal Bus Ingestion** | $< 2\text{ ms}$ | $5\text{ ms}$ |
| **Multi-Modal Risk Fusion & Corroboration** | $< 8\text{ ms}$ | $15\text{ ms}$ |
| **Deterministic Policy Evaluation** | $< 3\text{ ms}$ | $6\text{ ms}$ |
| **Evidence Graph Generation** | $< 2\text{ ms}$ | $4\text{ ms}$ |
| **WebSocket Telemetry Broadcast** | $< 5\text{ ms}$ | $10\text{ ms}$ |
| **Total Phase 5 Decision Latency** | **$< 20\text{ ms}$** | **$< 40\text{ ms}$** |

---

## 2. Accuracy, Precision & Threat Evaluation Metrics

| Metric | Target | Description |
| :--- | :---: | :--- |
| **Threat Detection Precision** | $> 96.0\%$ | Minimizes false positive alerts for legitimate customer service calls. |
| **Adversarial Recall** | $> 98.5\%$ | Catches multi-turn coordinated social engineering and impersonation attempts. |
| **Educational False Positive Rate** | **$< 0.1\%$** | Correctly ignores defensive mentions (*"We never ask for your password"*). |
| **Step-Up Resolution Integrity** | **$100\%$** | Zero step-up verifications allowed through compromised in-call channels. |
