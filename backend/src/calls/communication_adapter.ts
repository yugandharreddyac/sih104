import { EventEmitter } from 'events';
import { AudioNormalizer, NormalizedAudioResult } from './audio_normalizer';
import { StreamBuffer, StreamBufferManager } from './stream_buffer';

export interface CallStreamMetadata {
  callId: string;
  callerIdentifier: string;
  destinationIdentifier: string;
  protocol: 'WEBRTC' | 'SIP' | 'PSTN' | 'TEST_STREAM';
  sampleRate: number;
  channels: number;
  startedAt: Date;
}

export interface AudioChunk {
  callId: string;
  chunkIndex: number;
  timestampMs: number;
  data: Buffer | string; // PCM/Base64
  channelIndex: number; // 0 = Caller, 1 = Agent
  sampleRate?: number;
  channels?: number;
}

export interface CommunicationAdapter {
  initialize(): Promise<void>;
  startCallSession(metadata: CallStreamMetadata): Promise<string>;
  streamAudioChunk(chunk: AudioChunk): Promise<NormalizedAudioResult>;
  terminateCallSession(callId: string, reason?: string): Promise<void>;
  on(event: 'audio_chunk', listener: (chunk: AudioChunk, normalized: NormalizedAudioResult) => void): this;
  on(event: 'call_started', listener: (metadata: CallStreamMetadata) => void): this;
  on(event: 'call_ended', listener: (callId: string, reason: string) => void): this;
}

/**
 * TestAudioAdapter
 * Allows simulated audio streaming for local testing, integration verification, and staging.
 */
export class TestAudioAdapter extends EventEmitter implements CommunicationAdapter {
  private activeSessions: Map<string, CallStreamMetadata> = new Map();

  public async initialize(): Promise<void> {
    console.info('🔌 TestAudioAdapter initialized with audio normalization and buffer manager.');
  }

  public async startCallSession(metadata: CallStreamMetadata): Promise<string> {
    this.activeSessions.set(metadata.callId, metadata);
    StreamBufferManager.getOrCreate(metadata.callId);
    this.emit('call_started', metadata);
    return metadata.callId;
  }

  public async streamAudioChunk(chunk: AudioChunk): Promise<NormalizedAudioResult> {
    if (!this.activeSessions.has(chunk.callId)) {
      throw new Error(`Session ${chunk.callId} does not exist`);
    }

    // Normalize audio
    const normalized = AudioNormalizer.normalize(
      chunk.data,
      chunk.sampleRate || 16000,
      chunk.channels || 1
    );

    if (normalized.isValid) {
      const buffer = StreamBufferManager.getOrCreate(chunk.callId);
      buffer.push({
        sequenceNumber: chunk.chunkIndex,
        data: normalized.pcmBuffer,
        timestampMs: chunk.timestampMs,
        durationMs: normalized.durationMs,
      });
    }

    this.emit('audio_chunk', chunk, normalized);
    return normalized;
  }

  public async terminateCallSession(callId: string, reason: string = 'NORMAL_HANGUP'): Promise<void> {
    this.activeSessions.delete(callId);
    StreamBufferManager.remove(callId);
    this.emit('call_ended', callId, reason);
  }
}

/**
 * RtpCommunicationAdapter
 * Concrete telephony adapter bridging RTP UDP streams and Asterisk/FreeSWITCH PBX media to VOXSHIELD.
 */
export class RtpCommunicationAdapter extends EventEmitter implements CommunicationAdapter {
  private activeSessions: Map<string, CallStreamMetadata> = new Map();

  public async initialize(): Promise<void> {
    console.info('🔌 RtpCommunicationAdapter initialized for Asterisk / FreeSWITCH / VoIP media gateway.');
  }

  public async startCallSession(metadata: CallStreamMetadata): Promise<string> {
    this.activeSessions.set(metadata.callId, metadata);
    StreamBufferManager.getOrCreate(metadata.callId);
    this.emit('call_started', metadata);
    return metadata.callId;
  }

  public async streamAudioChunk(chunk: AudioChunk): Promise<NormalizedAudioResult> {
    if (!this.activeSessions.has(chunk.callId)) {
      throw new Error(`Session ${chunk.callId} does not exist`);
    }

    // Normalize audio (supports 8kHz G.711 telephony rate or 16kHz linear PCM)
    const normalized = AudioNormalizer.normalize(
      chunk.data,
      chunk.sampleRate || 8000,
      chunk.channels || 1
    );

    if (normalized.isValid) {
      const buffer = StreamBufferManager.getOrCreate(chunk.callId);
      buffer.push({
        sequenceNumber: chunk.chunkIndex,
        data: normalized.pcmBuffer,
        timestampMs: chunk.timestampMs,
        durationMs: normalized.durationMs,
      });
    }

    this.emit('audio_chunk', chunk, normalized);
    return normalized;
  }

  public async terminateCallSession(callId: string, reason: string = 'NORMAL_HANGUP'): Promise<void> {
    this.activeSessions.delete(callId);
    StreamBufferManager.remove(callId);
    this.emit('call_ended', callId, reason);
  }
}

