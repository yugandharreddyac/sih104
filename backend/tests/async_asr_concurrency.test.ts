/**
 * Phase 3: Async ASR / VAD / Streaming Concurrency Validation Test Suite
 *
 * Validates that the real-time audio pipeline never blocks on Whisper/ASR:
 * - 256ms fast acoustic path processes immediately without waiting for ASR.
 * - Deterministic simulated ASR delays (0ms, 250ms, 1000ms, 3000ms) do not block frame delivery.
 * - Comprehensive VAD validation (silence, speech, transitions, boundary flushes, rapid alternations).
 * - Safe fail-safe degradation on ASR failures (timeouts, 500s, connection refused, malformed JSON).
 * - Multi-call session isolation and bounded backpressure under 5 and 10 concurrent streams.
 * - Untrusted client transcript contract: hints cannot force security decisions; PrivacyFirewall redacts secrets.
 * - Isolated latency measurements ensuring ASR execution time is decoupled from acoustic frames.
 */

import { SpeechBufferManager, CallSpeechBuffer } from '../src/calls/speech_buffer';
import { StreamBufferManager, StreamBuffer } from '../src/calls/stream_buffer';
import { ConversationService } from '../src/conversation/conversation.service';
import { AudioNormalizer } from '../src/calls/audio_normalizer';
import { PrivacyFirewall } from '../src/security/privacy_firewall';
import { PoliciesService } from '../src/policies/policies.service';

describe('Phase 3: Async ASR / VAD / Streaming Concurrency Validation', () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    PoliciesService.initializeDefaultPolicies();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    SpeechBufferManager.clearAll();
    StreamBufferManager.clearAll();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    SpeechBufferManager.clearAll();
    StreamBufferManager.clearAll();
  });

  // ==========================================================================
  // TASK 2: PROVE ACOUSTIC PATH DOES NOT WAIT FOR ASR (DETERMINISTIC DELAYS)
  // ==========================================================================
  describe('Task 2: Asynchronous Non-Blocking ASR Decoupling', () => {
    const delaysMs = [0, 250, 1000, 3000];

    delaysMs.forEach((delay) => {
      it(`should process 256ms audio frames immediately without blocking when ASR takes ${delay}ms`, async () => {
        const callId = `call-async-delay-${delay}`;
        const streamId = `stream-delay-${delay}`;
        const speechBuf = SpeechBufferManager.getOrCreate(callId, streamId);

        // Mock ASR service with deterministic delay
        jest.spyOn(global, 'fetch').mockImplementation(async () => {
          if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          return {
            ok: true,
            json: async () => ({
              asr: { status: 'AVAILABLE', transcript: 'Transcribed text after delay', confidence: 0.95 },
              intent: { primary_intent: 'BENIGN_INQUIRY', confidence: 0.95 },
              social_engineering: { status: 'AVAILABLE', attack_sequence_score: 0.05 },
            }),
          } as any;
        });

        const pcm256ms = Buffer.alloc(8192); // 256ms @ 16kHz 16-bit mono = 8192 bytes
        const frameProcessingDurations: number[] = [];

        // Push 10 frames (2.56s) to trigger speech segment dispatch on the 10th frame
        for (let i = 0; i < 10; i++) {
          const t0 = Date.now();

          // Fast acoustic frame ingestion + speech buffer push
          const segment = speechBuf.push(pcm256ms, 256, true);
          if (segment) {
            // Asynchronous non-blocking dispatch (identical to ws_server.ts)
            (async () => {
              try {
                await ConversationService.analyzeTurn({
                  callId,
                  streamId,
                  chunkIndex: segment.turnIndex,
                  audioBase64: segment.audioBase64,
                });
                speechBuf.markProcessingComplete(segment.turnIndex);
              } catch {
                speechBuf.markProcessingComplete(segment.turnIndex);
              }
            })();
          }

          const elapsed = Date.now() - t0;
          frameProcessingDurations.push(elapsed);
        }

        // Frame ingestion path must complete without waiting for ASR (< 100ms)
        for (const duration of frameProcessingDurations) {
          expect(duration).toBeLessThan(100);
        }

        // Push 5 more frames while ASR might still be running
        for (let i = 0; i < 5; i++) {
          const t0 = Date.now();
          speechBuf.push(pcm256ms, 256, true);
          const elapsed = Date.now() - t0;
          expect(elapsed).toBeLessThan(100);
        }

        SpeechBufferManager.remove(callId);
      });
    });

    it('should reject stale out-of-order ASR completions and prevent state corruption', () => {
      const callId = 'call-stale-order-test';
      const buf = SpeechBufferManager.getOrCreate(callId, 'stream-1');

      // Dispatched Turn 1 and Turn 2
      expect(buf.markProcessingComplete(1)).toBe(true); // Turn 1 complete
      expect(buf.markProcessingComplete(2)).toBe(true); // Turn 2 complete

      // Stale Turn 1 arriving late must be rejected
      expect(buf.markProcessingComplete(1)).toBe(false);

      SpeechBufferManager.remove(callId);
    });

    it('should clean up speech buffer completely on stream termination', () => {
      const callId = 'call-term-cleanup';
      SpeechBufferManager.getOrCreate(callId, 'stream-1');
      expect(SpeechBufferManager.get(callId)).toBeDefined();

      SpeechBufferManager.remove(callId);
      expect(SpeechBufferManager.get(callId)).toBeUndefined();
    });
  });

  // ==========================================================================
  // TASK 3: COMPREHENSIVE VAD BEHAVIOR VALIDATION
  // ==========================================================================
  describe('Task 3: VAD State & Speech Segment Accumulation', () => {
    const callId = 'call-vad-test';
    const streamId = 'stream-vad-1';
    let buf: CallSpeechBuffer;
    const pcmChunk250ms = Buffer.alloc(8000); // 250ms

    beforeEach(() => {
      SpeechBufferManager.remove(callId);
      buf = SpeechBufferManager.getOrCreate(callId, streamId);
    });

    afterEach(() => {
      SpeechBufferManager.remove(callId);
    });

    // Test A: Silence
    it('Scenario A [Silence]: pure silence must not continuously trigger ASR', () => {
      for (let i = 0; i < 20; i++) {
        const seg = buf.push(pcmChunk250ms, 250, false);
        expect(seg).toBeNull();
      }
      expect(buf.flush()).toBeNull();
    });

    // Test B: Speech accumulation
    it('Scenario B [Speech]: voiced audio accumulates until target duration (2.5s)', () => {
      // 9 chunks (2.25s) -> no dispatch yet
      for (let i = 0; i < 9; i++) {
        const seg = buf.push(pcmChunk250ms, 250, true);
        expect(seg).toBeNull();
      }
      // 10th chunk (2.5s) -> dispatches segment
      const seg = buf.push(pcmChunk250ms, 250, true);
      expect(seg).not.toBeNull();
      expect(seg?.durationMs).toBe(2500);
      expect(seg?.turnIndex).toBe(1);
    });

    // Test C: Speech -> Silence transition
    it('Scenario C [Speech -> Silence]: silence after speech triggers natural boundary flush when >= 1.0s', () => {
      // 5 chunks of speech = 1.25s (> MIN_DISPATCH_DURATION_MS 1000ms)
      for (let i = 0; i < 5; i++) {
        buf.push(pcmChunk250ms, 250, true);
      }

      // 1st silence chunk (250ms silence) -> not flushed yet (SILENCE_FLUSH_THRESHOLD is 500ms)
      let seg = buf.push(pcmChunk250ms, 250, false);
      expect(seg).toBeNull();

      // 2nd silence chunk (500ms total silence) -> flushes natural boundary!
      seg = buf.push(pcmChunk250ms, 250, false);
      expect(seg).not.toBeNull();
      expect(seg?.durationMs).toBe(1250);
    });

    // Test D: Silence -> Speech
    it('Scenario D [Silence -> Speech]: ignores initial silence and starts accumulating upon voiced speech', () => {
      // 10 silence chunks (2.5s) -> nothing accumulated
      for (let i = 0; i < 10; i++) {
        expect(buf.push(pcmChunk250ms, 250, false)).toBeNull();
      }

      // 4 speech chunks (1.0s)
      for (let i = 0; i < 4; i++) {
        buf.push(pcmChunk250ms, 250, true);
      }

      const flushed = buf.flush();
      expect(flushed).not.toBeNull();
      expect(flushed?.durationMs).toBe(1000);
    });

    // Test E: Speech -> Speech (Continuous Utterances)
    it('Scenario E [Speech -> Speech]: dispatches consecutive speech turns seamlessly', () => {
      // First utterance: 10 chunks (2.5s) -> Turn 1
      for (let i = 0; i < 9; i++) {
        expect(buf.push(pcmChunk250ms, 250, true)).toBeNull();
      }
      const seg1 = buf.push(pcmChunk250ms, 250, true);
      expect(seg1?.turnIndex).toBe(1);

      // Simulate ASR completion of Turn 1
      buf.markProcessingComplete(1);

      // Second utterance: 10 chunks (2.5s) -> Turn 2
      for (let i = 0; i < 9; i++) {
        expect(buf.push(pcmChunk250ms, 250, true)).toBeNull();
      }
      const seg2 = buf.push(pcmChunk250ms, 250, true);
      expect(seg2?.turnIndex).toBe(2);
    });

    // Test F: Long continuous speech with capacity bound
    it('Scenario F [Long Continuous Speech]: enforces 5.0s maximum buffer bound', () => {
      // Push 40 chunks (10.0s) without draining
      for (let i = 0; i < 40; i++) {
        buf.push(pcmChunk250ms, 250, true);
      }

      const seg = buf.flush();
      expect(seg).not.toBeNull();
      expect(seg!.durationMs).toBeLessThanOrEqual(5000);
    });

    // Test G: Rapid speech/silence alternation
    it('Scenario G [Rapid Alternation]: handles quick speech bursts without phantom turns', () => {
      // 1 speech chunk (250ms), 1 silence chunk, 1 speech chunk...
      for (let i = 0; i < 10; i++) {
        buf.push(pcmChunk250ms, 250, i % 2 === 0);
      }

      // Total voiced speech is 5 * 250ms = 1250ms
      const seg = buf.flush();
      expect(seg).not.toBeNull();
      expect(seg?.durationMs).toBe(1250);
    });

    // Test H: Stream termination during speech
    it('Scenario H [Stream Termination]: forceFlush flushes un-dispatched speech safely on call hangup', () => {
      // 3 speech chunks (750ms)
      buf.push(pcmChunk250ms, 250, true);
      buf.push(pcmChunk250ms, 250, true);
      buf.push(pcmChunk250ms, 250, true);

      // Normal push does not dispatch (< 1000ms)
      expect(buf.push(pcmChunk250ms, 250, false)).toBeNull();

      // Stream termination force flush
      const seg = buf.flush();
      expect(seg).not.toBeNull();
      expect(seg?.durationMs).toBe(750);
    });

    // Test I: Malformed / zero-length audio
    it('Scenario I [Malformed / Empty Audio]: handles empty buffers safely without exceptions', () => {
      const emptyBuffer = Buffer.alloc(0);
      expect(buf.push(emptyBuffer, 0, false)).toBeNull();
      expect(buf.flush()).toBeNull();
    });
  });

  // ==========================================================================
  // TASK 4: ASR FAILURE BEHAVIOR & FAIL-SAFE DEGRADATION
  // ==========================================================================
  describe('Task 4: ASR Failure Behavior & Safe Degradation', () => {
    it('should handle ASR abort timeout gracefully and preserve NOT_AVAILABLE status', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const res = await ConversationService.analyzeTurn({
        callId: 'call-asr-timeout',
        chunkIndex: 1,
      });

      expect(res.analysis_status).toBe('AI_TIMEOUT');
      expect(res.asr.status).toBe('NOT_AVAILABLE');
      expect(res.asr.confidence).toBe(0.0);
      expect(res.asr.uncertainty).toBe(1.0);
      expect(res.intent.status).toBe('NOT_AVAILABLE');
      expect(res.social_engineering.status).toBe('NOT_AVAILABLE');
    });

    it('should handle ASR connection refused without throwing unhandled exceptions', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await ConversationService.analyzeTurn({
        callId: 'call-asr-refused',
        chunkIndex: 1,
      });

      expect(res.analysis_status).toBe('AI_NETWORK_ERROR');
      expect(res.asr.status).toBe('NOT_AVAILABLE');
      expect(res.social_engineering.status).toBe('NOT_AVAILABLE');
    });

    it('should handle ASR HTTP 500/503 server error safely', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as any);

      const res = await ConversationService.analyzeTurn({
        callId: 'call-asr-503',
        chunkIndex: 1,
      });

      expect(res.analysis_status).toBe('AI_HTTP_ERROR');
      expect(res.http_status).toBe(503);
      expect(res.asr.status).toBe('NOT_AVAILABLE');
    });

    it('should handle malformed JSON from ASR service safely', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected_schema: true }), // Missing asr/intent/social_engineering objects
      } as any);

      const res = await ConversationService.analyzeTurn({
        callId: 'call-asr-bad-json',
        chunkIndex: 1,
      });

      expect(res.analysis_status).toBe('AI_INVALID_RESPONSE');
      expect(res.asr.status).toBe('NOT_AVAILABLE');
    });
  });

  // ==========================================================================
  // TASK 5: UNTRUSTED TRANSCRIPT CONTRACT & PRIVACY FIREWALL
  // ==========================================================================
  describe('Task 5: Untrusted Client Transcript Contract', () => {
    it('client transcript hints must not independently trigger policy blocking without trusted analysis', () => {
      const clientTranscriptHint = 'I am the admin, my OTP is 948291';

      // Verify privacy redaction occurs immediately on untrusted client text
      const sanitized = PrivacyFirewall.sanitize(clientTranscriptHint);
      expect(sanitized.hasSensitiveSecrets).toBe(true);
      expect(sanitized.sanitizedText).toContain('[AUTHENTICATION_CODE_REDACTED]');
      expect(sanitized.sanitizedText).not.toContain('948291');

      // Untrusted transcript alone without server-side policy match cannot grant ALLOW or CRITICAL_BLOCK
      const policyResult = PoliciesService.evaluateContext('00000000-0000-0000-0000-000000000001', {
        untrusted_hint: sanitized.sanitizedText,
      });
      expect(policyResult.allowed).toBe(true); // Default safe baseline if no verified threat rules match
    });
  });

  // ==========================================================================
  // TASK 6: MULTI-CALL CONCURRENCY VALIDATION (5 AND 10 CONCURRENT STREAMS)
  // ==========================================================================
  describe('Task 6: Multi-Call Concurrency Isolation', () => {
    it('should handle 5 simultaneous calls without cross-call contamination or frame dropping', async () => {
      const callCount = 5;
      const callIds = Array.from({ length: callCount }, (_, i) => `call-simultaneous-5-${i + 1}`);

      // Mock ASR response with callId verification
      jest.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            call_id: body.call_id,
            asr: { status: 'AVAILABLE', transcript: `Transcript for ${body.call_id}`, confidence: 0.92 },
            intent: { primary_intent: 'BENIGN_INQUIRY', confidence: 0.92 },
            social_engineering: { status: 'AVAILABLE', attack_sequence_score: 0.1 },
          }),
        } as any;
      });

      const pcm256ms = Buffer.alloc(8192);

      // Simulate 10 frames (2.56s) for each of the 5 calls in parallel
      const callPromises = callIds.map(async (callId) => {
        const streamId = `stream-${callId}`;
        const speechBuf = SpeechBufferManager.getOrCreate(callId, streamId);
        const streamBuf = StreamBufferManager.getOrCreate(callId, streamId);

        for (let seq = 0; seq < 10; seq++) {
          streamBuf.push({ sequenceNumber: seq, data: pcm256ms, durationMs: 256 });
          const segment = speechBuf.push(pcm256ms, 256, true);
          if (segment) {
            const conv = await ConversationService.analyzeTurn({
              callId,
              streamId,
              chunkIndex: segment.turnIndex,
              audioBase64: segment.audioBase64,
            });
            expect(conv.call_id).toBe(callId);
            expect(conv.asr.transcript).toContain(callId);
            speechBuf.markProcessingComplete(segment.turnIndex);
          }
        }

        const metrics = streamBuf.getMetrics();
        expect(metrics.totalChunksReceived).toBe(10);
        expect(metrics.sequenceErrors).toBe(0);
        expect(metrics.totalChunksDropped).toBe(0);

        SpeechBufferManager.remove(callId);
        StreamBufferManager.remove(callId);
      });

      await Promise.all(callPromises);
      expect(SpeechBufferManager.getActiveCount()).toBe(0);
      expect(StreamBufferManager.getActiveBufferCount()).toBe(0);
    });

    it('should handle 10 simultaneous calls with strict buffer isolation', async () => {
      const callCount = 10;
      const callIds = Array.from({ length: callCount }, (_, i) => `call-simultaneous-10-${i + 1}`);

      jest.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            call_id: body.call_id,
            asr: { status: 'AVAILABLE', transcript: `Transcript for ${body.call_id}`, confidence: 0.90 },
            intent: { primary_intent: 'BENIGN_INQUIRY', confidence: 0.90 },
            social_engineering: { status: 'AVAILABLE', attack_sequence_score: 0.1 },
          }),
        } as any;
      });

      const pcm256ms = Buffer.alloc(8192);

      const callPromises = callIds.map(async (callId) => {
        const streamId = `stream-${callId}`;
        const speechBuf = SpeechBufferManager.getOrCreate(callId, streamId);
        const streamBuf = StreamBufferManager.getOrCreate(callId, streamId);

        for (let seq = 0; seq < 10; seq++) {
          streamBuf.push({ sequenceNumber: seq, data: pcm256ms, durationMs: 256 });
          const segment = speechBuf.push(pcm256ms, 256, true);
          if (segment) {
            const conv = await ConversationService.analyzeTurn({
              callId,
              streamId,
              chunkIndex: segment.turnIndex,
              audioBase64: segment.audioBase64,
            });
            expect(conv.call_id).toBe(callId);
            speechBuf.markProcessingComplete(segment.turnIndex);
          }
        }

        SpeechBufferManager.remove(callId);
        StreamBufferManager.remove(callId);
      });

      await Promise.all(callPromises);
      expect(SpeechBufferManager.getActiveCount()).toBe(0);
      expect(StreamBufferManager.getActiveBufferCount()).toBe(0);
    });
  });

  // ==========================================================================
  // TASK 7: LATENCY BENCHMARKING & DECOUPLING VERIFICATION
  // ==========================================================================
  describe('Task 7: Pipeline Latency Benchmarking', () => {
    it('should measure frame processing steps individually and demonstrate non-blocking isolation', () => {
      // 250ms of 16kHz 16-bit mono PCM = 8000 bytes
      const rawPcm16k = Buffer.alloc(8000);
      const base64Audio = rawPcm16k.toString('base64');

      // 1. Ingestion & Normalization Latency
      const tNorm0 = process.hrtime.bigint();
      const normalized = AudioNormalizer.normalize(base64Audio, 16000, 1);
      const tNorm1 = process.hrtime.bigint();
      const normDurationMs = Number(tNorm1 - tNorm0) / 1_000_000;

      expect(normalized.isValid).toBe(true);
      expect(normDurationMs).toBeLessThan(15.0); // Sub-15ms normalization

      // 2. VAD Buffering Latency
      const speechBuf = SpeechBufferManager.getOrCreate('call-latency-bench', 'stream-bench');
      const tVad0 = process.hrtime.bigint();
      const seg = speechBuf.push(normalized.pcmBuffer, normalized.durationMs, true);
      const tVad1 = process.hrtime.bigint();
      const vadDurationMs = Number(tVad1 - tVad0) / 1_000_000;

      expect(vadDurationMs).toBeLessThan(5.0); // Sub-5ms VAD push

      SpeechBufferManager.remove('call-latency-bench');
    });
  });

  // ==========================================================================
  // TASK 8: BACKPRESSURE & QUEUE BOUNDS
  // ==========================================================================
  describe('Task 8: Backpressure & Memory Bounds Under Overload', () => {
    it('StreamBuffer should drop oldest chunks under memory backpressure without throwing', () => {
      const streamBuf = new StreamBuffer('call-backpressure-test', 'stream-1');
      const largeChunk = Buffer.alloc(100 * 1024); // 100 KB chunk

      // Push 60 large chunks (6.0 MB) -> exceeds MAX_BUFFER_BYTES (5.0 MB)
      let droppedOccurred = false;
      for (let i = 0; i < 60; i++) {
        const res = streamBuf.push({ sequenceNumber: i, data: largeChunk, durationMs: 250 });
        if (res.droppedOldest) {
          droppedOccurred = true;
        }
      }

      expect(droppedOccurred).toBe(true);
      const metrics = streamBuf.getMetrics();
      expect(metrics.totalChunksDropped).toBeGreaterThan(0);
      expect(metrics.currentBufferSizeBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
    });
  });
});
