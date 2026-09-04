/**
 * VOXSHIELD RTP / Telephony Ingestion Types
 */

export enum RtpPayloadType {
  PCMU = 0,    // ITU-T G.711 μ-law (8 kHz, 1 channel)
  GSM = 3,     // GSM 06.10 (8 kHz, 1 channel)
  G723 = 4,    // G.723.1 (8 kHz, 1 channel)
  PCMA = 8,    // ITU-T G.711 A-law (8 kHz, 1 channel)
  G722 = 9,    // ITU-T G.722 (16 kHz, 1 channel)
  L16_STEREO = 10, // Linear PCM 16-bit stereo (44.1 kHz)
  L16_MONO = 11,   // Linear PCM 16-bit mono (44.1 kHz)
  G729 = 18,   // G.729 (8 kHz, 1 channel)
  DYNAMIC_OPUS = 111, // Typical Opus dynamic payload type (48 kHz)
}

export interface RtpHeader {
  version: number;          // Typically 2
  padding: boolean;
  extension: boolean;
  csrcCount: number;
  marker: boolean;
  payloadType: number;      // RtpPayloadType or dynamic
  sequenceNumber: number;   // 16-bit integer
  timestamp: number;        // 32-bit integer
  ssrc: number;             // Synchronization Source Identifier (32-bit)
  csrcList: number[];       // Contributing Source Identifiers
  extensionHeader?: {
    definedByProfile: number;
    length: number;
    data: Buffer;
  };
}

export interface RtpPacket {
  header: RtpHeader;
  payload: Buffer;
  rawLength: number;
  receivedAt: Date;
}

export interface RtpStreamMetrics {
  packetsReceived: number;
  packetsLost: number;
  outOfOrderPackets: number;
  bytesReceived: number;
  lastSequenceNumber: number;
  lastTimestamp: number;
  durationMs: number;
  jitterMs: number;
  activeCodec: string;
  sampleRate: number;
}

export interface TelephonySessionMetadata {
  callId: string;
  sessionId: string;
  ssrc: number;
  remoteAddress: string;
  remotePort: number;
  callerIdentifier?: string;
  destinationIdentifier?: string;
  direction?: 'INBOUND' | 'OUTBOUND';
  organizationId?: string;
  codec: string;
  sampleRate: number;
  channels: number;
  startedAt: Date;
  endedAt?: Date;
  region?: string;
  provider?: string;
}
