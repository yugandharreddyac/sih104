# VOXSHIELD Phase 3 Evaluation Framework & Benchmarking Plan

## 1. Metrics Definition

### Deepfake Detection Evaluation
- **Equal Error Rate (EER)**: Operating point where False Positive Rate equals False Negative Rate.
- **Area Under ROC Curve (ROC-AUC)**: Overall discriminative power across all decision thresholds.
- **Processing Latency**: Measured execution wall-clock time per 250ms audio chunk (Target: $< 15$ ms).

### Speaker Verification Evaluation
- **False Acceptance Rate (FAR)**: Percentage of imposter voice attempts incorrectly verified as genuine.
- **False Rejection Rate (FRR)**: Percentage of genuine speaker utterances incorrectly rejected.
- **Equal Error Rate (EER)**: Point where $\text{FAR} = \text{FRR}$ (Target: $< 4.5\%$).

### Replay Attack Detection Evaluation
- **Attack Detection Rate**: Percentage of physical acoustic loudspeaker replays correctly flagged.
- **Clean Voice False Alarm Rate**: Target $< 2.0\%$.

---

## 2. Benchmark Summary (Phase 3 Baseline)

| Evaluation Task | Primary Metric | Baseline Performance | Average Measured Latency |
| :--- | :--- | :--- | :--- |
| **Deepfake Detection** | EER | $3.8\%$ | $2.1\text{ ms}$ |
| **Speaker Verification** | EER | $4.2\%$ | $1.5\text{ ms}$ |
| **Replay Detection** | Detection Rate | $94.6\%$ | $1.1\text{ ms}$ |
| **Total AI Pipeline** | End-to-End Latency | — | $4.8\text{ ms}$ |
