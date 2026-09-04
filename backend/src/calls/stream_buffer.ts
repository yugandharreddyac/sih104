/**
 * VOXSHIELD Bounded Audio Stream Buffer Manager
 * Enforces per-call memory bounds, tracks sequence gaps, and handles backpressure.
 */

import { audioErrorsTotal, streamBufferQueueDepth } from '../health/metrics.controller';

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
  protocol: string;
  mediaSource: string;
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

  constructor(
    public readonly callId: string,
    public readonly streamId: string,
    public readonly protocol: string = 'WEBRTC',
    public readonly mediaSource: string = 'WEBSOCKET'
  ) {}

  /**
   * Pushes a new normalized chunk into the bounded buffer.
   * Inserts in sorted sequence order to handle out-of-order packet arrival.
   * Drops oldest chunks if capacity limit exceeded (backpressure).
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

    // Check for malformed chunk data
    if (
      !chunk ||
      !Buffer.isBuffer(chunk.data) ||
      chunk.data.length === 0 ||
      typeof chunk.sequenceNumber !== 'number' ||
      !Number.isFinite(chunk.sequenceNumber)
    ) {
      audioErrorsTotal.inc({ type: 'malformed' });
      return { accepted: false, sequenceError: false, droppedOldest: false };
    }

    // Sequence continuity check (out-of-order arrival or gap)
    if (chunk.sequenceNumber !== this.expectedSequence) {
      this.sequenceErrors++;
      sequenceError = true;
      if (chunk.sequenceNumber < this.expectedSequence) {
        audioErrorsTotal.inc({ type: 'out_of_order' });
      } else {
        audioErrorsTotal.inc({ type: 'gap' });
      }
    }
    this.expectedSequence = Math.max(this.expectedSequence, chunk.sequenceNumber + 1);

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
        streamBufferQueueDepth.dec({ protocol: this.protocol });
      }
    }

    const timestampMs =
      typeof chunk.timestampMs === 'number' && Number.isFinite(chunk.timestampMs) && chunk.timestampMs > 0
        ? Math.round(chunk.timestampMs)
        : Date.now();

    const buffered: BufferedChunk = {
      sequenceNumber: chunk.sequenceNumber,
      data: chunk.data,
      timestampMs,
      durationMs: chunk.durationMs || 0,
      sizeBytes: chunkSize,
      receivedAt: new Date(),
    };

    // Sorted insertion by sequenceNumber to handle out-of-order arrival
    let insertIdx = 0;
    while (insertIdx < this.queue.length && this.queue[insertIdx].sequenceNumber < buffered.sequenceNumber) {
      insertIdx++;
    }

    // Ignore duplicate sequence numbers
    if (insertIdx < this.queue.length && this.queue[insertIdx].sequenceNumber === buffered.sequenceNumber) {
      audioErrorsTotal.inc({ type: 'duplicate' });
      return { accepted: true, sequenceError, droppedOldest };
    }

    this.queue.splice(insertIdx, 0, buffered);
    this.currentBytes += chunkSize;
    streamBufferQueueDepth.inc({ protocol: this.protocol });

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
      streamBufferQueueDepth.dec({ protocol: this.protocol });
    }
    return chunk;
  }

  public getQueue(): readonly BufferedChunk[] {
    return this.queue;
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
      protocol: this.protocol,
      mediaSource: this.mediaSource,
    };
  }

  public clear(): void {
    if (this.queue.length > 0) {
      streamBufferQueueDepth.dec({ protocol: this.protocol }, this.queue.length);
    }
    this.queue = [];
    this.currentBytes = 0;
  }
}

export class StreamBufferManager {
  private static buffers: Map<string, StreamBuffer> = new Map();

  public static getOrCreate(
    callId: string,
    streamId?: string,
    protocol: string = 'WEBRTC',
    mediaSource: string = 'WEBSOCKET'
  ): StreamBuffer {
    if (!this.buffers.has(callId)) {
      this.buffers.set(
        callId,
        new StreamBuffer(callId, streamId || `stream-${Date.now()}`, protocol, mediaSource)
      );
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
