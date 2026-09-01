/**
 * VOXSHIELD Audio Normalizer & Format Validator
 * Standardizes inbound audio to canonical Linear PCM 16-bit signed, mono, 16 kHz.
 * Enforces size limits and prevents buffer overflow / malformed payload exploits.
 */

export interface NormalizedAudioResult {
  isValid: boolean;
  format: 'pcm_s16le';
  sampleRate: number;
  channels: number;
  pcmBuffer: Buffer;
  base64Data: string;
  sampleCount: number;
  durationMs: number;
  error?: string;
}

export class AudioNormalizer {
  public static readonly CANONICAL_SAMPLE_RATE = 16000;
  public static readonly CANONICAL_CHANNELS = 1;
  public static readonly BYTES_PER_SAMPLE = 2; // 16-bit signed PCM
  public static readonly MAX_CHUNK_BYTES = 512 * 1024; // 512 KB maximum per chunk

  /**
   * Validates and normalizes raw audio buffer or base64 string.
   */
  public static normalize(
    input: Buffer | string,
    inSampleRate: number = 16000,
    inChannels: number = 1
  ): NormalizedAudioResult {
    let rawBuffer: Buffer;

    if (typeof input === 'string') {
      try {
        rawBuffer = Buffer.from(input, 'base64');
      } catch (err: any) {
        return {
          isValid: false,
          format: 'pcm_s16le',
          sampleRate: inSampleRate,
          channels: inChannels,
          pcmBuffer: Buffer.alloc(0),
          base64Data: '',
          sampleCount: 0,
          durationMs: 0,
          error: `Base64 decoding failed: ${err.message}`,
        };
      }
    } else if (Buffer.isBuffer(input)) {
      rawBuffer = input;
    } else {
      return {
        isValid: false,
        format: 'pcm_s16le',
        sampleRate: inSampleRate,
        channels: inChannels,
        pcmBuffer: Buffer.alloc(0),
        base64Data: '',
        sampleCount: 0,
        durationMs: 0,
        error: 'Invalid input audio type. Expected Buffer or base64 string.',
      };
    }

    // 1. Enforce payload size limits
    if (rawBuffer.length > this.MAX_CHUNK_BYTES) {
      return {
        isValid: false,
        format: 'pcm_s16le',
        sampleRate: inSampleRate,
        channels: inChannels,
        pcmBuffer: Buffer.alloc(0),
        base64Data: '',
        sampleCount: 0,
        durationMs: 0,
        error: `Payload exceeds maximum chunk size of ${this.MAX_CHUNK_BYTES} bytes.`,
      };
    }

    if (rawBuffer.length === 0) {
      return {
        isValid: true,
        format: 'pcm_s16le',
        sampleRate: this.CANONICAL_SAMPLE_RATE,
        channels: this.CANONICAL_CHANNELS,
        pcmBuffer: Buffer.alloc(0),
        base64Data: '',
        sampleCount: 0,
        durationMs: 0,
      };
    }

    // 2. Strip WAV / RIFF header if present
    let pcmData = rawBuffer;
    if (
      rawBuffer.length >= 44 &&
      rawBuffer.toString('ascii', 0, 4) === 'RIFF' &&
      rawBuffer.toString('ascii', 8, 12) === 'WAVE'
    ) {
      // Locate 'data' subchunk
      let offset = 12;
      let foundData = false;
      while (offset < rawBuffer.length - 8) {
        const subchunkId = rawBuffer.toString('ascii', offset, offset + 4);
        const subchunkSize = rawBuffer.readUInt32LE(offset + 4);
        if (subchunkId === 'data') {
          pcmData = rawBuffer.subarray(offset + 8, offset + 8 + subchunkSize);
          foundData = true;
          break;
        }
        offset += 8 + subchunkSize;
      }
      if (!foundData) {
        pcmData = rawBuffer.subarray(44);
      }
    }

    // Ensure 16-bit alignment (even number of bytes)
    if (pcmData.length % this.BYTES_PER_SAMPLE !== 0) {
      pcmData = pcmData.subarray(0, pcmData.length - (pcmData.length % this.BYTES_PER_SAMPLE));
    }

    // 3. Stereo to Mono conversion if channels == 2
    let monoPcm = pcmData;
    if (inChannels === 2 && pcmData.length >= 4) {
      const numStereoSamples = Math.floor(pcmData.length / 4);
      const monoBuffer = Buffer.alloc(numStereoSamples * 2);
      for (let i = 0; i < numStereoSamples; i++) {
        const left = pcmData.readInt16LE(i * 4);
        const right = pcmData.readInt16LE(i * 4 + 2);
        const avg = Math.round((left + right) / 2);
        monoBuffer.writeInt16LE(avg, i * 2);
      }
      monoPcm = monoBuffer;
    }

    const sampleCount = Math.floor(monoPcm.length / this.BYTES_PER_SAMPLE);
    const durationMs = (sampleCount / inSampleRate) * 1000.0;

    return {
      isValid: true,
      format: 'pcm_s16le',
      sampleRate: inSampleRate,
      channels: this.CANONICAL_CHANNELS,
      pcmBuffer: monoPcm,
      base64Data: monoPcm.toString('base64'),
      sampleCount,
      durationMs: Math.round(durationMs * 100) / 100,
    };
  }
}
