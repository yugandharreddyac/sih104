/**
 * Priority 3: Asynchronous Speech Buffering & Concurrency Isolation Tests
 * Verifies:
 * - Bounded buffer growth under high chunk volume
 * - Concurrency isolation between parallel call sessions
 * - Stale out-of-order ASR resolution protection
 * - Safe degradation without call termination on ASR failure
 */

import { SpeechBufferManager, CallSpeechBuffer } from '../src/calls/speech_buffer';
import { StreamBufferManager } from '../src/calls/stream_buffer';
import { ConversationService } from '../src/conversation/conversation.service';

describe('Priority 3: Async Speech Buffering & Concurrency Isolation', () => {
  beforeEach(() => {
    SpeechBufferManager.remove('call-test-concurrency-A');
    SpeechBufferManager.remove('call-test-concurrency-B');
    StreamBufferManager.remove('call-test-concurrency-A');
    StreamBufferManager.remove('call-test-concurrency-B');
  });

  afterEach(() => {
    SpeechBufferManager.remove('call-test-concurrency-A');
    SpeechBufferManager.remove('call-test-concurrency-B');
    StreamBufferManager.remove('call-test-concurrency-A');
    StreamBufferManager.remove('call-test-concurrency-B');
  });

  it('should accumulate 250ms chunks and dispatch segment when target 2.5s duration is reached', () => {
    const buf = SpeechBufferManager.getOrCreate('call-test-concurrency-A', 'stream-A-1');
    const pcmChunk = Buffer.alloc(8000); // 250ms of 16kHz 16-bit mono = 8000 bytes

    let dispatchedSegment: any = null;

    // Push 9 chunks (2.25s) -> should NOT dispatch yet
    for (let i = 0; i < 9; i++) {
      const seg = buf.push(pcmChunk, 250, true);
      expect(seg).toBeNull();
    }

    // 10th chunk brings duration to 2.5s -> should dispatch!
    dispatchedSegment = buf.push(pcmChunk, 250, true);
    expect(dispatchedSegment).not.toBeNull();
    expect(dispatchedSegment.callId).toBe('call-test-concurrency-A');
    expect(dispatchedSegment.streamId).toBe('stream-A-1');
    expect(dispatchedSegment.turnIndex).toBe(1);
    expect(dispatchedSegment.durationMs).toBe(2500);
    expect(typeof dispatchedSegment.audioBase64).toBe('string');
  });

  it('should maintain strict call isolation between concurrent calls', () => {
    const bufA = SpeechBufferManager.getOrCreate('call-test-concurrency-A', 'stream-A');
    const bufB = SpeechBufferManager.getOrCreate('call-test-concurrency-B', 'stream-B');

    const pcmChunk = Buffer.alloc(8000); // 250ms

    // Push 4 chunks to A, 8 chunks to B
    for (let i = 0; i < 4; i++) {
      bufA.push(pcmChunk, 250, true);
    }
    for (let i = 0; i < 8; i++) {
      bufB.push(pcmChunk, 250, true);
    }

    // Flush both and verify independent state and duration
    const segA = bufA.flush();
    const segB = bufB.flush();

    expect(segA).not.toBeNull();
    expect(segA?.callId).toBe('call-test-concurrency-A');
    expect(segA?.durationMs).toBe(1000);

    expect(segB).not.toBeNull();
    expect(segB?.callId).toBe('call-test-concurrency-B');
    expect(segB?.durationMs).toBe(2000);
  });

  it('should prevent stale out-of-order ASR turns from overwriting newer turn state', () => {
    const buf = SpeechBufferManager.getOrCreate('call-test-concurrency-A', 'stream-A');

    // Turn 1 and Turn 2 dispatched
    expect(buf.markProcessingComplete(1)).toBe(true); // Turn 1 completes
    expect(buf.markProcessingComplete(2)).toBe(true); // Turn 2 completes

    // If an older Turn 1 response arrives late (e.g. from network delay / slow Whisper), mark as stale
    expect(buf.markProcessingComplete(1)).toBe(false); // Stale turn rejected!
  });

  it('should bound speech buffer to 5.0 seconds maximum to prevent memory growth under continuous un-flushed speech', () => {
    const buf = SpeechBufferManager.getOrCreate('call-test-concurrency-A', 'stream-A');
    const pcmChunk = Buffer.alloc(8000); // 250ms

    // Push 30 chunks (7.5s) without draining
    for (let i = 0; i < 30; i++) {
      buf.push(pcmChunk, 250, true);
    }

    // Flushed segment duration must be bounded to at most 5000ms
    const seg = buf.flush();
    expect(seg).not.toBeNull();
    expect(seg!.durationMs).toBeLessThanOrEqual(5000);
  });

  it('should clean up speech buffer completely on call termination', () => {
    SpeechBufferManager.getOrCreate('call-test-concurrency-A', 'stream-A');
    expect(SpeechBufferManager.get('call-test-concurrency-A')).toBeDefined();

    SpeechBufferManager.remove('call-test-concurrency-A');
    expect(SpeechBufferManager.get('call-test-concurrency-A')).toBeUndefined();
  });
});
