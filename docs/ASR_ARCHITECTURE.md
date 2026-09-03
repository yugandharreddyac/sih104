# SIH104 — ASYNCHRONOUS VAD-BUFFERED ASR ARCHITECTURE

## 1. Problem Statement

Continuous execution of `Faster-Whisper Base INT8` synchronously on every 256 ms linear PCM chunk on single-thread CPU requires approximately $\approx 8.43\text{ seconds}$ per frame. This creates an unacceptable processing bottleneck if coupled directly to the synchronous security path.

---

## 2. Decoupled Dual-Path Architecture

```
256 ms Linear PCM Chunks
          │
          ├───────────────────────────────> [FAST ACOUSTIC SECURITY LOOP (Synchronous)]
          │                                  ├─ Deepfake Detection (Wav2Vec2 ONNX: 18-32ms)
          │                                  ├─ Speaker Verification (ECAPA-TDNN: 12-25ms)
          │                                  ├─ Replay Analysis (SciPy FFT DSP: 1-3ms)
          │                                  ├─ Quality & SNR Degradation Assessment
          │                                  └─ Fast Telemetry & Acoustic Risk Emission (<45ms)
          │
          └───────────────────────────────> [VAD & SPEECH ACTIVITY ACCUMULATOR]
                                                │
                                                ▼ (Energy & Zero-Crossing Rate VAD)
                                         [Speech Segment Buffer (~2–3s Window)]
                                                │
                                                ▼ (Async Worker Job Dispatch)
                                         [BACKGROUND ASR WORKER (Faster-Whisper INT8)]
                                                │
                                                ▼
                                         [17-Class Intent & Multilingual Tactics Rules]
                                                │
                                                ▼
                                         [Unified Risk Matrix & Policy Update Broadcast]
```

---

## 3. Core Architectural Principles

1. **Independent Acoustic Execution**: Acoustic threat intelligence (deepfake, replay, biometric mismatch) executes immediately and emits telemetry within $<45\text{ ms}$. It never blocks or waits for Whisper transcription.
2. **VAD Speech Segmentation**: Audio is accumulated into speech segments of $2.0 - 3.0\text{ seconds}$ duration. Silence periods ($\text{energy} < -45\text{ dBFS}$) trigger segment finalization, avoiding wasted inference on background noise.
3. **Async Worker Queue**: ASR transcription jobs are queued to an asynchronous worker pool. If the worker queue exceeds 5 jobs, oldest unanalyzed segments are dropped under backpressure while maintaining continuous acoustic threat surveillance.
4. **Monotonic Sequence Ordering**: Every ASR result contains `callId`, `segmentId`, `startSequenceNumber`, and `endSequenceNumber`. Stale transcripts from delayed jobs cannot overwrite newer conversational intelligence.
5. **Zero Trust for Client Transcripts**: If ASR is delayed, in error, or degraded, caller-supplied transcripts are tagged as `[UNTRUSTED_CLIENT_HINT]` with `confidence = 0.0` and cannot independently trigger security decisions.
