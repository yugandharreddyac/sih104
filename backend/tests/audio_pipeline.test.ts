import { AudioNormalizer } from '../src/calls/audio_normalizer';
import { StreamBuffer, StreamBufferManager } from '../src/calls/stream_buffer';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

describe('Phase 2: Audio Normalization & Pipeline Unit Tests', () => {
  it('should normalize 16-bit linear PCM buffer correctly', () => {
    // 16000 samples = 1 second of 16kHz mono audio = 32000 bytes
    const dummyPcm = Buffer.alloc(32000);
    for (let i = 0; i < 16000; i++) {
      dummyPcm.writeInt16LE(Math.round(Math.sin(i / 10) * 10000), i * 2);
    }

    const result = AudioNormalizer.normalize(dummyPcm, 16000, 1);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe('pcm_s16le');
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    expect(result.sampleCount).toBe(16000);
    expect(result.durationMs).toBe(1000);
    expect(result.base64Data.length).toBeGreaterThan(0);
  });

  it('should reject oversized audio payloads exceeding max chunk limit', () => {
    // 600 KB exceeds 512 KB limit
    const oversized = Buffer.alloc(600 * 1024);
    const result = AudioNormalizer.normalize(oversized, 16000, 1);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('exceeds maximum chunk size');
  });

  it('should downmix 2-channel stereo PCM into 1-channel mono', () => {
    // 100 stereo samples = 400 bytes
    const stereoBuffer = Buffer.alloc(400);
    for (let i = 0; i < 100; i++) {
      stereoBuffer.writeInt16LE(2000, i * 4); // Left
      stereoBuffer.writeInt16LE(4000, i * 4 + 2); // Right
    }

    const result = AudioNormalizer.normalize(stereoBuffer, 16000, 2);
    expect(result.isValid).toBe(true);
    expect(result.channels).toBe(1);
    expect(result.sampleCount).toBe(100);

    // Verify averaging: (2000 + 4000) / 2 = 3000
    const firstSample = result.pcmBuffer.readInt16LE(0);
    expect(firstSample).toBe(3000);
  });

  it('should strip WAV header when given a RIFF/WAVE file buffer', () => {
    // Create 44-byte dummy WAV header + 100 bytes PCM
    const wavBuffer = Buffer.alloc(144);
    wavBuffer.write('RIFF', 0, 'ascii');
    wavBuffer.writeUInt32LE(136, 4);
    wavBuffer.write('WAVE', 8, 'ascii');
    wavBuffer.write('fmt ', 12, 'ascii');
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20); // PCM format
    wavBuffer.writeUInt16LE(1, 22); // 1 channel
    wavBuffer.writeUInt32LE(16000, 24); // 16kHz
    wavBuffer.writeUInt32LE(32000, 28); // byte rate
    wavBuffer.writeUInt16LE(2, 32); // block align
    wavBuffer.writeUInt16LE(16, 34); // bits per sample
    wavBuffer.write('data', 36, 'ascii');
    wavBuffer.writeUInt32LE(100, 40); // 100 bytes data

    const result = AudioNormalizer.normalize(wavBuffer, 16000, 1);
    expect(result.isValid).toBe(true);
    expect(result.pcmBuffer.length).toBe(100);
    expect(result.sampleCount).toBe(50);
  });
});

describe('Phase 2: Stream Buffer & Memory Bounds Unit Tests', () => {
  it('should buffer chunks and track sequence numbers accurately', () => {
    const buffer = new StreamBuffer('call-buff-001', 'stream-001');

    const res0 = buffer.push({ sequenceNumber: 0, data: Buffer.alloc(1000) });
    expect(res0.accepted).toBe(true);
    expect(res0.sequenceError).toBe(false);

    const res1 = buffer.push({ sequenceNumber: 1, data: Buffer.alloc(1000) });
    expect(res1.accepted).toBe(true);
    expect(res1.sequenceError).toBe(false);

    // Sequence jump (gap)
    const res3 = buffer.push({ sequenceNumber: 3, data: Buffer.alloc(1000) });
    expect(res3.accepted).toBe(true);
    expect(res3.sequenceError).toBe(true);

    const metrics = buffer.getMetrics();
    expect(metrics.totalChunksReceived).toBe(3);
    expect(metrics.sequenceErrors).toBe(1);
    expect(metrics.currentBufferChunkCount).toBe(3);
  });

  it('should enforce buffer bounds and drop oldest chunks under backpressure', () => {
    const buffer = new StreamBuffer('call-backpressure-002', 'stream-002');
    const chunkSize = 100 * 1024; // 100 KB

    // Push 120 chunks to exceed max 100 chunk limit
    for (let i = 0; i < 120; i++) {
      buffer.push({ sequenceNumber: i, data: Buffer.alloc(chunkSize) });
    }

    const metrics = buffer.getMetrics();
    expect(metrics.currentBufferChunkCount).toBeLessThanOrEqual(100);
    expect(metrics.totalChunksDropped).toBeGreaterThanOrEqual(20);
  });

  it('should clean up session buffers on termination', () => {
    const callId = 'call-cleanup-test-003';
    StreamBufferManager.getOrCreate(callId);
    expect(StreamBufferManager.get(callId)).toBeDefined();

    StreamBufferManager.remove(callId);
    expect(StreamBufferManager.get(callId)).toBeUndefined();
  });
});
