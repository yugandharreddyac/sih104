/**
 * VOXSHIELD Asynchronous Speech Buffer Manager (Priority 3)
 * Accumulates speech frames into bounded 2-3 second buffers per call.
 * Dispatches asynchronous ASR without blocking fast 256ms acoustic telemetry frames.
 * Enforces per-call memory bounding, sequence tracking, and stale result protection.
 */

export interface SpeechSegment {
  callId: string;
  streamId: string;
  turnIndex: number;
  audioBase64: string;
  durationMs: number;
  timestampMs: number;
}

export class CallSpeechBuffer {
  private static readonly TARGET_BUFFER_DURATION_MS = 2500; // 2.5s optimal for Whisper
  private static readonly MAX_BUFFER_DURATION_MS = 5000;    // 5.0s hard maximum bound
  private static readonly MIN_DISPATCH_DURATION_MS = 1000;   // 1.0s minimum speech chunk

  private accumulatedBuffers: Buffer[] = [];
  private accumulatedDurationMs = 0;
  private currentTurnIndex = 0;
  private lastProcessedTurnIndex = -1;
  private isProcessing = false;

  constructor(public readonly callId: string, public readonly streamId: string) {}

  /**
   * Appends PCM buffer to the speech accumulator.
   * Returns a ready-to-process SpeechSegment if buffer threshold reached or forced.
   */
  public push(
    pcmBuffer: Buffer,
    durationMs: number,
    isSpeech: boolean,
    forceFlush = false
  ): SpeechSegment | null {
    // Only accumulate voiced speech frames or if force flushed
    if (isSpeech || this.accumulatedDurationMs > 0) {
      this.accumulatedBuffers.push(pcmBuffer);
      this.accumulatedDurationMs += durationMs;
    }

    // Check if buffer capacity exceeded (drop oldest to prevent unbounded memory growth)
    while (this.accumulatedDurationMs > CallSpeechBuffer.MAX_BUFFER_DURATION_MS && this.accumulatedBuffers.length > 1) {
      const dropped = this.accumulatedBuffers.shift();
      if (dropped) {
        // 16kHz 16-bit mono = 32 bytes per millisecond
        const droppedMs = Math.round(dropped.length / 32);
        this.accumulatedDurationMs -= droppedMs;
      }
    }

    const shouldDispatch =
      this.accumulatedDurationMs >= CallSpeechBuffer.TARGET_BUFFER_DURATION_MS ||
      (forceFlush && this.accumulatedDurationMs >= CallSpeechBuffer.MIN_DISPATCH_DURATION_MS);

    if (shouldDispatch && !this.isProcessing) {
      return this.flush();
    }

    return null;
  }

  public flush(): SpeechSegment | null {
    if (this.accumulatedBuffers.length === 0 || this.accumulatedDurationMs < 200) {
      return null;
    }

    const merged = Buffer.concat(this.accumulatedBuffers);
    const durationMs = this.accumulatedDurationMs;
    const turnIndex = ++this.currentTurnIndex;

    this.accumulatedBuffers = [];
    this.accumulatedDurationMs = 0;
    this.isProcessing = true;

    return {
      callId: this.callId,
      streamId: this.streamId,
      turnIndex,
      audioBase64: merged.toString('base64'),
      durationMs,
      timestampMs: Date.now(),
    };
  }

  public markProcessingComplete(turnIndex: number): boolean {
    this.isProcessing = false;
    if (turnIndex > this.lastProcessedTurnIndex) {
      this.lastProcessedTurnIndex = turnIndex;
      return true; // Valid latest turn
    }
    return false; // Stale / out-of-order turn
  }

  public clear(): void {
    this.accumulatedBuffers = [];
    this.accumulatedDurationMs = 0;
    this.isProcessing = false;
  }
}

export class SpeechBufferManager {
  private static buffers: Map<string, CallSpeechBuffer> = new Map();

  public static getOrCreate(callId: string, streamId?: string): CallSpeechBuffer {
    if (!this.buffers.has(callId)) {
      this.buffers.set(callId, new CallSpeechBuffer(callId, streamId || `stream-${Date.now()}`));
    }
    return this.buffers.get(callId)!;
  }

  public static get(callId: string): CallSpeechBuffer | undefined {
    return this.buffers.get(callId);
  }

  public static remove(callId: string): void {
    const buf = this.buffers.get(callId);
    if (buf) {
      buf.clear();
      this.buffers.delete(callId);
    }
  }

  public static getActiveCount(): number {
    return this.buffers.size;
  }
}
