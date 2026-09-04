/// <reference path="../node_modules/@types/jest/index.d.ts" />
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

describe('Priority 5: Acoustic Sequence Guard & Deduplication Unit Tests', () => {
  it('Scenario A: should accept normal consecutive packets (0 -> 1 -> 2)', () => {
    const buffer = new StreamBuffer('call-p5-a', 'stream-p5-a');

    const res0 = buffer.push({ sequenceNumber: 0, data: Buffer.alloc(100) });
    expect(res0.accepted).toBe(true);
    expect(res0.sequenceError).toBe(false);
    expect(res0.isDuplicate).toBe(false);
    expect(res0.isStale).toBe(false);

    const res1 = buffer.push({ sequenceNumber: 1, data: Buffer.alloc(100) });
    expect(res1.accepted).toBe(true);
    expect(res1.sequenceError).toBe(false);
    expect(res1.isDuplicate).toBe(false);
    expect(res1.isStale).toBe(false);

    const res2 = buffer.push({ sequenceNumber: 2, data: Buffer.alloc(100) });
    expect(res2.accepted).toBe(true);
    expect(res2.sequenceError).toBe(false);
    expect(res2.isDuplicate).toBe(false);
    expect(res2.isStale).toBe(false);

    expect(buffer.getLastCommittedSeq()).toBe(2);
    expect(buffer.getMetrics().duplicatesIgnored).toBe(0);
    expect(buffer.getMetrics().staleChunksIgnored).toBe(0);
  });

  it('Scenario B: should accept single forward gap (0 -> 2) and flag sequenceError for gap handling', () => {
    const buffer = new StreamBuffer('call-p5-b', 'stream-p5-b');

    buffer.push({ sequenceNumber: 0, data: Buffer.alloc(100) });

    // Forward gap: chunk 1 dropped, chunk 2 arrives
    const res2 = buffer.push({ sequenceNumber: 2, data: Buffer.alloc(100) });
    expect(res2.accepted).toBe(true);
    expect(res2.sequenceError).toBe(true); // Must remain true so sequenceGap propagates
    expect(res2.isDuplicate).toBe(false);
    expect(res2.isStale).toBe(false);
    expect(buffer.getLastCommittedSeq()).toBe(2);
  });

  it('Scenario C: should reject duplicate packets (0 -> 1 -> 1 -> 2)', () => {
    const buffer = new StreamBuffer('call-p5-c', 'stream-p5-c');

    buffer.push({ sequenceNumber: 0, data: Buffer.alloc(100) });
    const res1 = buffer.push({ sequenceNumber: 1, data: Buffer.alloc(100) });
    expect(res1.accepted).toBe(true);

    // Duplicate packet 1 arrives
    const res1Dup = buffer.push({ sequenceNumber: 1, data: Buffer.alloc(100) });
    expect(res1Dup.accepted).toBe(false);
    expect(res1Dup.isDuplicate).toBe(true);
    expect(res1Dup.isStale).toBe(false);

    // Subsequent chunk 2 proceeds normally
    const res2 = buffer.push({ sequenceNumber: 2, data: Buffer.alloc(100) });
    expect(res2.accepted).toBe(true);
    expect(res2.isDuplicate).toBe(false);
    expect(buffer.getMetrics().duplicatesIgnored).toBe(1);
  });

  it('Scenario D: should reject out-of-order stale packets (0 -> 2 -> 1 -> 3)', () => {
    const buffer = new StreamBuffer('call-p5-d', 'stream-p5-d');

    buffer.push({ sequenceNumber: 0, data: Buffer.alloc(100) });
    // Chunk 2 arrives first (forward gap)
    const res2 = buffer.push({ sequenceNumber: 2, data: Buffer.alloc(100) });
    expect(res2.accepted).toBe(true);
    expect(res2.sequenceError).toBe(true);

    // Out-of-order chunk 1 arrives late after 2 has already committed
    const res1 = buffer.push({ sequenceNumber: 1, data: Buffer.alloc(100) });
    expect(res1.accepted).toBe(false);
    expect(res1.isStale).toBe(true);
    expect(res1.isDuplicate).toBe(false);

    // Next forward chunk 3 proceeds normally
    const res3 = buffer.push({ sequenceNumber: 3, data: Buffer.alloc(100) });
    expect(res3.accepted).toBe(true);
    expect(res3.isStale).toBe(false);
    expect(buffer.getMetrics().staleChunksIgnored).toBe(1);
  });

  it('Scenario E: should reject delayed stale packet (0 -> 1 -> 2 -> 4 -> 3)', () => {
    const buffer = new StreamBuffer('call-p5-e', 'stream-p5-e');

    buffer.push({ sequenceNumber: 0, data: Buffer.alloc(100) });
    buffer.push({ sequenceNumber: 1, data: Buffer.alloc(100) });
    buffer.push({ sequenceNumber: 2, data: Buffer.alloc(100) });
    buffer.push({ sequenceNumber: 4, data: Buffer.alloc(100) }); // committed up to 4

    // Delayed chunk 3 arrives late
    const res3 = buffer.push({ sequenceNumber: 3, data: Buffer.alloc(100) });
    expect(res3.accepted).toBe(false);
    expect(res3.isStale).toBe(true);
    expect(buffer.getLastCommittedSeq()).toBe(4);
    expect(buffer.getMetrics().staleChunksIgnored).toBe(1);
  });

  it('Scenario F: should isolate sequence state across different call sessions', () => {
    const callAId = 'call-p5-iso-a';
    const callBId = 'call-p5-iso-b';

    const bufferA = StreamBufferManager.getOrCreate(callAId);
    const bufferB = StreamBufferManager.getOrCreate(callBId);

    // Call A processes sequence 0, 1, 2
    bufferA.push({ sequenceNumber: 0, data: Buffer.alloc(100) });
    bufferA.push({ sequenceNumber: 1, data: Buffer.alloc(100) });
    bufferA.push({ sequenceNumber: 2, data: Buffer.alloc(100) });

    // Call B can process sequence 0, 1 independently without being flagged duplicate/stale
    const resB0 = bufferB.push({ sequenceNumber: 0, data: Buffer.alloc(100) });
    const resB1 = bufferB.push({ sequenceNumber: 1, data: Buffer.alloc(100) });

    expect(resB0.accepted).toBe(true);
    expect(resB0.isDuplicate).toBe(false);
    expect(resB1.accepted).toBe(true);
    expect(resB1.isDuplicate).toBe(false);

    expect(bufferA.getLastCommittedSeq()).toBe(2);
    expect(bufferB.getLastCommittedSeq()).toBe(1);

    // Cleanup
    StreamBufferManager.remove(callAId);
    StreamBufferManager.remove(callBId);
  });
});

describe('Priority 5: Live Codec Safety Guard Unit Tests', () => {
  const dummyPcm = Buffer.alloc(3200);

  // A. Reject explicit compressed telephony codecs
  it('should reject explicit compressed telephony codecs with UNSUPPORTED_CODEC_REQUIRES_PCM', () => {
    const telephonyCodecs = ['g711', 'pcmu', 'pcma', 'amr', 'gsm', 'g729'];
    for (const codec of telephonyCodecs) {
      const res = AudioNormalizer.normalize(dummyPcm, 16000, 1, codec);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('UNSUPPORTED_CODEC_REQUIRES_PCM');
    }
  });

  // B. Reject explicit compressed wideband codecs
  it('should reject explicit compressed wideband codecs with UNSUPPORTED_CODEC_REQUIRES_PCM', () => {
    const widebandCodecs = ['opus', 'mp3', 'aac'];
    for (const codec of widebandCodecs) {
      const res = AudioNormalizer.normalize(dummyPcm, 16000, 1, codec);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('UNSUPPORTED_CODEC_REQUIRES_PCM');
    }
  });

  // C. Accept canonical PCM formats
  it('should accept canonical PCM formats', () => {
    const pcmFormats = ['pcm_s16le', 'wav'];
    for (const fmt of pcmFormats) {
      const res = AudioNormalizer.normalize(dummyPcm, 16000, 1, fmt);
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    }
  });

  // D. Accept TELEPHONY channel type when format is linear PCM
  it('should accept TELEPHONY channel type when format is linear PCM', () => {
    // Valid PCM input with format = 'pcm_s16le'
    const res = AudioNormalizer.normalize(dummyPcm, 16000, 1, 'pcm_s16le');
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('pcm_s16le');
  });

  // E. Accept absent codec/format metadata
  it('should accept absent codec/format metadata using existing three-argument form', () => {
    const res = AudioNormalizer.normalize(dummyPcm, 16000, 1);
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('pcm_s16le');
    expect(res.sampleCount).toBe(1600);
  });
});

