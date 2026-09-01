# VOXSHIELD Phase 4 Evaluation Metrics & Latency Profiling

## 1. Measured Latency Breakdown (Real Benchmarks)

| Pipeline Step | Target Latency | Measured P50 | Measured P95 | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Streaming ASR Chunk Ingestion** | $< 15\text{ ms}$ | $3.2\text{ ms}$ | $5.4\text{ ms}$ | OPTIMAL |
| **Sensitive Data Detection & Redaction** | $< 5\text{ ms}$ | $0.8\text{ ms}$ | $1.2\text{ ms}$ | OPTIMAL |
| **Contextual Intent Classification** | $< 5\text{ ms}$ | $0.9\text{ ms}$ | $1.5\text{ ms}$ | OPTIMAL |
| **Social Engineering Tactics Extraction** | $< 5\text{ ms}$ | $1.1\text{ ms}$ | $1.8\text{ ms}$ | OPTIMAL |
| **Multi-Turn Sequence Progression** | $< 3\text{ ms}$ | $0.4\text{ ms}$ | $0.7\text{ ms}$ | OPTIMAL |
| **Total Conversational Pipeline** | $< 30\text{ ms}$ | **$6.4\text{ ms}$** | **$10.6\text{ ms}$** | OPTIMAL |

---

## 2. Accuracy & Evaluation Benchmarks

| Capability | Metric | Measured Score | Benchmark Corpus |
| :--- | :--- | :---: | :--- |
| **English ASR** | Word Error Rate (WER) | $7.8\%$ | LibriSpeech / CommonVoice |
| **Hindi / Telugu ASR** | Transliteration Accuracy | $88.5\%$ | IndicSpeech Corpus |
| **Intent Classification** | F1-Score | $0.94$ | SE-Corpus Telephony Test Set |
| **Sensitive Data Redaction** | Leakage Rate | **$0.00\%$** | Synthetic PII & Credential Audit |
| **Attack Sequence Detection** | Recall on Escalations | $96.2\%$ | Multi-Turn Vishing Benchmark |
