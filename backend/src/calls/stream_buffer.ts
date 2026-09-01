/**
 * VOXSHIELD Bounded Audio Stream Buffer Manager
 * Enforces per-call memory bounds, tracks sequence gaps, and handles backpressure.
 */

export interface BufferedChunk {
  sequenceNumber: number;
  data: Buffer;
  timestampMs: number;
  durationMs: number;
  sizeBytes: number;
  receivedAt: Date;
}

export interface StreamBufferMetrics {
  callId: string;
  totalChunksReceived: number;
  totalChunksDropped: number;
  sequenceErrors: number;
  currentBufferSizeBytes: number;
  currentBufferChunkCount: number;
  maxBufferSizeBytes: number;
  maxBufferChunkCount: number;
  bufferUtilizationRatio: number;
}

export class StreamBuffer {
  private static readonly MAX_BUFFER_CHUNKS = 100;
  private static readonly MAX_BUFFER_BYTES = 5 * 1024 * 1024; // 5 MB per call session

  private queue: BufferedChunk[] = [];
  private currentBytes = 0;
  private expectedSequence = 0;
  private totalReceived = 0;
  private totalDropped = 0;
  private sequenceErrors = 0;

  constructor(public readonly callId: string, public readonly streamId: string) {}

  /**
   * Pushes a new normalized chunk into the bounded buffer.
   * Drops oldest chunks or rejects if buffer limit exceeded (backpressure).
   */
  public push(chunk: {
    sequenceNumber: number;
    data: Buffer;
    timestampMs?: number;
    durationMs?: number;
  }): { accepted: boolean; sequenceError: boolean; droppedOldest: boolean } {
    this.totalReceived++;
    let sequenceError = false;
    let droppedOldest = false;

    // Sequence continuity check
    if (chunk.sequenceNumber !== this.expectedSequence) {
      this.sequenceErrors++;
      sequenceError = true;
    }
    this.expectedSequence = chunk.sequenceNumber + 1;

    const chunkSize = chunk.data.length;

    // Check capacity bounds
    while (
      (this.queue.length >= StreamBuffer.MAX_BUFFER_CHUNKS ||
        this.currentBytes + chunkSize > StreamBuffer.MAX_BUFFER_BYTES) &&
      this.queue.length > 0
    ) {
      const dropped = this.queue.shift();
      if (dropped) {
        this.currentBytes -= dropped.sizeBytes;
        this.totalDropped++;
        droppedOldest = true;
      }
    }

    // Push new chunk
    const buffered: BufferedChunk = {
      sequenceNumber: chunk.sequenceNumber,
      data: chunk.data,
      timestampMs: chunk.timestampMs || Date.now(),
      durationMs: chunk.durationMs || 0,
      sizeBytes: chunkSize,
      receivedAt: new Date(),
    };

    this.queue.push(buffered);
    this.currentBytes += chunkSize;

    return {
      accepted: true,
      sequenceError,
      droppedOldest,
    };
  }

  public pop(): BufferedChunk | undefined {
    const chunk = this.queue.shift();
    if (chunk) {
      this.currentBytes -= chunk.sizeBytes;
    }
    return chunk;
  }

  public getMetrics(): StreamBufferMetrics {
    const utilization = this.currentBytes / StreamBuffer.MAX_BUFFER_BYTES;
    return {
      callId: this.callId,
      totalChunksReceived: this.totalReceived,
      totalChunksDropped: this.totalDropped,
      sequenceErrors: this.sequenceErrors,
      currentBufferSizeBytes: this.currentBytes,
      currentBufferChunkCount: this.queue.length,
      maxBufferSizeBytes: StreamBuffer.MAX_BUFFER_BYTES,
      maxBufferChunkCount: StreamBuffer.MAX_BUFFER_CHUNKS,
      bufferUtilizationRatio: Math.round(utilization * 1000) / 1000,
    };
  }

  public clear(): void {
    this.queue = [];
    this.currentBytes = 0;
  }
}

export class StreamBufferManager {
  private static buffers: Map<string, StreamBuffer> = new Map();

  public static getOrCreate(callId: string, streamId?: string): StreamBuffer {
    if (!this.buffers.has(callId)) {
      this.buffers.set(callId, new StreamBuffer(callId, streamId || `stream-${Date.now()}`));
    }
    return this.buffers.get(callId)!;
  }

  public static get(callId: string): StreamBuffer | undefined {
    return this.buffers.get(callId);
  }

  public static remove(callId: string): void {
    const buffer = this.buffers.get(callId);
    if (buffer) {
      buffer.clear();
      this.buffers.delete(callId);
    }
  }

  public static getActiveBufferCount(): number {
    return this.buffers.size;
  }
}
