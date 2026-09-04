/**
 * ITU-T G.711 Telephony Audio Codec Decoders
 * Supports PCMU (μ-law, Payload Type 0) and PCMA (A-law, Payload Type 8).
 * Decodes 8-bit log-PCM to 16-bit signed Linear PCM (8000 Hz, mono).
 */

export class G711Codec {
  private static readonly ULAW_TABLE: Int16Array = G711Codec.buildUlawTable();
  private static readonly ALAW_TABLE: Int16Array = G711Codec.buildAlawTable();

  /**
   * Build μ-law to 16-bit Linear PCM lookup table (256 entries).
   */
  private static buildUlawTable(): Int16Array {
    const table = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      const ulaw = ~i & 0xff;
      const sign = (ulaw & 0x80) ? 1 : -1;
      const exponent = (ulaw >> 4) & 0x07;
      const mantissa = ulaw & 0x0f;
      let sample = ((mantissa << 3) + 0x84) << exponent;
      sample -= 0x84;
      table[i] = sign * sample;
    }
    return table;
  }

  /**
   * Build A-law to 16-bit Linear PCM lookup table (256 entries).
   */
  private static buildAlawTable(): Int16Array {
    const table = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      let alaw = i ^ 0x55;
      const sign = (alaw & 0x80) ? 1 : -1;
      const exponent = (alaw >> 4) & 0x07;
      const mantissa = alaw & 0x0f;
      let sample = 0;
      if (exponent === 0) {
        sample = (mantissa << 4) + 8;
      } else {
        sample = ((mantissa << 4) + 0x108) << (exponent - 1);
      }
      table[i] = sign * sample;
    }
    return table;
  }


  /**
   * Decodes a buffer of G.711 μ-law (PCMU) samples to 16-bit signed linear PCM buffer.
   * @param ulawBuffer 8-bit μ-law encoded audio buffer
   * @returns 16-bit linear PCM buffer (Little-Endian, 8 kHz mono)
   */
  public static decodeUlaw(ulawBuffer: Buffer | Uint8Array): Buffer {
    const pcmBuffer = Buffer.allocUnsafe(ulawBuffer.length * 2);
    for (let i = 0; i < ulawBuffer.length; i++) {
      const sample = this.ULAW_TABLE[ulawBuffer[i]];
      pcmBuffer.writeInt16LE(sample, i * 2);
    }
    return pcmBuffer;
  }

  /**
   * Decodes a buffer of G.711 A-law (PCMA) samples to 16-bit signed linear PCM buffer.
   * @param alawBuffer 8-bit A-law encoded audio buffer
   * @returns 16-bit linear PCM buffer (Little-Endian, 8 kHz mono)
   */
  public static decodeAlaw(alawBuffer: Buffer | Uint8Array): Buffer {
    const pcmBuffer = Buffer.allocUnsafe(alawBuffer.length * 2);
    for (let i = 0; i < alawBuffer.length; i++) {
      const sample = this.ALAW_TABLE[alawBuffer[i]];
      pcmBuffer.writeInt16LE(sample, i * 2);
    }
    return pcmBuffer;
  }

  /**
   * Universal decoder based on RTP Payload Type.
   * Returns decoded linear PCM at 8 kHz mono, or null if unsupported.
   */
  public static decodeRtpPayload(payloadType: number, payload: Buffer): { pcmBuffer: Buffer; sampleRate: number; codec: string } | null {
    if (payloadType === 0) {
      return {
        pcmBuffer: this.decodeUlaw(payload),
        sampleRate: 8000,
        codec: 'G711U',
      };
    } else if (payloadType === 8) {
      return {
        pcmBuffer: this.decodeAlaw(payload),
        sampleRate: 8000,
        codec: 'G711A',
      };
    } else if (payloadType === 10 || payloadType === 11) {
      // Linear 16-bit PCM pass-through
      return {
        pcmBuffer: payload,
        sampleRate: 44100,
        codec: 'L16',
      };
    }
    return null;
  }
}
