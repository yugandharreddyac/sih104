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
  duplicatesIgnored: number;
  staleChunksIgnored: number;
  lastCommittedAcousticSeq: number;
  currentBufferSizeBytes: number;
  currentBufferChunkCount: number;
  maxBufferSizeBytes: number;
  maxBufferChunkCount: number;
  bufferUtilizationRatio: number;
  protocol?: string;
  mediaSource?: string;
}

export class StreamBuffer {
  private static readonly MAX_BUFFER_CHUNKS = 100;
  private static readonly MAX_BUFFER_BYTES = 5 * 1024 * 1024; // 5 MB per call session
  private static readonly MAX_SEEN_HISTORY = 1000;

  private queue: BufferedChunk[] = [];
  private currentBytes = 0;
  private expectedSequence = 0;
  private totalReceived = 0;
  private totalDropped = 0;
  private sequenceErrors = 0;
  private lastCommittedAcousticSeq = -1;
  private seenSequences: Set<number> = new Set();
  private duplicatesIgnored = 0;
  private staleChunksIgnored = 0;

  constructor(
    public readonly callId: string,
    public readonly streamId: string,
    public readonly protocol: string = 'WEBRTC',
    public readonly mediaSource: string = 'WEBSOCKET'
  ) {}

  /**
   * Pushes a new normalized chunk into the bounded buffer.
   * Rejects duplicate sequence numbers and stale out-of-order sequence numbers.
   * Drops oldest chunks if buffer capacity limit exceeded (backpressure).
   */
  public push(chunk: {
    sequenceNumber: number;
    data: Buffer;
    timestampMs?: number;
    durationMs?: number;
  }): {
    accepted: boolean;
    sequenceError: boolean;
    droppedOldest: boolean;
    isDuplicate: boolean;
    isStale: boolean;
  } {
    this.totalReceived++;

    // Check for malformed chunk data
    if (
      !chunk ||
      !Buffer.isBuffer(chunk.data) ||
      chunk.data.length === 0 ||
      typeof chunk.sequenceNumber !== 'number' ||
      !Number.isFinite(chunk.sequenceNumber)
    ) {
      audioErrorsTotal.inc({ type: 'malformed' });
      return {
        accepted: false,
        sequenceError: false,
        droppedOldest: false,
        isDuplicate: false,
        isStale: false,
      };
    }

    // 1. Duplicate check: sequence number has already been seen and committed
    if (this.seenSequences.has(chunk.sequenceNumber)) {
      this.duplicatesIgnored++;
      audioErrorsTotal.inc({ type: 'duplicate' });
      return {
        accepted: false,
        sequenceError: false,
        droppedOldest: false,
        isDuplicate: true,
        isStale: false,
      };
    }

    // 2. Stale / out-of-order check: arrived after a newer sequence was already committed
    if (this.lastCommittedAcousticSeq >= 0 && chunk.sequenceNumber < this.lastCommittedAcousticSeq) {
      this.staleChunksIgnored++;
      audioErrorsTotal.inc({ type: 'out_of_order' });
      return {
        accepted: false,
        sequenceError: true,
        droppedOldest: false,
        isDuplicate: false,
        isStale: true,
      };
    }

    // 3. Normal / Forward Gap Processing
    let sequenceError = false;
    let droppedOldest = false;

    // Sequence continuity check (forward gap detection)
    if (chunk.sequenceNumber !== this.expectedSequence) {
      this.sequenceErrors++;
      sequenceError = true;
      audioErrorsTotal.inc({ type: 'gap' });
    }
    this.expectedSequence = chunk.sequenceNumber + 1;
    this.lastCommittedAcousticSeq = chunk.sequenceNumber;

    // Track seen sequence with bounded memory
    this.seenSequences.add(chunk.sequenceNumber);
    if (this.seenSequences.size > StreamBuffer.MAX_SEEN_HISTORY) {
      const iter = this.seenSequences.values();
      const first = iter.next().value;
      if (typeof first === 'number') {
        this.seenSequences.delete(first);
      }
    }

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

    // Push new chunk
    const buffered: BufferedChunk = {
      sequenceNumber: chunk.sequenceNumber,
      data: chunk.data,
      timestampMs,
      durationMs: chunk.durationMs || 0,
      sizeBytes: chunkSize,
      receivedAt: new Date(),
    };

    this.queue.push(buffered);
    this.currentBytes += chunkSize;
    streamBufferQueueDepth.inc({ protocol: this.protocol });

    return {
      accepted: true,
      sequenceError,
      droppedOldest,
      isDuplicate: false,
      isStale: false,
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

  public getLastCommittedSeq(): number {
    return this.lastCommittedAcousticSeq;
  }

  public isSequenceSeen(seq: number): boolean {
    return this.seenSequences.has(seq);
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
      duplicatesIgnored: this.duplicatesIgnored,
      staleChunksIgnored: this.staleChunksIgnored,
      lastCommittedAcousticSeq: this.lastCommittedAcousticSeq,
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
    this.expectedSequence = 0;
    this.lastCommittedAcousticSeq = -1;
    this.seenSequences.clear();
    this.duplicatesIgnored = 0;
    this.staleChunksIgnored = 0;
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

  public static clearAll(): void {
    for (const buf of this.buffers.values()) {
      buf.clear();
    }
    this.buffers.clear();
  }
}
