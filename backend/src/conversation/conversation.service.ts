import { env } from '../config/env';
import { AuditService } from '../security/audit.service';

export interface ConversationTurnPayload {
  callId: string;
  streamId?: string;
  chunkIndex: number;
  audioBase64?: string;
  textTranscript?: string;
  speakerChannel?: number;
  timestampMs?: number;
  claimedSpeakerId?: string;
  metadata?: Record<string, any>;
}

export type ConversationFailureReason =
  | 'AI_TIMEOUT'
  | 'AI_HTTP_ERROR'
  | 'AI_NETWORK_ERROR'
  | 'AI_INVALID_RESPONSE'
  | 'AI_UNAVAILABLE';

export class ConversationService {
  public static readonly AI_TIMEOUT_MS = 1200;

  /**
   * Validates that the AI service returned a valid object containing required sub-objects and finite values.
   */
  private static isValidConversationResponse(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (!data.asr || typeof data.asr !== 'object' || typeof data.asr.status !== 'string') return false;
    if (!data.intent || typeof data.intent !== 'object') return false;
    if (!data.social_engineering || typeof data.social_engineering !== 'object' || typeof data.social_engineering.status !== 'string') return false;

    // Validate ASR confidence/uncertainty bounds
    const asrConf = data.asr.confidence;
    if (asrConf !== null && asrConf !== undefined) {
      if (typeof asrConf !== 'number' || !Number.isFinite(asrConf) || asrConf < 0 || asrConf > 1.0) {
        return false;
      }
    }
    const asrUnc = data.asr.uncertainty;
    if (asrUnc !== null && asrUnc !== undefined) {
      if (typeof asrUnc !== 'number' || !Number.isFinite(asrUnc) || asrUnc < 0 || asrUnc > 1.0) {
        return false;
      }
    }

    // Validate Intent confidence
    const intentConf = data.intent.confidence;
    if (intentConf !== null && intentConf !== undefined) {
      if (typeof intentConf !== 'number' || !Number.isFinite(intentConf) || intentConf < 0 || intentConf > 1.0) {
        return false;
      }
    }

    // Validate Social Engineering attack score
    const seScore = data.social_engineering.attack_sequence_score;
    if (seScore !== null && seScore !== undefined) {
      if (typeof seScore !== 'number' || !Number.isFinite(seScore) || seScore < 0 || seScore > 1.0) {
        return false;
      }
    }
    const seConf = data.social_engineering.confidence;
    if (seConf !== null && seConf !== undefined) {
      if (typeof seConf !== 'number' || !Number.isFinite(seConf) || seConf < 0 || seConf > 1.0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Constructs an explicit safe degraded failure structure without fabricating transcripts,
   * intents, or social-engineering assessments.
   */
  public static buildDegradedResult(
    payload: ConversationTurnPayload,
    failureReason: ConversationFailureReason,
    httpStatus?: number
  ): any {
    return {
      call_id: payload.callId,
      stream_id: payload.streamId,
      turn_index: payload.chunkIndex,
      timestamp: new Date().toISOString(),
      analysis_status: failureReason,
      http_status: httpStatus ?? null,
      asr: {
        status: 'NOT_AVAILABLE',
        model_version: 'whisper_streaming_conformer_v4',
        transcript: null,
        redacted_transcript: null,
        language: null,
        language_confidence: null,
        word_count: 0,
        confidence: 0.0,
        uncertainty: 1.0,
        is_final: false,
        supplied_transcript: payload.textTranscript || null,
      },
      intent: {
        status: 'NOT_AVAILABLE',
        primary_intent: 'NOT_AVAILABLE',
        confidence: 0.0,
        secondary_intents: [],
        is_adversarial: false,
        evidence_cues: [],
      },
      sensitive_data: {
        status: 'NOT_AVAILABLE',
        findings: [],
        contains_direct_request: false,
        contains_secret: false,
        redacted_preview: payload.textTranscript || null,
        highest_severity: 'LOW',
      },
      social_engineering: {
        status: 'NOT_AVAILABLE',
        model_version: 'social_eng_multi_turn_v4',
        tactics_detected: [],
        progression_state: 'NOT_AVAILABLE',
        attack_sequence_score: null,
        urgency_detected: false,
        authority_pressure: false,
        secrecy_demanded: false,
        fear_coercion_detected: false,
        verification_bypass_detected: false,
        confidence: 0.0,
        explainability: ['Conversational AI analysis unavailable; social engineering detection degraded.'],
      },
      requested_action: {
        action_type: 'NOT_AVAILABLE',
        target_object: null,
        is_high_risk: false,
        confidence: 0.0,
        raw_action_text_redacted: null,
      },
      caller_claims: [],
      inconsistencies: [],
      current_phase: 'NOT_AVAILABLE',
      total_nlp_latency_ms: 0.0,
      evidence_summary: [
        `Conversational AI analysis unavailable (${failureReason}); speech and NLP intelligence degraded.`,
      ],
    };
  }

  public static async analyzeTurn(payload: ConversationTurnPayload): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.AI_TIMEOUT_MS);
    let failureReason: ConversationFailureReason = 'AI_UNAVAILABLE';
    let httpStatus: number | undefined = undefined;

    try {
      const response = await fetch(`${env.AI_SERVICE_URL}/v1/conversation/analyze-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: payload.callId,
          stream_id: payload.streamId,
          chunk_index: payload.chunkIndex,
          audio_base64: payload.audioBase64,
          text_transcript: payload.textTranscript,
          speaker_channel: payload.speakerChannel || 0,
          timestamp_ms: payload.timestampMs || Date.now(),
          claimed_speaker_id: payload.claimedSpeakerId,
          metadata: payload.metadata || {},
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        failureReason = 'AI_HTTP_ERROR';
        httpStatus = response.status;
      } else {
        try {
          const data = await response.json();
          if (this.isValidConversationResponse(data)) {
            return data;
          } else {
            failureReason = 'AI_INVALID_RESPONSE';
          }
        } catch {
          failureReason = 'AI_INVALID_RESPONSE';
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        failureReason = 'AI_TIMEOUT';
      } else {
        failureReason = 'AI_NETWORK_ERROR';
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Record audit event safely without raw audio/transcripts
    try {
      await AuditService.record({
        organizationId: payload.metadata?.organizationId || '00000000-0000-0000-0000-000000000001',
        action: 'CONVERSATION_AI_UNAVAILABLE',
        resourceType: 'CONVERSATION_SERVICE',
        resourceId: payload.callId,
        result: 'ERROR',
        metadata: {
          streamId: payload.streamId,
          chunkIndex: payload.chunkIndex,
          failureReason,
          httpStatus,
        },
      });
    } catch {}

    return this.buildDegradedResult(payload, failureReason, httpStatus);
  }

  public static async getSummary(callId: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.AI_TIMEOUT_MS);
    try {
      const response = await fetch(`${env.AI_SERVICE_URL}/v1/conversation/${callId}/summary`, {
        signal: controller.signal,
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {} finally {
      clearTimeout(timeoutId);
    }

    return {
      call_id: callId,
      total_turns: 0,
      transcript_redacted: 'Conversational memory unavailable (AI offline).',
    };
  }

  public static async clearMemory(callId: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.AI_TIMEOUT_MS);
    try {
      const response = await fetch(`${env.AI_SERVICE_URL}/v1/conversation/${callId}`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return true;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
