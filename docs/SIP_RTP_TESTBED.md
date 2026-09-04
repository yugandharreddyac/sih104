# VOXSHIELD Local SIP/RTP Telephony Testbed

This guide provides step-by-step instructions to run a local SIP/RTP telephony testbed with Asterisk and test live media stream ingestion into VOXSHIELD.

> [!NOTE]
> **Scope**: This is a local development and evaluation testbed. It does not represent direct integration with live carrier IMS networks or bank production PBX switches.

---

## Architecture Overview

```
Softphone A (Ext 1001 - MicroSIP / Linphone / Zoiper)
       │ SIP Signaling (UDP 5060)
       ▼
[Local Asterisk PBX Container] (infrastructure/telephony/docker-compose.telephony.yml)
       │ SIP Signaling (UDP 5060)
       ▼
Softphone B (Ext 1002 - Agent Console)
       │
       │ RTP Media Stream (UDP 10000) [PCMU / PCMA, 8 kHz mono]
       ▼
[VOXSHIELD RTP Listener] (backend/src/telephony/rtp/rtp_server.ts)
       │ Decoded 16-bit PCM (8 kHz)
       ▼
[AudioNormalizer] (backend/src/calls/audio_normalizer.ts) ──▶ Resamples to 16 kHz Mono Float
       │
       ├──▶ Fast Acoustic Analysis (Wav2Vec2 Deepfake + ECAPA-TDNN Speaker + Replay)
       ├──▶ Speech Buffer ──▶ Streaming Faster-Whisper ASR + Conversational NLP
       └──▶ Multi-Modal Risk Fusion Matrix (10 Dimensions + Temporal Dynamics)
       │
       ▼
[WebSocket Gateway] (Port 4000/ws) ──▶ Emits UNIFIED_RISK_ASSESSMENT, AUDIO_TELEMETRY
       │
       ▼
[Next.js SOC Dashboard] (http://localhost:3000/calls)
```

---

## Step-by-Step Execution Guide

### 1. Start VOXSHIELD Core Backend
```bash
cd backend
npm run dev
```
Verify the RTP listener initializes:
```
📞 [RTP Server] Ingestion Gateway listening on UDP 0.0.0.0:10000
```

### 2. Start the Local Asterisk PBX Container
```bash
docker-compose -f infrastructure/telephony/docker-compose.telephony.yml up -d
```

### 3. Register Softphones

Download any free SIP softphone (e.g. [MicroSIP](https://www.microsip.org/), [Linphone](https://www.linphone.org/), or [Zoiper](https://www.zoiper.com/)):

| Parameter | Softphone 1 (Caller) | Softphone 2 (Agent) |
|---|---|---|
| **SIP Server / Domain** | `127.0.0.1:5060` | `127.0.0.1:5060` |
| **Username** | `1001` | `1002` |
| **Password** | `voxshield_test_pass_1001` | `voxshield_test_pass_1002` |
| **Audio Codecs** | `PCMU (G.711 μ-law)` or `PCMA (G.711 A-law)` | `PCMU` or `PCMA` |

### 4. Place a Test Telephony Call
1. From Softphone 1 (1001), dial extension `1002` (or echo extension `9001`).
2. Answer the call on Softphone 2 (1002).
3. Speak into Softphone 1's microphone.

### 5. Verify Ingestion & Risk Scoring
- In backend console logs:
  ```
  📞 [RTP Server] New Telephony Call Session initialized: call-telephony-... (SSRC: 0x..., Codec: G711U)
  ```
- In Next.js SOC Dashboard (`http://localhost:3000/calls`):
  - Active call appears in the live call list with identifier `SIP-127.0.0.1`.
  - Live audio waveform and RMS dBFS meter reflect telephony speech.
  - Multi-modal risk scores update dynamically in real time.
