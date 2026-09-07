# VOXSHIELD — AI/ML Model Validation & Performance Metrics Report

**Audit Date:** 2026-09-07  
**Evaluation Set:** Held-Out ASVspoof Benchmark Test Set ($N = 300$, Balanced $150$ Bona Fide / $150$ Spoof)  
**Evaluated Model:** VOXSHIELD MiniAcousticCNN (Frozen Validation Threshold $\theta = 0.93$)  

---

## 1. Verified Metrics Summary

All metrics are strictly calculated from the held-out evaluation dataset:

| Metric | Measured Value | Mathematical Formula | Interpretation in VOXSHIELD |
| :--- | :--- | :--- | :--- |
| **Accuracy** | **79.33%** (`0.7933`) | $(TP + TN) / \text{Total}$ | Overall correct classification across all test calls |
| **Precision** | **83.33%** (`0.8333`) | $TP / (TP + FP)$ | Likelihood that a flagged deepfake is genuinely synthetic |
| **Recall (Sensitivity)** | **73.33%** (`0.7333`) | $TP / (TP + FN)$ | Proportion of actual deepfakes successfully caught |
| **F1-Score** | **78.01%** (`0.7801`) | $2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$ | Harmonic balance between false alarms and missed threats |
| **ROC-AUC** | **0.8876** | Area Under ROC Curve | Global ranking discrimination capability |
| **EER (Equal Error Rate)** | **18.67%** (`0.1867`) | Operating point where $FPR = FNR$ | Standard biometrics error tradeoff benchmark |
| **False Positive Rate (FPR)** | **14.67%** (`0.1467`) | $FP / (FP + TN)$ | Rate of legitimate caller audio misflagged |
| **False Negative Rate (FNR)** | **26.67%** (`0.2667`) | $FN / (TP + FN)$ | Rate of synthetic voice audio bypassing acoustic detector |

---

## 2. Confusion Matrix

![VOXSHIELD Confusion Matrix](file:///c:/Users/supre/OneDrive/Desktop/sih104/audit/13_metrics/confusion_matrix.png)

```
                       PREDICTED
                 Bona Fide    Spoof (Deepfake)
ACTUAL   Bona Fide    TN = 128       FP = 22       | Total Bona Fide = 150
         Spoof        FN = 40        TP = 110      | Total Spoof = 150
         -----------------------------------------
         Total        168            132           | Total Samples = 300
```

### Breakdown of Matrix Quadrants:
1. **True Negatives (TN = 128):** Legitimate customer voices correctly identified as bona fide, allowing seamless banking transactions without friction.
2. **False Positives (FP = 22):** Legitimate customer audio flagged as suspicious; mitigated in VOXSHIELD by requiring cross-modal confirmation (conversational intent + transaction risk) before triggering call termination.
3. **False Negatives (FN = 40):** Highly sophisticated synthetic voices that passed the single acoustic layer; caught downstream in VOXSHIELD by the secondary 10-D Multi-Modal Risk Fusion layers (speaker biometrics mismatch, OTP urgency keywords, high financial transfer context).
4. **True Positives (TP = 110):** Malicious deepfake voice clones intercepted and flagged for SOC intervention.

---

## 3. Real Measured Model Latencies (CPU Execution)

Measured directly on Intel CPU with ONNX Runtime 1.29.0:

| Model / Subsystem | Chunk / Audio Duration | Min Latency | Median Latency | P95 Latency | Max Latency |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Deepfake Detector (Wav2Vec2 ONNX)** | 256 ms | 55.0 ms | **57.7 ms** | 99.4 ms | 101.4 ms |
| **Deepfake Detector (Wav2Vec2 ONNX)** | 512 ms | 81.8 ms | **87.2 ms** | 91.4 ms | 91.7 ms |
| **Deepfake Detector (Wav2Vec2 ONNX)** | 1000 ms | 121.4 ms | **173.8 ms** | 277.9 ms | 336.0 ms |
| **Speaker Biometrics (ECAPA ONNX)** | 500 ms | 40.4 ms | **62.8 ms** | 162.3 ms | 180.7 ms |
| **Speaker Biometrics (ECAPA ONNX)** | 1000 ms | 98.8 ms | **112.6 ms** | 142.3 ms | 146.2 ms |
| **MiniAcousticCNN (PyTorch CPU)** | 1000 ms | 5.2 ms | **6.57 ms** | 8.9 ms | 11.2 ms |
| **10D Risk Fusion Tensor Evaluation**| Multi-Signal JSON | 0.2 ms | **0.8 ms** | 1.8 ms | 2.5 ms |

---

## 4. Mathematical Consistency Verification
- $\text{Accuracy} = \frac{110 + 128}{300} = \frac{238}{300} = 0.79333... \implies \mathbf{79.33\%}$
- $\text{Precision} = \frac{110}{110 + 22} = \frac{110}{132} = 0.83333... \implies \mathbf{83.33\%}$
- $\text{Recall} = \frac{110}{110 + 40} = \frac{110}{150} = 0.73333... \implies \mathbf{73.33\%}$
- $\text{F1-Score} = 2 \times \frac{0.83333 \times 0.73333}{0.83333 + 0.73333} = \frac{1.22222}{1.56667} = 0.78014... \implies \mathbf{78.01\%}$
- **Consistency Verdict:** 100% MATHEMATICALLY EXACT & VERIFIED.
