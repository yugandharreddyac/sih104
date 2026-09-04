import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { PrivacyFirewall } from '../security/privacy_firewall';
import { TokenService } from '../auth/jwt';
import { AuthUser, Permission, RoleName, ROLE_PERMISSIONS } from '../auth/types';
import { AudioNormalizer } from '../calls/audio_normalizer';
import { StreamBufferManager } from '../calls/stream_buffer';
import { CallsService } from '../calls/calls.service';
import { AuditService } from '../security/audit.service';
import { AcousticService } from '../acoustic/acoustic.service';
import { ConversationService } from '../conversation/conversation.service';
import { RiskService } from '../risk/risk.service';
import { IncidentsService } from '../incidents/incidents.service';
import { env } from '../config/env';
import { RedisPubSubService } from '../infrastructure/redis_pubsub';
import { activeWsConnections, wsErrorsTotal } from '../health/metrics.controller';

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
    | 'ERROR'
    | 'CONNECTED'
    | 'AUTHENTICATED'
    | 'STREAM_STARTED';
  callId?: string;
  streamId?: string;
  sequenceNumber?: number;
  payload?: any;
  timestamp?: string;
  error?: string;
  message?: string;
  requiresAuth?: boolean;
  canonicalFormat?: string;
  format?: string;
  user?: { email: string; role: string };
  metrics?: any;
  organizationId?: string;
}

export class WebSocketGateway {
  private static wss: WebSocketServer | null = null;
  private static clientStates: Map<WebSocket, WSClientState> = new Map();

  private static pingInterval: NodeJS.Timeout | null = null;

  private static isSubscribed = false;

  public static async initialize(server: http.Server): Promise<void> {
    if (this.wss) return;

    // Ensure sample calls exist for valid stream validation in standalone mode
    CallsService.seedSampleCallsIfEmpty();

    // Initialize Redis for cross-instance scaling
    await RedisPubSubService.initialize();

    if (!this.isSubscribed) {
      RedisPubSubService.subscribe((msgPayload) => {
        // Receive broadcast from another instance via Redis and distribute locally
        this.broadcastLocal(msgPayload);
      });
      this.isSubscribed = true;
    }

    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: 256 * 1024, // 256 KB hard max per frame
      verifyClient: (info, callback) => {
        const origin = info.origin || info.req.headers.origin;
        // Allow undefined origin (non-browser clients/tests) or match CORS_ORIGIN
        if (origin && env.CORS_ORIGIN !== '*' && origin !== env.CORS_ORIGIN) {
          console.warn(`WebSocket connection rejected from unauthorized origin: ${origin}`);
          return callback(false, 403, 'Forbidden');
        }
        callback(true);
      }
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const ipAddress = req.socket.remoteAddress;
      const state: WSClientState = {
        ws,
        authenticated: false,
        connectedAt: new Date(),
        ipAddress,
      };

      (ws as any).isAlive = true;
      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });

      this.clientStates.set(ws, state);
      activeWsConnections.inc(1);
      console.info(`🔌 WebSocket client connected from ${ipAddress}`);

      ws.on('message', async (message: string | Buffer) => {
        try {
          const msgStr = typeof message === 'string' ? message : message.toString('utf-8');
          console.log('WS_SERVER_RX:', msgStr);
          let parsed: any;
          try {
            parsed = JSON.parse(msgStr);
          } catch (jsonErr: any) {
            wsErrorsTotal.inc({ error_type: 'INVALID_PAYLOAD' });
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                error: 'INVALID_PAYLOAD',
                message: `Malformed JSON payload: ${jsonErr.message || 'Syntax error'}`,
                timestamp: new Date().toISOString(),
              })
            );
            return;
          }

          if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
            wsErrorsTotal.inc({ error_type: 'INVALID_PAYLOAD' });
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                error: 'INVALID_PAYLOAD',
                message: 'Message must be a valid JSON object with a string type property',
                timestamp: new Date().toISOString(),
              })
            );
            return;
          }

          await this.handleClientMessage(state, parsed);
        } catch (e: any) {
          wsErrorsTotal.inc({ error_type: 'INTERNAL_ERROR' });
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              error: 'INTERNAL_ERROR',
              message: 'An internal error occurred during message processing',
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
        activeWsConnections.dec(1);
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

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.pingInterval = setInterval(() => {
      this.wss?.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) return ws.terminate();
        (ws as any).isAlive = false;
        ws.ping();
      });
    }, 30000);
    this.pingInterval.unref();
  }

  public static async close(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const [ws] of this.clientStates) {
      try {
        ws.terminate();
      } catch {}
    }
    this.clientStates.clear();
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }
    await RedisPubSubService.close();
  }

  private static hasPermission(user?: AuthUser, requiredPermission: Permission = Permission.CALLS_STREAM): boolean {
    if (!user) return false;
    return user.permissions.includes(Permission.ALL) || user.permissions.includes(requiredPermission);
  }

  private static async handleClientMessage(state: WSClientState, msg: WSMessage): Promise<void> {
    const ws = state.ws;

    // 1. PING / PONG (Heartbeat - Allowed unauthenticated)
    if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
      return;
    }

    // 2. AUTHENTICATE
    if (msg.type === 'AUTHENTICATE') {
      const token = msg.payload?.token;
      if (!token || typeof token !== 'string') {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'AUTH_REQUIRED',
            message: 'Token required for authentication',
            timestamp: new Date().toISOString(),
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
            message: err.message || 'Invalid or expired token',
            timestamp: new Date().toISOString(),
          })
        );
      }
      return;
    }

    // Enforce server-side authentication for all subsequent streaming actions
    if (!state.authenticated) {
      ws.send(
        JSON.stringify({
          type: 'ERROR',
          error: 'UNAUTHENTICATED',
          message: 'Client must send AUTHENTICATE message before streaming audio',
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 3. START_STREAM
    if (msg.type === 'START_STREAM') {
      // Enforce RBAC permission: calls:stream
      if (!this.hasPermission(state.user, Permission.CALLS_STREAM)) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'FORBIDDEN',
            message: 'User lacks permission: calls:stream',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const rawCallId = msg.callId ?? msg.payload?.callId;
      if (typeof rawCallId !== 'string' || rawCallId.trim().length === 0 || rawCallId.length > 100) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_CALL_ID',
            message: 'callId is required to start audio stream and must be a non-empty string',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const callId = rawCallId.trim();

      // Validate Call Existence & Tenant Isolation
      const call = await CallsService.getCallById(callId);
      if (!call) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'CALL_NOT_FOUND',
            message: `Call session '${callId}' does not exist`,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (call.organizationId !== state.user?.organizationId) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'FORBIDDEN',
            message: 'Access to call session from another organization is denied',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const rawStreamId = msg.streamId ?? msg.payload?.streamId;
      const streamId =
        typeof rawStreamId === 'string' && rawStreamId.trim().length > 0
          ? rawStreamId.trim().slice(0, 100)
          : `stream-${Date.now()}`;

      state.activeCallId = callId;
      state.activeStreamId = streamId;

      StreamBufferManager.getOrCreate(callId, streamId);

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
      // Enforce RBAC permission: calls:stream
      if (!this.hasPermission(state.user, Permission.CALLS_STREAM)) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'FORBIDDEN',
            message: 'User lacks permission: calls:stream',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const rawCallId = msg.callId ?? state.activeCallId;
      if (typeof rawCallId !== 'string' || rawCallId.trim().length === 0 || rawCallId.length > 100) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'NO_ACTIVE_CALL',
            message: 'Audio chunk received without active call session',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const callId = rawCallId.trim();

      // Validate Call Existence & Tenant Isolation
      const call = await CallsService.getCallById(callId);
      if (!call) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'CALL_NOT_FOUND',
            message: `Call session '${callId}' does not exist`,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (call.organizationId !== state.user?.organizationId) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'FORBIDDEN',
            message: 'Access to call session from another organization is denied',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // Validate Sequence Number
      const seq = msg.sequenceNumber;
      if (typeof seq !== 'number' || !Number.isFinite(seq) || !Number.isInteger(seq) || seq < 0) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_SEQUENCE_NUMBER',
            message: 'sequenceNumber must be a non-negative finite integer',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }
      const sequenceNumber = seq;

      // Validate Sample Rate
      const rawSampleRate = msg.payload?.sample_rate ?? msg.payload?.sampleRate ?? 16000;
      if (
        typeof rawSampleRate !== 'number' ||
        !Number.isFinite(rawSampleRate) ||
        !Number.isInteger(rawSampleRate) ||
        rawSampleRate < 8000 ||
        rawSampleRate > 48000
      ) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_SAMPLE_RATE',
            message: 'sample_rate must be an integer between 8000 and 48000 Hz',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }
      const sampleRate = rawSampleRate;

      // Validate Channels
      const rawChannels = msg.payload?.channels ?? 1;
      if (
        typeof rawChannels !== 'number' ||
        !Number.isFinite(rawChannels) ||
        !Number.isInteger(rawChannels) ||
        (rawChannels !== 1 && rawChannels !== 2)
      ) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_CHANNELS',
            message: 'channels must be 1 (mono) or 2 (stereo)',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }
      const channels = rawChannels;

      // Validate Audio Payload
      const rawAudio = msg.payload?.audio_base64 ?? msg.payload?.data ?? (typeof msg.payload === 'string' ? msg.payload : undefined);
      if (!rawAudio || (typeof rawAudio !== 'string' && !Buffer.isBuffer(rawAudio))) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_AUDIO_FORMAT',
            message: 'Audio payload is missing or invalid. Expected base64 string or Buffer.',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // Normalize audio
      const normalized = AudioNormalizer.normalize(rawAudio, sampleRate, channels);
      if (!normalized.isValid) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'INVALID_AUDIO_FORMAT',
            message: normalized.error || 'Audio normalization failed',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // Sanitize optional metadata (speaker ID, transcript)
      let claimedSpeakerId: string | undefined = undefined;
      const rawSpeaker = msg.payload?.claimedSpeakerId ?? msg.payload?.claimed_speaker_id;
      if (typeof rawSpeaker === 'string' && rawSpeaker.trim().length > 0) {
        claimedSpeakerId = rawSpeaker.trim().slice(0, 100);
      }

      let textTranscript: string | undefined = undefined;
      const rawTranscript = msg.payload?.text_transcript ?? msg.payload?.transcript;
      if (typeof rawTranscript === 'string') {
        textTranscript = rawTranscript.slice(0, 5000);
      }

      const speakerChannel =
        typeof msg.payload?.speakerChannel === 'number' && Number.isFinite(msg.payload.speakerChannel)
          ? msg.payload.speakerChannel
          : 0;

      // Buffer audio
      const streamId = state.activeStreamId || `stream-${Date.now()}`;
      const buffer = StreamBufferManager.getOrCreate(callId, streamId);
      buffer.push({
        sequenceNumber,
        data: normalized.pcmBuffer,
        timestampMs: Date.now(),
        durationMs: normalized.durationMs,
      });

      const metrics = buffer.getMetrics();

      // Execute Phase 3 Acoustic and Phase 4 Conversational Intelligence Pipelines concurrently (Parallel)
      const [acousticResult, convResult] = await Promise.all([
        AcousticService.analyze({
          callId,
          streamId,
          chunkIndex: sequenceNumber,
          sampleRate: 16000,
          channels: 1,
          audioBase64: normalized.base64Data,
          claimedSpeakerId,
          metadata: { sequenceNumber, durationMs: normalized.durationMs },
        }),
        ConversationService.analyzeTurn({
          callId,
          streamId,
          chunkIndex: sequenceNumber,
          audioBase64: normalized.base64Data,
          textTranscript,
          speakerChannel,
          timestampMs: Date.now(),
          claimedSpeakerId,
        }),
      ]);

      // Construct complete real-time analysis telemetry event
      const telemetry: WSMessage = {
        type: 'AUDIO_TELEMETRY',
        callId,
        streamId,
        sequenceNumber,
        organizationId: state.user?.organizationId,
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
            asr: convResult.asr?.status || 'NOT_AVAILABLE',
            social_engineering: convResult.social_engineering?.status || 'NOT_AVAILABLE',
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
          organizationId: state.user?.organizationId,
          payload: convResult.asr,
          timestamp: new Date().toISOString(),
        });
      }

      if (convResult.social_engineering?.attack_sequence_score >= 0.7) {
        this.broadcast({
          type: 'SOCIAL_ENGINEERING_ALERT',
          callId,
          sequenceNumber,
          organizationId: state.user?.organizationId,
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
      const unifiedRisk = await RiskService.evaluateUnifiedRisk(
        {
          callId,
          streamId,
          chunkIndex: sequenceNumber,
          audioBase64: normalized.base64Data,
          textTranscript,
          claimedSpeakerId,
        },
        state.user?.id
      );

      this.broadcast({
        type: 'UNIFIED_RISK_ASSESSMENT',
        callId,
        sequenceNumber,
        organizationId: state.user?.organizationId,
        payload: unifiedRisk,
        timestamp: new Date().toISOString(),
      });

      if (unifiedRisk.policy_recommendation?.is_triggered) {
        this.broadcast({
          type: 'POLICY_ENFORCEMENT_TRIGGER',
          callId,
          organizationId: state.user?.organizationId,
          payload: unifiedRisk.policy_recommendation,
          timestamp: new Date().toISOString(),
        });

        if (state.user?.organizationId) {
          try {
            await IncidentsService.correlateOrEscalateIncident({
              organizationId: state.user.organizationId,
              severity: unifiedRisk.risk_level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
              attackClassification:
                unifiedRisk.primary_drivers?.[0] || 'SECURITY_POLICY_VIOLATION_TRIGGERED',
              callId,
              summary: `Policy trigger: ${unifiedRisk.policy_recommendation.rule_name || 'Enforcement Rule'}`,
              triggeredPolicies: [unifiedRisk.policy_recommendation.policy_id || 'POL-CRED-001'],
              actionsTaken: [unifiedRisk.policy_recommendation.action || 'REQUIRE_STEP_UP_VERIFICATION'],
              evidenceReferences: [],
            });
          } catch {
            // Safe non-blocking incident correlation
          }
        }
      }
      return;
    }

    // 5. STREAM_STATUS
    if (msg.type === 'STREAM_STATUS') {
      const rawCallId = msg.callId ?? state.activeCallId;
      const callId = typeof rawCallId === 'string' ? rawCallId.trim() : undefined;
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
      // Enforce RBAC permission: calls:stream
      if (!this.hasPermission(state.user, Permission.CALLS_STREAM)) {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            error: 'FORBIDDEN',
            message: 'User lacks permission: calls:stream',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const rawCallId = msg.callId ?? state.activeCallId;
      const callId = typeof rawCallId === 'string' ? rawCallId.trim() : undefined;

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
          organizationId: state.user?.organizationId,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    // 7. Unknown message type fallback
    wsErrorsTotal.inc({ error_type: 'UNKNOWN_MESSAGE_TYPE' });
    ws.send(
      JSON.stringify({
        type: 'ERROR',
        error: 'UNKNOWN_MESSAGE_TYPE',
        message: `Unrecognized message type: '${(msg as any).type || 'undefined'}'`,
        timestamp: new Date().toISOString(),
      })
    );
  }

  public static broadcast(msg: WSMessage): void {
    this.broadcastLocal(msg);
    // Propagate to other horizontally scaled instances via Redis
    RedisPubSubService.publish(msg).catch(() => {});
  }

  private static broadcastLocal(msg: WSMessage): void {
    const payload = JSON.stringify(msg);
    for (const [ws, state] of this.clientStates) {
      if (ws.readyState === WebSocket.OPEN) {
        if (msg.organizationId) {
          if (!state.authenticated || !state.user || state.user.organizationId !== msg.organizationId) {
            continue;
          }
        }
        ws.send(payload);
      }
    }
  }

  public static broadcastAlert(alert: {
    callId: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    action: string;
    organizationId?: string;
  }): void {
    const sanitizedMsg = PrivacyFirewall.sanitize(alert.message).sanitizedText;
    const msg: WSMessage = {
      type: 'SOC_ALERT',
      callId: alert.callId,
      organizationId: alert.organizationId,
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
