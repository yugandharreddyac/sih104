/**
 * VOXSHIELD RTP Stream Session Manager
 * Tracks sequence numbers, calculates packet loss, decodes G.711 payloads,
 * buffers linear PCM, and feeds normalized audio to the AI intelligence pipeline.
 */

import { EventEmitter } from 'events';
import { RtpPacket, RtpStreamMetrics, TelephonySessionMetadata } from './types';
import { G711Codec } from './codecs';
import { AudioNormalizer, NormalizedAudioResult } from '../../calls/audio_normalizer';

export class RtpSession extends EventEmitter {
  public readonly metadata: TelephonySessionMetadata;
  private metrics: RtpStreamMetrics;
  private pcmAccumulator: Buffer = Buffer.alloc(0);
  private lastSeqNumber: number | null = null;
  private lastTimestamp: number | null = null;
  private lastPacketReceivedAt: Date = new Date();
  private frameIndex: number = 0;

  // Target frame size: 256ms at 8000 Hz = 2048 samples = 4096 bytes (16-bit linear PCM)
  public static readonly TARGET_FRAME_BYTES_8K = 4096;

  constructor(metadata: TelephonySessionMetadata) {
    super();
    this.metadata = metadata;
    this.metrics = {
      packetsReceived: 0,
      packetsLost: 0,
      outOfOrderPackets: 0,
      bytesReceived: 0,
      lastSequenceNumber: 0,
      lastTimestamp: 0,
      durationMs: 0,
      jitterMs: 0,
      activeCodec: metadata.codec,
      sampleRate: metadata.sampleRate,
    };
  }

  /**
   * Ingests a parsed RTP packet, decodes payload, tracks sequence continuity,
   * and yields normalized audio chunks for real-time analysis.
   */
  public processPacket(packet: RtpPacket): NormalizedAudioResult[] {
    this.metrics.packetsReceived++;
    this.metrics.bytesReceived += packet.payload.length;
    this.lastPacketReceivedAt = new Date();

    const seq = packet.header.sequenceNumber;

    // Sequence tracking and loss detection
    if (this.lastSeqNumber !== null) {
      const diff = (seq - this.lastSeqNumber) & 0xffff;
      
      if (diff === 0) {
        // Exact duplicate
        this.metrics.outOfOrderPackets++;
        return [];
      } else if (diff >= 32768) {
        // Older out-of-order packet (arrived late)
        this.metrics.outOfOrderPackets++;
        return [];
      } else {
        // Newer packet. Detect packet loss.
        const expectedSeq = (this.lastSeqNumber + 1) & 0xffff;
        if (seq !== expectedSeq) {
          const lost = (seq - this.lastSeqNumber - 1) & 0xffff;
          if (lost > 0 && lost < 1000) {
            this.metrics.packetsLost += lost;
          }
        }
        this.lastSeqNumber = seq;
      }
    } else {
      this.lastSeqNumber = seq;
    }
    this.metrics.lastSequenceNumber = seq;
    this.metrics.lastTimestamp = packet.header.timestamp;

    // Decode G.711 / PCM payload
    const decoded = G711Codec.decodeRtpPayload(packet.header.payloadType, packet.payload);
    if (!decoded) {
      return [];
    }

    this.metrics.activeCodec = decoded.codec;
    this.metrics.sampleRate = decoded.sampleRate;

    // Accumulate decoded 8kHz linear PCM
    this.pcmAccumulator = Buffer.concat([this.pcmAccumulator, decoded.pcmBuffer]);

    const normalizedResults: NormalizedAudioResult[] = [];

    // Slice frames when enough audio has accumulated (or at standard 256ms intervals)
    while (this.pcmAccumulator.length >= RtpSession.TARGET_FRAME_BYTES_8K) {
      const frameBuffer = this.pcmAccumulator.subarray(0, RtpSession.TARGET_FRAME_BYTES_8K);
      this.pcmAccumulator = this.pcmAccumulator.subarray(RtpSession.TARGET_FRAME_BYTES_8K);

      // Normalize 8kHz Mono linear PCM to 16kHz Mono float/PCM using project AudioNormalizer
      const normalized = AudioNormalizer.normalize(frameBuffer, decoded.sampleRate, 1);
      if (normalized.isValid) {
        this.frameIndex++;
        this.metrics.durationMs += normalized.durationMs;
        normalizedResults.push(normalized);
        this.emit('audio_frame', {
          callId: this.metadata.callId,
          frameIndex: this.frameIndex,
          normalized,
          metrics: { ...this.metrics },
        });
      }
    }

    return normalizedResults;
  }

  /**
   * Flush any remaining partial audio buffer at call termination.
   */
  public flush(): NormalizedAudioResult | null {
    if (this.pcmAccumulator.length >= 320) { // >= 20ms at 8kHz
      const normalized = AudioNormalizer.normalize(this.pcmAccumulator, this.metrics.sampleRate || 8000, 1);
      this.pcmAccumulator = Buffer.alloc(0);
      if (normalized.isValid) {
        this.frameIndex++;
        return normalized;
      }
    }
    this.pcmAccumulator = Buffer.alloc(0);
    return null;
  }

  public getMetrics(): RtpStreamMetrics {
    return { ...this.metrics };
  }

  public getLastActive(): Date {
    return this.lastPacketReceivedAt;
  }
}
