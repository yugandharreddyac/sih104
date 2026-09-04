/**
 * VOXSHIELD Audio Normalizer & Format Validator
 * Standardizes inbound audio to canonical Linear PCM 16-bit signed, mono, 16 kHz.
 * Enforces size limits, deterministic linear resampling, stereo downmixing,
 * WAV RIFF/fmt header parsing, and base64 sanitization.
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
  public static readonly MIN_SAMPLE_RATE = 8000;
  public static readonly MAX_SAMPLE_RATE = 48000;
  public static readonly BYTES_PER_SAMPLE = 2; // 16-bit signed PCM (2 bytes per sample)
  public static readonly MAX_CHUNK_BYTES = 512 * 1024; // 512 KB maximum per chunk

  private static readonly UNSUPPORTED_CODEC_TOKENS = new Set([
    'alaw',
    'mulaw',
    'ulaw',
    'g711',
    'g711a',
    'g711u',
    'pcma',
    'pcmu',
    'amr',
    'amrnb',
    'amr-nb',
    'amrwb',
    'amr-wb',
    'gsm',
    'g729',
    'g722',
    'opus',
    'mp3',
    'mpeg',
    'aac',
    'ogg',
    'flac',
    'vorbis',
    'speex',
  ]);

  /**
   * Identifies whether the specified codec/format indicates an unsupported compressed format.
   */
  public static isUnsupportedCompressedCodec(codecOrFormat?: string): boolean {
    if (!codecOrFormat || typeof codecOrFormat !== 'string') {
      return false;
    }
    const clean = codecOrFormat.trim().toLowerCase();
    if (!clean) {
      return false;
    }

    // Explicitly allowed PCM / WAV formats
    if (
      clean === 'pcm_s16le' ||
      clean === 'pcm' ||
      clean === 'raw' ||
      clean === 'linear_pcm' ||
      clean === 'wav' ||
      clean === 'audio/wav' ||
      clean === 'audio/x-wav'
    ) {
      return false;
    }

    // Normalize MIME types (e.g. "audio/opus" -> "opus", "audio/mpeg" -> "mpeg")
    let token = clean;
    if (token.startsWith('audio/')) {
      token = token.substring(6);
    }
    if (token.startsWith('x-')) {
      token = token.substring(2);
    }

    if (AudioNormalizer.UNSUPPORTED_CODEC_TOKENS.has(token)) {
      return true;
    }

    const sanitized = token.replace(/[\.\-_]/g, '');
    const sanitizedUnsupported = [
      'alaw',
      'mulaw',
      'ulaw',
      'g711',
      'g711a',
      'g711u',
      'pcma',
      'pcmu',
      'amr',
      'amrnb',
      'amrwb',
      'gsm',
      'g729',
      'g722',
      'opus',
      'mp3',
      'mpeg',
      'aac',
      'ogg',
      'flac',
      'vorbis',
      'speex',
    ];

    return sanitizedUnsupported.some((u) => sanitized === u || sanitized.includes(u));
  }

  /**
   * Deterministic Linear Interpolation Resampler
   * Converts signed 16-bit LE mono PCM from fromRate to toRate (default 16000 Hz).
   * Pure TypeScript implementation with zero external audio dependencies.
   */
  public static resample(
    pcmBuffer: Buffer,
    fromRate: number,
    toRate: number = AudioNormalizer.CANONICAL_SAMPLE_RATE
  ): Buffer {
    if (pcmBuffer.length < this.BYTES_PER_SAMPLE) {
      return Buffer.alloc(0);
    }

    // Identity check: no resampling needed if rates match
    if (fromRate === toRate) {
      return pcmBuffer;
    }

    const numInputSamples = Math.floor(pcmBuffer.length / this.BYTES_PER_SAMPLE);
    if (numInputSamples <= 0) {
      return Buffer.alloc(0);
    }

    const numOutputSamples = Math.floor((numInputSamples * toRate) / fromRate);
    if (numOutputSamples <= 0) {
      return Buffer.alloc(0);
    }

    const outputBuffer = Buffer.alloc(numOutputSamples * this.BYTES_PER_SAMPLE);
    const ratio = fromRate / toRate;

    for (let i = 0; i < numOutputSamples; i++) {
      const srcPos = i * ratio;
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;

      const s1 = pcmBuffer.readInt16LE(srcIdx * this.BYTES_PER_SAMPLE);
      const s2 =
        srcIdx + 1 < numInputSamples
          ? pcmBuffer.readInt16LE((srcIdx + 1) * this.BYTES_PER_SAMPLE)
          : s1;

      const interpolated = (1.0 - frac) * s1 + frac * s2;
      const clamped = Math.max(-32768, Math.min(32767, Math.round(interpolated)));
      outputBuffer.writeInt16LE(clamped, i * this.BYTES_PER_SAMPLE);
    }

    return outputBuffer;
  }

  /**
   * Validates, decodes, downmixes, and resamples audio to canonical 16 kHz mono PCM.
   */
  public static normalize(
    input: Buffer | string,
    inSampleRate: number = AudioNormalizer.CANONICAL_SAMPLE_RATE,
    inChannels: number = AudioNormalizer.CANONICAL_CHANNELS,
    codecOrFormat?: string
  ): NormalizedAudioResult {
    // 0. Codec / format safety check
    if (this.isUnsupportedCompressedCodec(codecOrFormat)) {
      return {
        isValid: false,
        format: 'pcm_s16le',
        sampleRate: inSampleRate,
        channels: inChannels,
        pcmBuffer: Buffer.alloc(0),
        base64Data: '',
        sampleCount: 0,
        durationMs: 0,
        error: `UNSUPPORTED_CODEC_REQUIRES_PCM: ${codecOrFormat}`,
      };
    }

    // 1. Validate sample rate bounds and finiteness
    if (
      typeof inSampleRate !== 'number' ||
      !Number.isFinite(inSampleRate) ||
      !Number.isInteger(inSampleRate) ||
      inSampleRate < this.MIN_SAMPLE_RATE ||
      inSampleRate > this.MAX_SAMPLE_RATE
    ) {
      return {
        isValid: false,
        format: 'pcm_s16le',
        sampleRate: inSampleRate,
        channels: inChannels,
        pcmBuffer: Buffer.alloc(0),
        base64Data: '',
        sampleCount: 0,
        durationMs: 0,
        error: `Invalid sample rate (${inSampleRate}). Must be an integer between ${this.MIN_SAMPLE_RATE} and ${this.MAX_SAMPLE_RATE} Hz.`,
      };
    }

    // 2. Validate channel count
    if (
      typeof inChannels !== 'number' ||
      !Number.isFinite(inChannels) ||
      !Number.isInteger(inChannels) ||
      (inChannels !== 1 && inChannels !== 2)
    ) {
      return {
        isValid: false,
        format: 'pcm_s16le',
        sampleRate: inSampleRate,
        channels: inChannels,
        pcmBuffer: Buffer.alloc(0),
        base64Data: '',
        sampleCount: 0,
        durationMs: 0,
        error: `Invalid channel count (${inChannels}). Channels must be 1 (mono) or 2 (stereo).`,
      };
    }
    let rawBuffer: Buffer;

    if (typeof input === 'string') {
      try {
        // Strip optional Data URI prefix and remove whitespace / newlines
        let cleaned = input.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, '').trim();
        cleaned = cleaned.replace(/\s+/g, '');

        if (cleaned.length > 0 && !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
          return {
            isValid: false,
            format: 'pcm_s16le',
            sampleRate: this.CANONICAL_SAMPLE_RATE,
            channels: this.CANONICAL_CHANNELS,
            pcmBuffer: Buffer.alloc(0),
            base64Data: '',
            sampleCount: 0,
            durationMs: 0,
            error: 'Malformed base64 audio payload. Contains invalid characters.',
          };
        }

        rawBuffer = Buffer.from(cleaned, 'base64');
      } catch (err: any) {
        return {
          isValid: false,
          format: 'pcm_s16le',
          sampleRate: this.CANONICAL_SAMPLE_RATE,
          channels: this.CANONICAL_CHANNELS,
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
        sampleRate: this.CANONICAL_SAMPLE_RATE,
        channels: this.CANONICAL_CHANNELS,
        pcmBuffer: Buffer.alloc(0),
        base64Data: '',
        sampleCount: 0,
        durationMs: 0,
        error: 'Invalid input audio type. Expected Buffer or base64 string.',
      };
    }

    // 4. Enforce payload size limits
    if (rawBuffer.length > this.MAX_CHUNK_BYTES) {
      return {
        isValid: false,
        format: 'pcm_s16le',
        sampleRate: this.CANONICAL_SAMPLE_RATE,
        channels: this.CANONICAL_CHANNELS,
        pcmBuffer: Buffer.alloc(0),
        base64Data: '',
        sampleCount: 0,
        durationMs: 0,
        error: `Payload exceeds maximum chunk size of ${this.MAX_CHUNK_BYTES} bytes.`,
      };
    }

    // 5. Safe handling for empty input
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

    let actualSampleRate = inSampleRate;
    let actualChannels = inChannels;
    let pcmData = rawBuffer;

    // 6. Robust RIFF / WAVE Header Parsing
    if (
      rawBuffer.length >= 12 &&
      rawBuffer.toString('ascii', 0, 4) === 'RIFF' &&
      rawBuffer.toString('ascii', 8, 12) === 'WAVE'
    ) {
      let offset = 12;
      let foundFmt = false;
      let foundData = false;

      while (offset + 8 <= rawBuffer.length) {
        const subchunkId = rawBuffer.toString('ascii', offset, offset + 4);
        const subchunkSize = rawBuffer.readUInt32LE(offset + 4);
        const chunkDataOffset = offset + 8;

        if (subchunkId === 'fmt ') {
          if (chunkDataOffset + 16 > rawBuffer.length) {
            return {
              isValid: false,
              format: 'pcm_s16le',
              sampleRate: this.CANONICAL_SAMPLE_RATE,
              channels: this.CANONICAL_CHANNELS,
              pcmBuffer: Buffer.alloc(0),
              base64Data: '',
              sampleCount: 0,
              durationMs: 0,
              error: 'Malformed WAV header: truncated fmt subchunk.',
            };
          }

          const audioFormat = rawBuffer.readUInt16LE(chunkDataOffset);
          const wavChannels = rawBuffer.readUInt16LE(chunkDataOffset + 2);
          const wavSampleRate = rawBuffer.readUInt32LE(chunkDataOffset + 4);
          const wavBitsPerSample = rawBuffer.readUInt16LE(chunkDataOffset + 14);

          // Format code 1 = Linear PCM
          if (audioFormat !== 1) {
            return {
              isValid: false,
              format: 'pcm_s16le',
              sampleRate: this.CANONICAL_SAMPLE_RATE,
              channels: this.CANONICAL_CHANNELS,
              pcmBuffer: Buffer.alloc(0),
              base64Data: '',
              sampleCount: 0,
              durationMs: 0,
              error: `Unsupported WAV audio format code (${audioFormat}). Only uncompressed PCM format is supported.`,
            };
          }

          if (wavBitsPerSample !== 16) {
            return {
              isValid: false,
              format: 'pcm_s16le',
              sampleRate: this.CANONICAL_SAMPLE_RATE,
              channels: this.CANONICAL_CHANNELS,
              pcmBuffer: Buffer.alloc(0),
              base64Data: '',
              sampleCount: 0,
              durationMs: 0,
              error: `Unsupported WAV bit depth (${wavBitsPerSample}-bit). Only 16-bit PCM is supported.`,
            };
          }

          if (wavChannels !== 1 && wavChannels !== 2) {
            return {
              isValid: false,
              format: 'pcm_s16le',
              sampleRate: this.CANONICAL_SAMPLE_RATE,
              channels: this.CANONICAL_CHANNELS,
              pcmBuffer: Buffer.alloc(0),
              base64Data: '',
              sampleCount: 0,
              durationMs: 0,
              error: `Unsupported WAV channel count (${wavChannels}). Only mono (1) or stereo (2) WAV is supported.`,
            };
          }

          if (wavSampleRate < this.MIN_SAMPLE_RATE || wavSampleRate > this.MAX_SAMPLE_RATE) {
            return {
              isValid: false,
              format: 'pcm_s16le',
              sampleRate: this.CANONICAL_SAMPLE_RATE,
              channels: this.CANONICAL_CHANNELS,
              pcmBuffer: Buffer.alloc(0),
              base64Data: '',
              sampleCount: 0,
              durationMs: 0,
              error: `Unsupported WAV sample rate (${wavSampleRate} Hz). Must be between ${this.MIN_SAMPLE_RATE} and ${this.MAX_SAMPLE_RATE} Hz.`,
            };
          }

          actualChannels = wavChannels;
          actualSampleRate = wavSampleRate;
          foundFmt = true;
        } else if (subchunkId === 'data') {
          const dataLength = Math.min(rawBuffer.length - chunkDataOffset, subchunkSize);
          pcmData = rawBuffer.subarray(chunkDataOffset, chunkDataOffset + dataLength);
          foundData = true;
        }

        // Advance to next chunk (including padding byte for odd chunk sizes)
        const paddedSize = subchunkSize + (subchunkSize % 2);
        offset += 8 + paddedSize;
      }

      if (!foundData) {
        // Fallback: If no explicit 'data' chunk found, slice after standard 44-byte header
        if (rawBuffer.length >= 44) {
          pcmData = rawBuffer.subarray(44);
        } else {
          return {
            isValid: false,
            format: 'pcm_s16le',
            sampleRate: this.CANONICAL_SAMPLE_RATE,
            channels: this.CANONICAL_CHANNELS,
            pcmBuffer: Buffer.alloc(0),
            base64Data: '',
            sampleCount: 0,
            durationMs: 0,
            error: 'Malformed WAV file: data subchunk not found.',
          };
        }
      }
    }

    // 7. Channel-specific frame alignment and stereo downmix
    let monoPcm: Buffer;

    if (actualChannels === 2) {
      // For 16-bit stereo, 1 frame = 4 bytes (2 bytes L + 2 bytes R)
      if (pcmData.length % 4 !== 0) {
        pcmData = pcmData.subarray(0, pcmData.length - (pcmData.length % 4));
      }

      const numStereoSamples = Math.floor(pcmData.length / 4);
      const monoBuffer = Buffer.alloc(numStereoSamples * this.BYTES_PER_SAMPLE);

      for (let i = 0; i < numStereoSamples; i++) {
        const left = pcmData.readInt16LE(i * 4);
        const right = pcmData.readInt16LE(i * 4 + 2);
        const avg = Math.round((left + right) / 2);
        const clamped = Math.max(-32768, Math.min(32767, avg));
        monoBuffer.writeInt16LE(clamped, i * this.BYTES_PER_SAMPLE);
      }
      monoPcm = monoBuffer;
    } else {
      // For 16-bit mono, 1 frame = 2 bytes
      if (pcmData.length % this.BYTES_PER_SAMPLE !== 0) {
        pcmData = pcmData.subarray(0, pcmData.length - (pcmData.length % this.BYTES_PER_SAMPLE));
      }
      monoPcm = pcmData;
    }

    // 8. Resample mono audio to canonical 16,000 Hz
    const canonicalPcm = this.resample(monoPcm, actualSampleRate, this.CANONICAL_SAMPLE_RATE);
    const sampleCount = Math.floor(canonicalPcm.length / this.BYTES_PER_SAMPLE);
    const durationMs = (sampleCount / this.CANONICAL_SAMPLE_RATE) * 1000.0;

    return {
      isValid: true,
      format: 'pcm_s16le',
      sampleRate: this.CANONICAL_SAMPLE_RATE,
      channels: this.CANONICAL_CHANNELS,
      pcmBuffer: canonicalPcm,
      base64Data: canonicalPcm.toString('base64'),
      sampleCount,
      durationMs: Math.round(durationMs * 100) / 100,
    };
  }
}
