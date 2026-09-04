/**
 * RFC 3550 Real-time Transport Protocol (RTP) Packet Parser
 * Safely parses raw UDP datagram buffers into structured RtpPacket objects.
 */

import { RtpHeader, RtpPacket } from './types';

export class RtpParser {
  public static readonly MIN_HEADER_SIZE = 12;

  /**
   * Safely parses raw buffer into RtpPacket without throwing unhandled exceptions.
   * Returns null if buffer is too short, has invalid version, or malformed offsets.
   */
  public static parse(buffer: Buffer): RtpPacket | null {
    if (!buffer || buffer.length < this.MIN_HEADER_SIZE) {
      return null;
    }

    try {
      const firstByte = buffer.readUInt8(0);
      const version = (firstByte >> 6) & 0x03;

      // RFC 3550 requires RTP version 2
      if (version !== 2) {
        return null;
      }

      const padding = ((firstByte >> 5) & 0x01) === 1;
      const extension = ((firstByte >> 4) & 0x01) === 1;
      const csrcCount = firstByte & 0x0f;

      const secondByte = buffer.readUInt8(1);
      const marker = ((secondByte >> 7) & 0x01) === 1;
      const payloadType = secondByte & 0x7f;

      const sequenceNumber = buffer.readUInt16BE(2);
      const timestamp = buffer.readUInt32BE(4);
      const ssrc = buffer.readUInt32BE(8);

      let offset = this.MIN_HEADER_SIZE;

      // CSRC List
      const csrcList: number[] = [];
      if (csrcCount > 0) {
        const csrcEndOffset = offset + csrcCount * 4;
        if (buffer.length < csrcEndOffset) {
          return null;
        }
        for (let i = 0; i < csrcCount; i++) {
          csrcList.push(buffer.readUInt32BE(offset));
          offset += 4;
        }
      }

      // Extension Header
      let extensionHeader: RtpHeader['extensionHeader'] | undefined = undefined;
      if (extension) {
        if (buffer.length < offset + 4) {
          return null;
        }
        const profile = buffer.readUInt16BE(offset);
        const lengthInWords = buffer.readUInt16BE(offset + 2);
        const extLengthBytes = lengthInWords * 4;
        offset += 4;

        if (buffer.length < offset + extLengthBytes) {
          return null;
        }

        extensionHeader = {
          definedByProfile: profile,
          length: lengthInWords,
          data: buffer.subarray(offset, offset + extLengthBytes),
        };
        offset += extLengthBytes;
      }

      // Padding adjustment
      let payloadEnd = buffer.length;
      if (padding) {
        if (payloadEnd <= offset) {
          return null;
        }
        const paddingCount = buffer.readUInt8(buffer.length - 1);
        if (paddingCount === 0 || paddingCount > (buffer.length - offset)) {
          return null;
        }
        payloadEnd -= paddingCount;
      }

      if (payloadEnd < offset) {
        return null;
      }

      const payload = buffer.subarray(offset, payloadEnd);

      const header: RtpHeader = {
        version,
        padding,
        extension,
        csrcCount,
        marker,
        payloadType,
        sequenceNumber,
        timestamp,
        ssrc,
        csrcList,
        extensionHeader,
      };

      return {
        header,
        payload,
        rawLength: buffer.length,
        receivedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Helper to serialize an RTP packet for testing / loopback.
   */
  public static serialize(header: Partial<RtpHeader>, payload: Buffer): Buffer {
    const csrcCount = header.csrcList ? header.csrcList.length : 0;
    const headerSize = this.MIN_HEADER_SIZE + csrcCount * 4;
    const packet = Buffer.alloc(headerSize + payload.length);

    const version = header.version ?? 2;
    const padding = header.padding ? 1 : 0;
    const extension = header.extension ? 1 : 0;
    const firstByte = (version << 6) | (padding << 5) | (extension << 4) | (csrcCount & 0x0f);
    packet.writeUInt8(firstByte, 0);

    const marker = header.marker ? 1 : 0;
    const pt = (header.payloadType ?? 0) & 0x7f;
    const secondByte = (marker << 7) | pt;
    packet.writeUInt8(secondByte, 1);

    packet.writeUInt16BE(header.sequenceNumber ?? 0, 2);
    packet.writeUInt32BE(header.timestamp ?? 0, 4);
    packet.writeUInt32BE(header.ssrc ?? 0, 8);

    let offset = 12;
    if (header.csrcList) {
      for (const csrc of header.csrcList) {
        packet.writeUInt32BE(csrc, offset);
        offset += 4;
      }
    }

    payload.copy(packet, offset);
    return packet;
  }
}
