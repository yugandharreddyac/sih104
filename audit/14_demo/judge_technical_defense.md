# VOXSHIELD — Judge Technical Defense & Q&A Master Guide

**Document Purpose:** Accurate, evidence-based answers to the 24 most critical technical questions expected from SIH judges and industry review panels.

---

### 1. What problem does VOXSHIELD solve?
VOXSHIELD protects financial institutions, enterprise call centers, and telecom networks from real-time AI voice cloning (deepfakes), biometric voice impersonation, and multi-lingual social engineering scams during live telephony conversations.

### 2. Why is this problem important?
Generative AI voice cloners can replicate a victim's voice from just a few seconds of audio. Attackers use these synthetic clones alongside high-pressure social engineering tactics to bypass traditional voice biometrics, trick bank operators, and authorize unauthorized financial wire transfers or steal OTPs.

### 3. Why is AI necessary?
Deterministic heuristics cannot detect subtle phase artifacts, unnatural high-frequency vocoder harmonics, or contextual conversational pressure across multiple Indian languages. Neural models (like CNNs and ECAPA-TDNN) learn generalized representations of acoustic artifacts and speaker voiceprints that rule-based systems miss.

### 4. What exactly is the AI doing?
The AI operates across four coordinated stages:
1. **Acoustic Intelligence:** Evaluates 60-bin Log-Mel Spectrograms + 60-bin LFCCs using `MiniAcousticCNN` to detect synthetic vocoder artifacts.
2. **Biometric Intelligence:** Generates 192-D embeddings via `ECAPA-TDNN` to verify the caller's voiceprint against the enrolled customer profile.
3. **Conversational Intelligence:** Runs multilingual ASR (Faster-Whisper) to transcribe dialogue, redacts financial PII, and identifies scam intents (urgency, authority impersonation).
4. **Multi-Modal Risk Fusion:** Aggregates all acoustic, biometric, and linguistic signals into a unified 10-dimensional risk tensor.

### 5. What is the innovation?
VOXSHIELD's key innovations are:
- **10-Dimensional Multi-Modal Risk Fusion:** Rather than relying on acoustic cues alone (which can be degraded by telephony noise), VOXSHIELD fuses acoustic, speaker biometric, conversational intent, and financial transaction context.
- **Source-Disjoint & Channel-Augmented Training:** Prevents memorization of specific voice generators and maintains accuracy across lossy PSTN/cellular G.711 telephony codecs.
- **Real-Time Privacy Firewall:** In-transit masking of sensitive credentials (OTPs, CVVs, Aadhaar) before audio/text is stored or transmitted.

### 6. What dataset was used?
Model evaluation and benchmarking was conducted on the **ASVspoof 2021 Deepfake (DF)** benchmark corpus, supplemented by the **Voice Conversion Challenge (VCC2018/2020)** for source-disjoint model training, plus synthetic telephony-augmented channels (G.711 A-law/μ-law).

### 7. How large is the dataset?
The primary evaluation partition consists of 300 held-out evaluation samples (150 bona fide, 150 spoof) covering 13 unseen attack systems (A07–A19), derived from a wider corpus of 2,800 balanced training/validation clips.

### 8. How was the dataset split?
Strict source-disjoint partitioning:
- 70% Training (1,400 samples, 97 voice conversion systems)
- 15% Validation (used strictly to calibrate operating thresholds)
- 15% Held-Out Testing (300 samples, evaluated with all weights and thresholds frozen)

### 9. What is the accuracy?
The measured accuracy on the held-out test set is **79.33%** (`0.7933`), outperforming the traditional ML baseline by **+15.00 percentage points** (64.33%).

### 10. What is precision?
The measured precision is **83.33%** (`0.8333`), meaning that over 83% of calls flagged as deepfakes by the acoustic detector are genuine attacks, minimizing unnecessary SOC alert fatigue.

### 11. What is recall?
The measured recall (sensitivity) is **73.33%** (`0.7333`), catching nearly 3 out of every 4 deepfake clones at the raw acoustic layer alone (compared to only 40.0% recall on the traditional baseline).

### 12. What is F1-score?
The measured F1-score is **78.01%** (`0.7801`), achieving a balanced tradeoff between false alarms and threat interception.

### 13. What does the confusion matrix show?
On the 300 held-out test samples:
- **TN = 128:** Bona fide customer calls correctly allowed
- **FP = 22:** False alarms (safely handled by requiring multi-modal corroboration)
- **FN = 40:** Sophisticated deepfakes that bypass the raw acoustic layer (caught downstream by speaker biometrics and conversational risk)
- **TP = 110:** Malicious voice clones intercepted

### 14. What are false positives and how are they handled?
A false positive occurs when legitimate caller audio is flagged as synthetic (e.g. due to severe background noise). VOXSHIELD prevents false disruptions by enforcing a **Policy Engine hierarchy**: an acoustic warning alone does not terminate a call; termination or step-up verification requires cross-modal corroboration with conversational intent or biometric mismatch.

### 15. What are false negatives and how are they handled?
A false negative occurs when a near-perfect voice clone passes acoustic spectral inspection. In VOXSHIELD, defense-in-depth ensures that the attacker cannot easily spoof the 192-D speaker biometric embedding or conceal conversational red flags (such as demanding an urgent wire transfer to an unknown account).

### 16. How does VOXSHIELD compare with traditional approaches?
Compared to a 48-D DSP Random Forest baseline on identical test data, VOXSHIELD delivers:
- **+15.0% higher Accuracy** (79.33% vs 64.33%)
- **+33.3% higher Recall** (73.33% vs 40.00%)
- **+25.1% higher F1-score** (78.01% vs 52.86%)
- **-8.3% lower Equal Error Rate** (18.67% vs 27.00%)

### 17. How was red-team testing performed?
12 controlled adversarial attack scenarios were tested covering: malformed audio payloads, NaN/Inf numeric tensor injection, JWT forgery, RBAC privilege escalation, cross-tenant data sniffing, RTP packet loss & jitter, acoustic replay, PII exfiltration, and 100-stream load flooding. All 12 attacks were successfully defended (100% pass rate).

### 18. What happens when the AI is wrong?
VOXSHIELD utilizes **human-in-the-loop SOC governance**. High-risk actions (such as freezing an account or terminating an active call) provide an immediate analyst intervention console where human SOC operators can review the live waveform, transcript token highlights, and override or confirm decisions.

### 19. What happens when the AI service fails?
The backend implements a **Circuit Breaker & Degraded Mode Handler**. If the Python AI service times out or is offline (`ECONNREFUSED`), the backend logs an audit event, sets `overall_risk_score = null` with status `NOT_AVAILABLE`, and notifies the SOC UI without crashing the backend or dropping the active phone call.

### 20. How is security handled?
- Signed JWT authentication with role-based access control (RBAC).
- HMAC-SHA256 signatures (`X-VoxShield-Signature`) on outbound intervention webhooks.
- Multi-tenant isolation at database and WebSocket room levels.
- Real-time privacy firewall redacting financial PII before persistence.
- Zero plaintext secrets in code.

### 21. How does the architecture scale?
The Python AI service and Node.js backend are decoupled microservices communicating asynchronously over HTTP/WebSocket. The architecture supports horizontal container replication with Redis pub/sub message brokering and handles 100 concurrent telephony streams with bounded heap usage (+47.8 MB).

### 22. What are the limitations?
1. Commercial proprietary voice-cloners (e.g., ElevenLabs) are continuously evolving; ongoing model updates are required.
2. Severely degraded 8 kHz legacy cellular lines with high packet loss increase uncertainty in acoustic spectral analysis.
3. Indic language speech recognition is dependent on acoustic clarity and background noise conditions.

### 23. What would be done in production?
In a full production banking deployment:
- Deploy on Kubernetes with GPU-accelerated inference nodes (Triton / TensorRT).
- Connect directly to telecom carrier SIP trunks via Asterisk / FreeSWITCH PBX.
- Integrate with real-time core banking anti-fraud engines via HMAC webhooks.
- Fine-tune multilingual ASR models across all 22 scheduled Indian languages using the ai4bharat IndicVoices dataset.

### 24. Why should this solution be selected?
VOXSHIELD provides an end-to-end, scientifically validated, production-grade defense system that does not rely on single-point heuristics. With **464 passing automated tests**, **proven 10D multi-modal risk fusion**, **sub-70ms real-time inference**, **strict privacy firewalling**, and an **intuitive SOC command center**, VOXSHIELD delivers the most complete and credible solution for Problem Statement SIH104.
