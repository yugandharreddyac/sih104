/**
 * VOXSHIELD RTP / Telephony Ingestion Unit & Integration Tests
 */

import { RtpParser } from '../src/telephony/rtp/rtp_parser';
import { G711Codec } from '../src/telephony/rtp/codecs';
import { RtpSession } from '../src/telephony/rtp/rtp_session';
import { RtpServer } from '../src/telephony/rtp/rtp_server';
import { RtpCommunicationAdapter } from '../src/calls/communication_adapter';
import { RtpHeader, RtpPayloadType } from '../src/telephony/rtp/types';

describe('Telephony & RTP Ingestion Engine', () => {
  describe('RtpParser', () => {
    it('should parse a valid RFC 3550 RTP packet correctly', () => {
      const payload = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
      const header: Partial<RtpHeader> = {
        version: 2,
        padding: false,
        extension: false,
        marker: true,
        payloadType: RtpPayloadType.PCMU,
        sequenceNumber: 1042,
        timestamp: 160000,
        ssrc: 0x12345678,
      };

      const rawBuffer = RtpParser.serialize(header, payload);
      const parsed = RtpParser.parse(rawBuffer);

      expect(parsed).not.toBeNull();
      expect(parsed!.header.version).toBe(2);
      expect(parsed!.header.marker).toBe(true);
      expect(parsed!.header.payloadType).toBe(RtpPayloadType.PCMU);
      expect(parsed!.header.sequenceNumber).toBe(1042);
      expect(parsed!.header.timestamp).toBe(160000);
      expect(parsed!.header.ssrc).toBe(0x12345678);
      expect(parsed!.payload).toEqual(payload);
    });

    it('should parse RTP packets with CSRC list correctly', () => {
      const payload = Buffer.from([0xaa, 0xbb, 0xcc]);
      const header: Partial<RtpHeader> = {
        version: 2,
        payloadType: RtpPayloadType.PCMA,
        sequenceNumber: 500,
        timestamp: 8000,
        ssrc: 0x99887766,
        csrcList: [0x11111111, 0x22222222],
      };

      const rawBuffer = RtpParser.serialize(header, payload);
      const parsed = RtpParser.parse(rawBuffer);

      expect(parsed).not.toBeNull();
      expect(parsed!.header.csrcCount).toBe(2);
      expect(parsed!.header.csrcList).toEqual([0x11111111, 0x22222222]);
      expect(parsed!.payload).toEqual(payload);
    });

    it('should reject malformed packets shorter than 12 bytes safely', () => {
      const shortBuffer = Buffer.from([0x80, 0x00, 0x01]);
      const parsed = RtpParser.parse(shortBuffer);
      expect(parsed).toBeNull();
    });

    it('should reject non-version-2 RTP packets', () => {
      const invalidVersionBuffer = Buffer.alloc(16);
      invalidVersionBuffer.writeUInt8(0x40, 0); // Version = 1
      const parsed = RtpParser.parse(invalidVersionBuffer);
      expect(parsed).toBeNull();
    });

    it('should handle empty or null buffer safely without throwing', () => {
      expect(RtpParser.parse(null as any)).toBeNull();
      expect(RtpParser.parse(Buffer.alloc(0))).toBeNull();
    });
  });

  describe('G711Codec (PCMU & PCMA Decoders)', () => {
    it('should decode ITU-T G.711 μ-law (PCMU) to 16-bit linear PCM', () => {
      // 0xFF in μ-law is silence / zero, 0x00 is max positive peak, 0x80 is max negative peak
      const ulawBuffer = Buffer.from([0xff, 0xff, 0x00, 0x80]);
      const pcmBuffer = G711Codec.decodeUlaw(ulawBuffer);

      expect(pcmBuffer.length).toBe(ulawBuffer.length * 2);
      // Sample 0 & 1 (0xff) are 0 (silence)
      expect(pcmBuffer.readInt16LE(0)).toBe(0);
      expect(pcmBuffer.readInt16LE(2)).toBe(0);
      // Positive peak (0x00) is positive
      expect(pcmBuffer.readInt16LE(4)).toBeGreaterThan(30000);
      // Negative peak (0x80) is negative
      expect(pcmBuffer.readInt16LE(6)).toBeLessThan(-30000);
    });

    it('should decode ITU-T G.711 A-law (PCMA) to 16-bit linear PCM', () => {
      // 0xD5 in A-law is zero level, 0xAA is max positive peak, 0x2A is max negative peak
      const alawBuffer = Buffer.from([0xd5, 0xd5, 0xaa, 0x2a]);
      const pcmBuffer = G711Codec.decodeAlaw(alawBuffer);

      expect(pcmBuffer.length).toBe(alawBuffer.length * 2);
      expect(pcmBuffer.readInt16LE(0)).toBe(8); // A-law quantization center
      expect(pcmBuffer.readInt16LE(2)).toBe(8);
      expect(pcmBuffer.readInt16LE(4)).toBeGreaterThan(30000);
      expect(pcmBuffer.readInt16LE(6)).toBeLessThan(-30000);
    });

    it('should route RTP payload type 0 to G711U and 8 to G711A', () => {
      const dummyPayload = Buffer.alloc(160, 0xff); // 20ms at 8kHz

      const decodedUlaw = G711Codec.decodeRtpPayload(0, dummyPayload);
      expect(decodedUlaw).not.toBeNull();
      expect(decodedUlaw!.codec).toBe('G711U');
      expect(decodedUlaw!.sampleRate).toBe(8000);
      expect(decodedUlaw!.pcmBuffer.length).toBe(320);

      const decodedAlaw = G711Codec.decodeRtpPayload(8, dummyPayload);
      expect(decodedAlaw).not.toBeNull();
      expect(decodedAlaw!.codec).toBe('G711A');
      expect(decodedAlaw!.sampleRate).toBe(8000);
      expect(decodedAlaw!.pcmBuffer.length).toBe(320);

      const unsupported = G711Codec.decodeRtpPayload(99, dummyPayload);
      expect(unsupported).toBeNull();
    });
  });

  describe('RtpSession Stream Processing', () => {
    it('should track packets received, sequence numbers, and buffer frames', () => {
      const session = new RtpSession({
        callId: 'test-call-rtp-001',
        sessionId: 'rtp-sess-1',
        ssrc: 0x1234,
        remoteAddress: '127.0.0.1',
        remotePort: 10000,
        codec: 'G711U',
        sampleRate: 8000,
        channels: 1,
        startedAt: new Date(),
      });

      // Send 13 RTP packets of 160 bytes (20ms each = 260ms total > 256ms chunk threshold)
      for (let i = 0; i < 13; i++) {
        const payload = Buffer.alloc(160, 0xff);
        const header: Partial<RtpHeader> = {
          version: 2,
          payloadType: 0,
          sequenceNumber: 100 + i,
          timestamp: i * 160,
          ssrc: 0x1234,
        };
        const rawPacket = RtpParser.serialize(header, payload);
        const parsed = RtpParser.parse(rawPacket)!;
        session.processPacket(parsed);
      }

      const metrics = session.getMetrics();
      expect(metrics.packetsReceived).toBe(13);
      expect(metrics.lastSequenceNumber).toBe(112);
      expect(metrics.packetsLost).toBe(0);
      expect(metrics.outOfOrderPackets).toBe(0);
    });

    it('should detect packet loss when sequence numbers jump', () => {
      const session = new RtpSession({
        callId: 'test-call-rtp-002',
        sessionId: 'rtp-sess-2',
        ssrc: 0x5678,
        remoteAddress: '127.0.0.1',
        remotePort: 10002,
        codec: 'G711U',
        sampleRate: 8000,
        channels: 1,
        startedAt: new Date(),
      });

      const p1 = RtpParser.parse(RtpParser.serialize({ version: 2, payloadType: 0, sequenceNumber: 1, timestamp: 0, ssrc: 0x5678 }, Buffer.alloc(160)))!;
      const p2 = RtpParser.parse(RtpParser.serialize({ version: 2, payloadType: 0, sequenceNumber: 5, timestamp: 640, ssrc: 0x5678 }, Buffer.alloc(160)))!;

      session.processPacket(p1);
      session.processPacket(p2);

      const metrics = session.getMetrics();
      expect(metrics.packetsReceived).toBe(2);
      expect(metrics.packetsLost).toBe(3); // Lost sequence 2, 3, 4
    });
  });

  describe('RtpCommunicationAdapter', () => {
    it('should initialize and stream audio chunks through normalization', async () => {
      const adapter = new RtpCommunicationAdapter();
      await adapter.initialize();

      const callId = await adapter.startCallSession({
        callId: 'adapter-call-01',
        callerIdentifier: '+15551234567',
        destinationIdentifier: '1001',
        protocol: 'SIP',
        sampleRate: 8000,
        channels: 1,
        startedAt: new Date(),
      });

      expect(callId).toBe('adapter-call-01');

      const pcmPayload = Buffer.alloc(320); // 160 samples at 8kHz = 20ms
      const normalized = await adapter.streamAudioChunk({
        callId: 'adapter-call-01',
        chunkIndex: 0,
        timestampMs: Date.now(),
        data: pcmPayload,
        channelIndex: 0,
        sampleRate: 8000,
        channels: 1,
      });

      expect(normalized.isValid).toBe(true);
      expect(normalized.sampleRate).toBe(16000); // Normalized to 16kHz

      await adapter.terminateCallSession('adapter-call-01');
    });
  });
});
