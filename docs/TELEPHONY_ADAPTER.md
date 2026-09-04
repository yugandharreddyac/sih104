# Telephony & Media Adapter Architecture Report

## Architecture Overview
VOXSHIELD provides a media-agnostic ingestion architecture designed to interface with diverse telephony sources (WebRTC, SIP trunks, PSTN gateways, and test fixtures) through the `CommunicationAdapter` and `MediaAdapter` abstractions (`src/calls/communication_adapter.ts`).

```text
[WebRTC Client / SIP Trunk]
           │
           ▼
[WebSocket Gateway (/ws)] ──(protocol, mediaSource, timestampMs)
           │
           ▼
  [AudioNormalizer] ──────(Resample & Downmix to 16kHz PCM)
           │
           ▼
    [StreamBuffer] ───────(Sorted Packet Reordering & Memory Bounds)
           │
           ▼
  [AI Inference Pipeline]
```

---

## Telephony Subsystem Status Matrix

| Capability / Module | Status | Technical Details |
| :--- | :--- | :--- |
| **`CommunicationAdapter` Interface** | `IMPLEMENTED` | Standard interface for call session lifecycle (`startCallSession`, `streamAudioChunk`, `terminateCallSession`). |
| **`TestAudioAdapter` Fixture** | `LIVE VERIFIED` | Software fixture emitting simulated audio streams and testing buffer manager (`communication_adapter.ts`). |
| **Canonical Audio Format** | `LIVE VERIFIED` | Normalizes all incoming audio to 16-bit Signed Linear PCM (`pcm_s16le`), 16,000 Hz, 1 Channel (Mono). |
| **Audio Normalization Engine** | `LIVE VERIFIED` | `AudioNormalizer` resamples 8k/44.1k/48k to 16k, downmixes stereo, and parses WAV header fmt chunks (`audio_normalizer.ts`). |
| **Packet Reordering Engine** | `LIVE VERIFIED` | `StreamBuffer.push()` performs sorted insertion by `sequenceNumber` to resolve out-of-order packet arrival (`stream_buffer.ts`). |
| **Duplicate Sequence Rejection** | `LIVE VERIFIED` | Suppresses duplicate sequence numbers without expanding buffer size or throwing sequence errors. |
| **Timestamp Semantics** | `LIVE VERIFIED` | Accepts Unix epoch `timestampMs` from media source (including edge clock skew), defaulting to `Date.now()` when missing. |
| **Media Source & Protocol Metadata** | `LIVE VERIFIED` | Accepts `protocol` (`WEBRTC`, `SIP`, `PSTN`) and `mediaSource` (`TWILIO_VOICE`, `ASTERISK`) at WS and adapter boundary. |
| **Session Termination & Memory Bounds** | `LIVE VERIFIED` | Bounded per-call memory (`MAX_BUFFER_CHUNKS = 100`, `MAX_BUFFER_BYTES = 5 MB`); buffer cleared on `END_STREAM`. |
| **Hardware SIP / PBX Trunks** | `NOT VERIFIED` | Direct hardware connection to live Asterisk/FreeSWITCH/Twilio SIP trunks (stubbed via `SipVoipAdapterStub`). |

---

## Canonical Audio Specification & Normalization Rules

| Property | Canonical Target Specification | Normalization Action |
| :--- | :--- | :--- |
| **Encoding** | `pcm_s16le` (16-bit Signed LE PCM) | Extracted from raw PCM buffer or WAV data subchunk. |
| **Sample Rate** | `16000` Hz (16 kHz) | Resampled via linear interpolation from 8,000 Hz, 44,100 Hz, or 48,000 Hz. |
| **Channels** | `1` (Mono) | Stereo (2-channel) input is downmixed by averaging left and right channel samples: `(L + R) / 2`. |
| **Frame Alignment** | 2 bytes per sample | Enforces sample boundary alignment and truncates trailing incomplete frame bytes. |

---

## Packet Reordering & Buffer Management

1. **Out-of-Order Packet Handling**:
   - `StreamBuffer` inserts incoming chunks into a sorted array ordered by `sequenceNumber`.
   - When packets arrive out-of-order (e.g. sequence numbers `0`, `3`, `1`, `2`), `getQueue()` stores them as `[0, 1, 2, 3]`, ensuring downstream AI models receive continuous sequential audio.

2. **Duplicate Sequence Suppression**:
   - Chunks with sequence numbers identical to an already buffered chunk are safely dropped (`accepted: true`) without duplicating data in RAM.

3. **Backpressure & Capacity Bounds**:
   - Hard cap of 100 chunks or 5 MB per session.
   - When limits are reached, the oldest chunk is dropped (`shifted`) to prevent memory leaks under network backpressure.

---

## Known Limitations & Telecom Integration Status
- **Software Abstraction Ready**: The software media pipeline is fully tested and verified.
- **Physical Carrier Wiring**: Live telecom carrier wiring (SIP trunks, E1/T1 PSTN lines) is `NOT VERIFIED` and requires deploying hardware SIP gateways or cloud telephony connectors (e.g. Twilio Media Streams, Asterisk ARI).
