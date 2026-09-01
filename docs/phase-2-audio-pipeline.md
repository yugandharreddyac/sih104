# VOXSHIELD: Phase 2 Real-Time Audio Intelligence & Streaming Pipeline

## 1. Executive Architecture Summary

Phase 2 establishes the end-to-end real-time audio transport, streaming normalization, voice activity detection (VAD), acoustic signal health analysis, and SOC telemetry pipeline.

```
+-----------------------------------------------------------------------------------+
|                        PHASE 2 REAL-TIME AUDIO PIPELINE                           |
|                                                                                   |
|  [ Microphone / Telephony Ingest ]                                                |
|                   ↓                                                               |
|  [ AudioFormatValidator & Normalizer ] ---> Canonical Linear PCM 16-bit 16kHz mono|
|                   ↓                                                               |
|  [ Bounded StreamBuffer ]              ---> Memory limits (5MB) & sequence checks |
|                   ↓                                                               |
|  [ WebSocket Transport Layer ]         ---> Authenticated full-duplex transport  |
|                   ↓                                                               |
|  [ AI Service Pipeline ]                                                          |
|      ├── Acoustic VAD Engine          ---> SPEECH | NON_SPEECH | UNCERTAIN        |
|      └── Signal Quality Analyzer      ---> RMS dBFS, Peak, SNR, Clipping, Rating  |
|                   ↓                                                               |
|  [ AudioAnalysisEvent Telemetry ]     ---> Pushed to SOC Frontend Console         |
+-----------------------------------------------------------------------------------+
```

---

## 2. Canonical Audio Format Specification

| Parameter | Specification | Purpose |
| :--- | :--- | :--- |
| **Audio Encoding** | Linear PCM 16-bit Signed Little Endian (`pcm_s16le`) | Zero lossy decompression latency |
| **Sample Rate** | 16,000 Hz (16 kHz) | Standard speech acoustic analysis bandwidth |
| **Channels** | 1 (Mono) | Independent caller vs. agent channel separation |
| **Max Payload Size** | 512 KB per chunk frame | Memory exhaustion & buffer bomb prevention |
| **Max Buffer Size** | 100 chunks / 5 MB per call | Bounded memory per session |

---

## 3. Real-Time VAD Formulation

The Voice Activity Detector in `ai/app/audio/vad.py` computes multi-feature acoustic characteristics without hardcoded amplitude thresholds:

1. **Short-Time Energy (RMS)**:
   $$\text{RMS} = \sqrt{\frac{1}{N}\sum_{i=1}^N x[i]^2}$$
   Coupled with an adaptive baseline noise floor tracking model.
2. **Zero-Crossing Rate (ZCR)**:
   $$\text{ZCR} = \frac{1}{2N}\sum_{i=1}^{N-1}|\text{sgn}(x[i]) - \text{sgn}(x[i-1])|$$
   Evaluated against conversational vocal phoneme ranges (0.02 - 0.40).
3. **Spectral Centroid & Speech Sub-Band Ratio**:
   $$\text{Centroid} = \frac{\sum f \cdot |X(f)|}{\sum |X(f)|}$$
   Evaluated in the telephony speech band (250 Hz - 3600 Hz).
4. **Decision Boundaries**:
   - $\text{Probability} \ge 0.55 \implies \text{SPEECH}$
   - $\text{Probability} \le 0.30 \implies \text{NON\_SPEECH}$
   - Otherwise $\implies \text{UNCERTAIN}$

---

## 4. Audio Quality & The Uncertainty Principle

### Axiom: Quality Degrades Analysis Reliability, Never Fakes a Spoof
$$\text{Poor Quality} \implies \text{High Uncertainty} \not\implies \text{Fake Voice}$$

The analyzer in `ai/app/audio/quality.py` measures:
- **RMS Level in dBFS**: $20 \log_{10}(\text{RMS})$
- **Clipping Ratio**: Proportion of samples exceeding $\pm 0.985$ saturation.
- **Dynamic Range & SNR**: $20 \log_{10}(P_{95} / P_{10})$
- **Quality Classification**:
  - `GOOD`: Clean signal, high SNR ($>12$ dB), $<1\%$ clipping.
  - `DEGRADED`: Mild noise, moderate clipping ($1\% - 5\%$), or quiet amplitude.
  - `POOR`: Severe clipping ($>5\%$), low SNR ($<4$ dB), or saturated noise floor.

---

## 5. WebSocket Protocol Specification

All streaming frames are handled on `/ws`:

| Message Type | Direction | Description |
| :--- | :--- | :--- |
| `AUTHENTICATE` | Client $\to$ Server | Submits JWT token for server-side identity validation. |
| `START_STREAM` | Client $\to$ Server | Initializes session buffer for specific `callId`. |
| `AUDIO_CHUNK` | Client $\to$ Server | Transports base64-encoded PCM chunk with sequence index. |
| `AUDIO_TELEMETRY` | Server $\to$ Client | Broadcasts real-time VAD state, quality metrics, and latency. |
| `STREAM_STATUS` | Client $\leftrightarrow$ Server | Inspects buffer metrics and packet drop counters. |
| `END_STREAM` | Client $\to$ Server | Terminates stream, flushes memory buffer, audits session. |
| `PING` / `PONG` | Bi-directional | Heartbeat liveness. |

---

## 6. Strict Scope & Boundaries

The following AI detection engines are **intentionally not implemented in Phase 2** and strictly return `NOT_AVAILABLE`:
- Deepfake neural acoustic models
- Biometric speaker verification
- Replay acoustic attack detector
- Streaming ASR transcription
- Social engineering NLP classifier
- Sensitive credential AI extractor
- Action risk ML models
