# VOXSHIELD Phase 4 — Conversational Intelligence & Behavioral Analysis Architecture

## 1. System Overview
The Conversational Intelligence subsystem analyzes text transcripts produced by the Streaming ASR engine across multiple turns. It extracts semantic intent, identifies tactical social-engineering indicators, maintains bounded multi-turn session memory, verifies identity and behavioral consistency, and feeds behavioral signals into the 10-dimensional risk fusion engine.

```
Streaming ASR (Whisper)
         │
         ▼
[Transcript Normalized]
         │
 ┌───────┴────────────────────────┬─────────────────────────┐
 ▼                                ▼                         ▼
[Intent Classifier]      [Tactics Extractor]      [Sensitive Data Detector]
 (17 Categories)          (7 Tactics Groups)       (Negation-Aware PII)
         │                        │                         │
         └───────────────┬────────┴─────────────────────────┘
                         ▼
        [Multi-Turn Attack Sequence Tracker]
         (Attack Progression State Machine)
                         │
                         ▼
       [Conversation Context & Memory Manager]
        (Bounded Rolling Buffer - 20 Turns)
                         │
                         ▼
       [Claims & Inconsistency Verifier]
        (Identity Contradictions & Reversals)
                         │
                         ▼
      [CanonicalSignalBus ──► RiskFusionEngine]
```

## 2. Intent Taxonomy & Semantic Engine
* **Classification Engine**: Multi-token regex rule matching with ASR confidence scaling in `ConversationalIntentClassifier`.
* **Categories**: `OTP_REQUEST`, `PASSWORD_RESET`, `MONEY_TRANSFER_REQUEST`, `REMOTE_ACCESS_REQUEST`, `AUTHENTICATION_BYPASS`, `CARD_INFORMATION_REQUEST`, `ACCOUNT_ACCESS`, `CALLBACK_AVOIDANCE`, `BENIGN_INQUIRY`, and aliases for generic financial/support inquiries.
* **ASR Confidence Dampening**: $\text{calibrated\_confidence} = \text{base\_confidence} \times \text{asr\_confidence}$.

## 3. Social Engineering Taxonomy & Multilingual Support
* **Tactics Groups**: Authority Exploitation, Urgency Pressure, Fear & Coercion, Secrecy Demands, Isolation Attempts, Verification Bypass, Financial Pressure.
* **Indian Language & Dialect Coverage**: Rule patterns engineered for English, Hindi, Telugu, Tamil, Bengali, Marathi, and mixed code-switching.
* **Attack Progression**:
  - `BENIGN_CONVERSATION`
  - `AUTHORITY_ESTABLISHED`
  - `FEAR_URGENCY_INDUCED`
  - `AUTHENTICATION_BYPASS_ATTEMPTED`
  - `SECRET_HARVESTING_ATTEMPTED`
  - `CRITICAL_ACTION_EXPLOITATION`

## 4. Sensitive Data Protection & Redaction
* **Negation Awareness**: Distinguishes defensive/educational statements ("The bank will never ask for your password") from malicious solicitations ("Please share your OTP").
* **Immediate Ephemeral Redaction**: Replaces credentials with `[REDACTED]` before saving turns to memory or emitting events.

## 5. Multi-Turn Session Memory & Call Isolation
* **Bounded Buffer**: `CallConversationMemory` utilizes `deque(maxlen=20)` to strictly bound memory consumption during long calls.
* **Isolation**: All session memory is keyed by unique `call_id`. Calling `remove(call_id)` upon stream termination purges state completely.
