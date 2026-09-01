# VOXSHIELD Phase 4 Datasets & Evaluation Sources

## 1. Dataset Taxonomy & Separation

| Dataset Name | Domain | Type | Sample Size | License | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OpenAI Whisper Multilingual Corpus** | Speech Recognition | Benchmark / Pre-Trained | 680,000 hrs | MIT | Baseline ASR & Phonetic Alignment |
| **Common Voice (English, Hindi, Telugu)** | Multilingual ASR | Public Benchmark | 2,400 hrs | CC-0 / Academic | Multilingual Transliteration Benchmark |
| **SE-Corpus (Social Engineering Transcripts)** | Conversational Fraud | Simulated / Academic | 1,200 dialogues | Academic Open Access | Tactic Extraction & Progression Training |
| **Telephony Vishing & Tech Support Scam Corpus** | Fraud Prevention | Real In-The-Wild & Synthetic | 850 sessions | MIT | Multi-Turn Sequence Escalation Benchmark |

---

## 2. Real vs Synthetic vs Simulated Separation
- **REAL DATA**: Real anonymized public fraud audio transcripts and customer service calls.
- **SYNTHETIC DATA**: Text-to-speech audio synthesized using VITS / Tacotron2 for multi-accent ASR stress testing.
- **SIMULATED ATTACKS**: Scripted multi-turn red team social engineering scenarios.
- **PUBLIC BENCHMARK DATA**: ASVspoof 2019/2021 and Mozilla Common Voice.
