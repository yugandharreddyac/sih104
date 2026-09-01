# VOXSHIELD: Phase 4 Conversational Intelligence & Streaming ASR

## 1. Executive Summary
VOXSHIELD Phase 4 implements real-time semantic analysis, provider-agnostic streaming ASR, contextual intent classification, situational sensitive data gating, social engineering tactic extraction, and multi-turn attack sequence recognition.

The system is built on the core principle:
> **A genuine human voice does not make a conversation trustworthy.**

---

## 2. Core Subsystems

### A. Provider-Agnostic Streaming ASR (`ai/app/asr/`)
- Ingests canonical 16kHz float32 audio chunks.
- Emits partial and finalized transcript segments with timestamps and word confidence.
- Multilingual support: English (en), Hindi (hi), Telugu (te).
- ASR uncertainty propagation: poor signal quality reduces downstream semantic confidence.

### B. Bounded Conversation Memory (`ai/app/conversation/`)
- Maintains a rolling 20-turn conversation buffer.
- Evicts oldest turns automatically to maintain bounded memory bounds.
- Zero raw audio is persisted in long-term storage.

### C. Contextual Intent Classifier (`ai/app/intent/`)
- Identifies critical intents (`OTP_REQUEST`, `PASSWORD_RESET`, `MONEY_TRANSFER_REQUEST`, `REMOTE_ACCESS_REQUEST`, `AUTHENTICATION_BYPASS`, `CARD_INFORMATION_REQUEST`, `BENIGN_INQUIRY`).
- Evaluates multi-token syntactic dependencies rather than simple single-keyword matches.

### D. Sensitive Data & Situation Gating (`ai/app/sensitive_data/`)
- Distinguishes:
  1. `BENIGN_MENTION`: e.g. "We will never ask for your password"
  2. `DIRECT_REQUEST`: e.g. "Tell me your OTP"
  3. `READ_ALOUD`: Spoken credential disclosure
  4. `INSTRUCTION_TO_DISCLOSE`: Future disclosure solicitation
- Enforces deterministic in-memory `[REDACTED]` sanitization before persistence.

### E. Social Engineering Tactics & Multi-Turn Attack Sequences (`ai/app/social_engineering/`)
- Tactic Extractors: Authority, Urgency, Fear, Secrecy, Isolation, Verification Bypass, Financial Pressure.
- Multi-Turn Sequence State Machine:
  `CLAIMED_AUTHORITY` $\to$ `CREATED_FEAR` $\to$ `ESTABLISHED_URGENCY` $\to$ `AUTHENTICATION_BYPASS` $\to$ `REQUESTED_SECRET` $\to$ `CRITICAL_ACTION`.
