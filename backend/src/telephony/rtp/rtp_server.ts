/**
 * VOXSHIELD RTP UDP Server & Telephony Media Gateway Listener
 * Binds UDP socket, parses RTP datagrams, maps calls, decodes G.711,
 * and feeds normalized audio directly into the real-time AI and Risk Fusion pipeline.
 */

import dgram from 'dgram';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { RtpParser } from './rtp_parser';
import { RtpSession } from './rtp_session';
import { TelephonySessionMetadata } from './types';
import { CallsService } from '../../calls/calls.service';
import { AcousticService } from '../../acoustic/acoustic.service';
import { ConversationService } from '../../conversation/conversation.service';
import { RiskService } from '../../risk/risk.service';
import { SpeechBufferManager } from '../../calls/speech_buffer';
import { StreamBufferManager } from '../../calls/stream_buffer';
import { WebSocketGateway } from '../../websocket/ws_server';
import { AuditService } from '../../security/audit.service';
import { PrivacyFirewall } from '../../security/privacy_firewall';

export interface RtpServerConfig {
  host?: string;
  port?: number;
  sessionTimeoutMs?: number;
  organizationId?: string;
}

export class RtpServer extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private isListening = false;
  private sessionsBySsrc: Map<number, RtpSession> = new Map();
  private sessionsByEndpoint: Map<string, RtpSession> = new Map();
  private sessionCleanupInterval: NodeJS.Timeout | null = null;

  public readonly config: Required<RtpServerConfig>;

  constructor(config: RtpServerConfig = {}) {
    super();
    this.config = {
      host: config.host || process.env.RTP_UDP_HOST || '0.0.0.0',
      port: config.port || parseInt(process.env.RTP_UDP_PORT || '10000', 10),
      sessionTimeoutMs: config.sessionTimeoutMs || 5000,
      organizationId: config.organizationId || '00000000-0000-0000-0000-000000000001',
    };
  }

  /**
   * Starts the RTP UDP listening socket.
   */
  public async start(): Promise<void> {
    if (this.isListening) return;

    return new Promise((resolve, reject) => {
      try {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.socket = socket;

        socket.on('error', (err) => {
          logger.error('RTP Server UDP Socket Error', err);
          this.emit('error', err);
        });

        socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
          this.handleIncomingDatagram(msg, rinfo);
        });

        socket.on('listening', () => {
          const addr = socket.address();
          this.isListening = true;
          logger.info(`RTP Server Ingestion Gateway listening on UDP ${addr.address}:${addr.port}`);
          this.startSessionCleaner();
          resolve();
        });

        socket.bind(this.config.port, this.config.host);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stops the RTP server gracefully.
   */
  public async stop(): Promise<void> {
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
      this.sessionCleanupInterval = null;
    }

    // Terminate active sessions
    for (const session of this.sessionsBySsrc.values()) {
      await this.terminateSession(session, 'SERVER_SHUTDOWN');
    }
    this.sessionsBySsrc.clear();
    this.sessionsByEndpoint.clear();

    if (this.socket) {
      await new Promise<void>((resolve) => {
        this.socket!.close(() => {
          this.socket = null;
          this.isListening = false;
          resolve();
        });
      });
    }
  }

  /**
   * Processes an incoming raw UDP datagram safely without crashing.
   */
  public handleIncomingDatagram(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const packet = RtpParser.parse(msg);
    if (!packet) {
      // Not a valid RTP packet (or too short / unsupported version)
      return;
    }

    const ssrc = packet.header.ssrc;
    const endpointKey = `${rinfo.address}:${rinfo.port}`;

    let session = this.sessionsBySsrc.get(ssrc);

    if (!session) {
      session = this.createSession(ssrc, rinfo, packet.header.payloadType);
      this.sessionsBySsrc.set(ssrc, session);
      this.sessionsByEndpoint.set(endpointKey, session);
    }

    // Process packet into normalized 16kHz audio frames
    const frames = session.processPacket(packet);

    // Dispatch each frame to the real-time AI & Risk pipeline
    for (const frame of frames) {
      this.dispatchAudioFrame(session, frame);
    }
  }

  private createSession(ssrc: number, rinfo: dgram.RemoteInfo, payloadType: number): RtpSession {
    const callId = `call-telephony-${Date.now()}-${ssrc.toString(16)}`;
    const sessionId = `rtp-sess-${ssrc}`;

    const codec = payloadType === 0 ? 'G711U' : payloadType === 8 ? 'G711A' : `PT_${payloadType}`;

    const metadata: TelephonySessionMetadata = {
      callId,
      sessionId,
      ssrc,
      remoteAddress: rinfo.address,
      remotePort: rinfo.port,
      callerIdentifier: `SIP-${rinfo.address}`,
      destinationIdentifier: `VOXSHIELD-PBX-EXT`,
      direction: 'INBOUND',
      organizationId: this.config.organizationId,
      codec,
      sampleRate: 8000,
      channels: 1,
      startedAt: new Date(),
      provider: 'ASTERISK_RTP',
    };

    // Register call session in CallsService
    CallsService.createCall({
      organizationId: this.config.organizationId,
      callerIdentifier: metadata.callerIdentifier!,
      destinationIdentifier: metadata.destinationIdentifier!,
      externalCallId: callId,
      metadata: {
        ssrc,
        codec,
        remoteAddress: rinfo.address,
        remotePort: rinfo.port,
        source: 'TELEPHONY_RTP',
      },
    }).catch(() => {});

    // Initialize ring buffer
    StreamBufferManager.getOrCreate(callId, sessionId);

    logger.info(`RTP Server New Telephony Call Session initialized: ${callId} (SSRC: 0x${ssrc.toString(16)}, Codec: ${codec})`);

    // Broadcast session start on WebSocket for SOC dashboard
    WebSocketGateway.broadcast({
      type: 'STREAM_STARTED',
      callId,
      streamId: sessionId,
      format: 'PCM_16K_MONO_TELEPHONY_RTP',
      timestamp: new Date().toISOString(),
    });

    return new RtpSession(metadata);
  }

  private async dispatchAudioFrame(session: RtpSession, normalizedFrame: any): Promise<void> {
    const { callId, sessionId } = session.metadata;
    const frameIndex = session.getMetrics().packetsReceived;

    try {
      // 1. Buffer audio in StreamBuffer
      const buffer = StreamBufferManager.getOrCreate(callId, sessionId);
      buffer.push({
        sequenceNumber: frameIndex,
        data: normalizedFrame.pcmBuffer,
        timestampMs: Date.now(),
        durationMs: normalizedFrame.durationMs,
      });

      // 2. Fast Acoustic Analysis (Sync path)
      const acousticResult = await AcousticService.analyze({
        callId,
        streamId: sessionId,
        chunkIndex: frameIndex,
        sampleRate: 16000,
        channels: 1,
        audioBase64: normalizedFrame.base64Data,
        metadata: { source: 'TELEPHONY_RTP', ssrc: session.metadata.ssrc },
      });

      // 3. VAD-driven Speech Buffer for Streaming ASR & Conversation Intelligence
      const speechBuf = SpeechBufferManager.getOrCreate(callId, sessionId);
      const isSpeech = acousticResult.vad?.state === 'SPEECH';
      const speechSegment = speechBuf.push(normalizedFrame.pcmBuffer, normalizedFrame.durationMs, isSpeech);

      if (speechSegment) {
        (async () => {
          try {
            const conv = await ConversationService.analyzeTurn({
              callId,
              streamId: sessionId,
              chunkIndex: speechSegment.turnIndex,
              audioBase64: speechSegment.audioBase64,
              speakerChannel: 0,
              timestampMs: speechSegment.timestampMs,
            });

            if (speechBuf.markProcessingComplete(speechSegment.turnIndex)) {
              if (conv.asr?.transcript) {
                const sanitized = PrivacyFirewall.sanitize(conv.asr.transcript).sanitizedText;
                WebSocketGateway.broadcast({
                  type: 'ASR_FINAL',
                  callId,
                  sequenceNumber: speechSegment.turnIndex,
                  payload: { ...conv.asr, transcript: sanitized },
                  timestamp: new Date().toISOString(),
                });
              }

              // Evaluate Unified Risk Fusion
              const unifiedRisk = await RiskService.evaluateUnifiedRisk({
                callId,
                streamId: sessionId,
                chunkIndex: speechSegment.turnIndex,
                audioBase64: speechSegment.audioBase64,
                textTranscript: conv.asr?.transcript,
              });

              WebSocketGateway.broadcast({
                type: 'UNIFIED_RISK_ASSESSMENT',
                callId,
                sequenceNumber: speechSegment.turnIndex,
                payload: unifiedRisk,
                timestamp: new Date().toISOString(),
              });

              if (unifiedRisk.policy_recommendation?.is_triggered) {
                WebSocketGateway.broadcast({
                  type: 'POLICY_ENFORCEMENT_TRIGGER',
                  callId,
                  payload: unifiedRisk.policy_recommendation,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch (err) {
            speechBuf.markProcessingComplete(speechSegment.turnIndex);
          }
        })();
      }

      // 4. Broadcast Real-Time Telemetry to WebSocket clients
      WebSocketGateway.broadcast({
        type: 'AUDIO_TELEMETRY',
        callId,
        streamId: sessionId,
        sequenceNumber: frameIndex,
        payload: {
          overall_assessment: acousticResult.overall_assessment,
          deepfake: acousticResult.deepfake,
          speaker: acousticResult.speaker,
          replay: acousticResult.replay,
          manipulation: acousticResult.manipulation,
          vad: acousticResult.vad,
          quality: acousticResult.quality,
          temporal_metrics: acousticResult.temporal_metrics,
          pipeline_latency_ms: acousticResult.total_ai_latency_ms,
          source: 'TELEPHONY_RTP',
          telephony_metrics: session.getMetrics(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn(`RTP Server Audio frame dispatch warning for ${callId}:`, { error: err });
    }
  }

  private async terminateSession(session: RtpSession, reason: string): Promise<void> {
    const { callId, sessionId, ssrc } = session.metadata;

    session.flush();
    StreamBufferManager.remove(callId);
    SpeechBufferManager.remove(callId);

    this.sessionsBySsrc.delete(ssrc);
    const endpointKey = `${session.metadata.remoteAddress}:${session.metadata.remotePort}`;
    this.sessionsByEndpoint.delete(endpointKey);

    await CallsService.updateCallStatus(callId, 'TERMINATED', reason).catch(() => {});

    await AuditService.record({
      organizationId: session.metadata.organizationId || this.config.organizationId,
      action: 'TELEPHONY_CALL_TERMINATED',
      resourceType: 'CALL',
      resourceId: callId,
      result: 'SUCCESS',
      metadata: { reason, ssrc, metrics: session.getMetrics() },
    }).catch(() => {});

    WebSocketGateway.broadcast({
      type: 'END_STREAM',
      callId,
      timestamp: new Date().toISOString(),
    });

    logger.info(`RTP Server Telephony Call Session closed: ${callId} (${reason})`);
  }

  private startSessionCleaner(): void {
    if (this.sessionCleanupInterval) return;

    this.sessionCleanupInterval = setInterval(async () => {
      const now = Date.now();
      for (const [ssrc, session] of Array.from(this.sessionsBySsrc.entries())) {
        const lastActive = session.getLastActive().getTime();
        if (now - lastActive > this.config.sessionTimeoutMs) {
          await this.terminateSession(session, 'INACTIVITY_TIMEOUT');
        }
      }
    }, 2000);
  }

  public getActiveSessions(): TelephonySessionMetadata[] {
    return Array.from(this.sessionsBySsrc.values()).map((s) => ({
      ...s.metadata,
      ...s.getMetrics(),
    }));
  }

  public getSession(ssrc: number): RtpSession | undefined {
    return this.sessionsBySsrc.get(ssrc);
  }
}
