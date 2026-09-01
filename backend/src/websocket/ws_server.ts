import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { TokenService } from '../auth/jwt';
import { AuthUser, RoleName, ROLE_PERMISSIONS } from '../auth/types';
import { AudioNormalizer } from '../calls/audio_normalizer';
import { StreamBufferManager } from '../calls/stream_buffer';
import { CallsService } from '../calls/calls.service';
import { AuditService } from '../security/audit.service';
import { AcousticService } from '../acoustic/acoustic.service';
import { ConversationService } from '../conversation/conversation.service';
import { RiskService } from '../risk/risk.service';
import { env } from '../config/env';

export interface WSClientState {
  ws: WebSocket;
  user?: AuthUser;
  authenticated: boolean;
  activeCallId?: string;
  activeStreamId?: string;
  connectedAt: Date;
  ipAddress?: string;
}

export interface WSMessage {
  type:
    | 'AUTHENTICATE'
    | 'START_STREAM'
    | 'AUDIO_CHUNK'
    | 'STREAM_STATUS'
    | 'END_STREAM'
    | 'AUDIO_TELEMETRY'
    | 'ASR_PARTIAL'
    | 'ASR_FINAL'
    | 'CONVERSATION_SIGNAL'
    | 'SOCIAL_ENGINEERING_ALERT'
    | 'UNIFIED_RISK_ASSESSMENT'
    | 'POLICY_ENFORCEMENT_TRIGGER'
    | 'HUMAN_DECISION_EVENT'
    | 'SOC_ALERT'
    | 'PING'
    | 'PONG'
    | 'ERROR';
  callId?: string;
  streamId?: string;
  sequenceNumber?: number;
  payload?: any;
  timestamp?: string;
}

export class WebSocketGateway {
  private static wss: WebSocketServer | null = null;
  private static clientStates: Map<WebSocket, WSClientState> = new Map();

  public static initialize(server: http.Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: 1024 * 1024, // 1 MB hard max per frame
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const ipAddress = req.socket.remoteAddress;
      const state: WSClientState = {
        ws,
        authenticated: false,
        connectedAt: new Date(),
        ipAddress,
      };

      this.clientStates.set(ws, state);
      console.info(`🔌 WebSocket client connected from ${ipAddress}`);

      ws.on('message', async (message: string | Buffer) => {
        try {
          const msgStr = typeof message === 'string' ? message : message.toString('utf-8');
          const parsed: WSMessage = JSON.parse(msgStr);
          await this.handleClientMessage(state, parsed);
        } catch (e: any) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              error: 'INVALID_PAYLOAD',
              message: `Malformed message: ${e.message || 'Unknown JSON error'}`,
              timestamp: new Date().toISOString(),
            })
          );
        }
      });

      ws.on('close', () => {
        if (state.activeCallId) {
          StreamBufferManager.remove(state.activeCallId);
        }
        this.clientStates.delete(ws);
        console.info(`🔌 WebSocket client disconnected`);
      });

      // Send initial handshake
      ws.send(
        JSON.stringify({
          type: 'CONNECTED',
          message: 'VOXSHIELD Real-Time Security WebSocket Gateway Connected (Phase 2 Audio Pipeline)',
          requiresAuth: true,
          canonicalFormat: 'Linear PCM 16-bit 16kHz mono',
          timestamp: new Date().toISOString(),
        })
      );
    });
  }

  private static async handleClientMessage(state: WSClientState, msg: WSMessage): Promise<void> {
    const ws = state.ws;

    // 1. PING / PONG (Heartbeat)
    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
      return;
    }

    // 2. AUTHENTICATE
    if (msg.type === 'AUTHENTICATE') {
      const token = msg.payload?.token;
      if (!token) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'AUTH_REQUIRED',
            message: 'Token required for authentication',
          })
        );
        return;
      }

      try {
        const payload = TokenService.verifyToken(token);
        const permissions = ROLE_PERMISSIONS[payload.role] || [];
        state.user = {
          id: payload.userId,
          email: payload.email,
          fullName: 'Authenticated Streamer',
          role: payload.role,
          organizationId: payload.organizationId,
          permissions,
        };
        state.authenticated = true;

        ws.send(
          JSON.stringify({
            type: 'AUTHENTICATED',
            user: { email: payload.email, role: payload.role },
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err: any) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_TOKEN',
            message: err.message,
          })
        );
      }
      return;
    }

    // Enforce server-side authentication for streaming actions
    if (!state.authenticated) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          error: 'UNAUTHENTICATED',
          message: 'Client must send AUTHENTICATE message before streaming audio',
        })
      );
      return;
    }

    // 3. START_STREAM
    if (msg.type === 'START_STREAM') {
      const callId = msg.callId || msg.payload?.callId;
      if (!callId) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_CALL_ID',
            message: 'callId is required to start audio stream',
          })
        );
        return;
      }

      const streamId = msg.streamId || `stream-${Date.now()}`;
      state.activeCallId = callId;
      state.activeStreamId = streamId;

      const buffer = StreamBufferManager.getOrCreate(callId, streamId);

      await AuditService.record({
        actorUserId: state.user?.id,
        organizationId: state.user?.organizationId || '00000000-0000-0000-0000-000000000001',
        action: 'AUDIO_STREAM_STARTED',
        resourceType: 'CALL',
        resourceId: callId,
        result: 'SUCCESS',
        ipAddress: state.ipAddress,
        metadata: { streamId },
      });

      ws.send(
        JSON.stringify({
          type: 'STREAM_STARTED',
          callId,
          streamId,
          format: 'PCM_16K_MONO',
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 4. AUDIO_CHUNK
    if (msg.type === 'AUDIO_CHUNK') {
      const callId = msg.callId || state.activeCallId;
      if (!callId) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'NO_ACTIVE_CALL',
            message: 'Audio chunk received without active call session',
          })
        );
        return;
      }

      const rawAudio = msg.payload?.audio_base64 || msg.payload?.data || msg.payload;
      const sequenceNumber = typeof msg.sequenceNumber === 'number' ? msg.sequenceNumber : 0;
      const sampleRate = msg.payload?.sample_rate || 16000;
      const channels = msg.payload?.channels || 1;

      // Normalize audio
      const normalized = AudioNormalizer.normalize(rawAudio, sampleRate, channels);
      if (!normalized.isValid) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_AUDIO_FORMAT',
            message: normalized.error,
          })
        );
        return;
      }

      // Buffer audio
      const buffer = StreamBufferManager.getOrCreate(callId, state.activeStreamId);
      const pushResult = buffer.push({
        sequenceNumber,
        data: normalized.pcmBuffer,
        timestampMs: Date.now(),
        durationMs: normalized.durationMs,
      });

      const metrics = buffer.getMetrics();
      const startProcTime = Date.now();

      // Execute full Phase 3 Acoustic Intelligence Pipeline
      let acousticResult = await AcousticService.analyze({
        callId,
        streamId: state.activeStreamId,
        chunkIndex: sequenceNumber,
        sampleRate: 16000,
        channels: 1,
        audioBase64: normalized.base64Data,
        claimedSpeakerId: msg.payload?.claimedSpeakerId || msg.payload?.claimed_speaker_id,
        metadata: { sequenceNumber, durationMs: normalized.durationMs },
      });

      // Execute Phase 4 Conversational Intelligence Pipeline
      let convResult = await ConversationService.analyzeTurn({
        callId,
        streamId: state.activeStreamId,
        chunkIndex: sequenceNumber,
        audioBase64: normalized.base64Data,
        textTranscript: msg.payload?.text_transcript || msg.payload?.transcript,
        speakerChannel: msg.payload?.speakerChannel || 0,
        timestampMs: Date.now(),
        claimedSpeakerId: msg.payload?.claimedSpeakerId || msg.payload?.claimed_speaker_id,
      });

      // Construct complete real-time analysis telemetry event
      const telemetry: WSMessage = {
        type: 'AUDIO_TELEMETRY',
        callId,
        streamId: state.activeStreamId,
        sequenceNumber,
        payload: {
          overall_assessment: acousticResult.overall_assessment,
          deepfake: acousticResult.deepfake,
          speaker: acousticResult.speaker,
          replay: acousticResult.replay,
          manipulation: acousticResult.manipulation,
          vad: acousticResult.vad,
          quality: acousticResult.quality,
          temporal_metrics: acousticResult.temporal_metrics,
          conversation: convResult,
          metrics,
          pipeline_latency_ms: acousticResult.total_ai_latency_ms + (convResult.total_nlp_latency_ms || 0),
          evidence_summary: [...(acousticResult.evidence_summary || []), ...(convResult.evidence_summary || [])],
          phase: 'PHASE_4_CONVERSATIONAL_INTELLIGENCE',
          models: {
            deepfake: acousticResult.deepfake.status,
            speaker: acousticResult.speaker.status,
            replay: acousticResult.replay.status,
            asr: convResult.asr?.status || 'AVAILABLE',
            social_engineering: convResult.social_engineering?.status || 'AVAILABLE',
          },
        },
        timestamp: new Date().toISOString(),
      };

      // Broadcast telemetry to all connected clients
      this.broadcast(telemetry);

      if (convResult.asr?.transcript) {
        this.broadcast({
          type: 'ASR_FINAL',
          callId,
          sequenceNumber,
          payload: convResult.asr,
          timestamp: new Date().toISOString(),
        });
      }

      if (convResult.social_engineering?.attack_sequence_score >= 0.70) {
        this.broadcast({
          type: 'SOCIAL_ENGINEERING_ALERT',
          callId,
          sequenceNumber,
          payload: {
            progression_state: convResult.social_engineering.progression_state,
            score: convResult.social_engineering.attack_sequence_score,
            tactics: convResult.social_engineering.tactics_detected,
            evidence: convResult.evidence_summary,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Execute Phase 5 Unified Multi-Modal Risk Fusion
      const unifiedRisk = await RiskService.evaluateUnifiedRisk({
        callId,
        streamId: state.activeStreamId,
        chunkIndex: sequenceNumber,
        audioBase64: normalized.base64Data,
        textTranscript: msg.payload?.text_transcript || msg.payload?.transcript,
        claimedSpeakerId: msg.payload?.claimedSpeakerId || msg.payload?.claimed_speaker_id,
      }, state.user?.id);

      this.broadcast({
        type: 'UNIFIED_RISK_ASSESSMENT',
        callId,
        sequenceNumber,
        payload: unifiedRisk,
        timestamp: new Date().toISOString(),
      });

      if (unifiedRisk.policy_recommendation?.is_triggered) {
        this.broadcast({
          type: 'POLICY_ENFORCEMENT_TRIGGER',
          callId,
          payload: unifiedRisk.policy_recommendation,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    // 5. STREAM_STATUS
    if (msg.type === 'STREAM_STATUS') {
      const callId = msg.callId || state.activeCallId;
      const buffer = callId ? StreamBufferManager.get(callId) : undefined;
      const metrics = buffer ? buffer.getMetrics() : null;

      ws.send(
        JSON.stringify({
          type: 'STREAM_STATUS',
          callId,
          metrics,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 6. END_STREAM
    if (msg.type === 'END_STREAM') {
      const callId = msg.callId || state.activeCallId;
      if (callId) {
        StreamBufferManager.remove(callId);
        state.activeCallId = undefined;
        state.activeStreamId = undefined;

        await AuditService.record({
          actorUserId: state.user?.id,
          organizationId: state.user?.organizationId || '00000000-0000-0000-0000-000000000001',
          action: 'AUDIO_STREAM_ENDED',
          resourceType: 'CALL',
          resourceId: callId,
          result: 'SUCCESS',
          ipAddress: state.ipAddress,
        });

        this.broadcast({
          type: 'END_STREAM',
          callId,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }
  }

  public static broadcast(msg: WSMessage): void {
    const payload = JSON.stringify(msg);
    for (const [ws, state] of this.clientStates) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  public static broadcastAlert(alert: {
    callId: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    action: string;
  }): void {
    const sanitizedMsg = PrivacyFirewall.sanitize(alert.message).sanitizedText;
    const msg: WSMessage = {
      type: 'SOC_ALERT',
      callId: alert.callId,
      payload: {
        severity: alert.severity,
        message: sanitizedMsg,
        action: alert.action,
      },
      timestamp: new Date().toISOString(),
    };
    this.broadcast(msg);
  }
}
