import { env } from '../config/env';
import { AuditService } from '../security/audit.service';

export interface AcousticAnalyzePayload {
  callId: string;
  streamId?: string;
  chunkIndex: number;
  sampleRate?: number;
  channels?: number;
  audioBase64?: string;
  claimedSpeakerId?: string;
  channel_type?: 'WIDEBAND' | 'TELEPHONY' | 'AUTO';
  codec?: string;
  metadata?: Record<string, any>;
}

export type AcousticFailureReason =
  | 'AI_TIMEOUT'
  | 'AI_HTTP_ERROR'
  | 'AI_NETWORK_ERROR'
  | 'AI_INVALID_RESPONSE'
  | 'AI_UNAVAILABLE';

export class AcousticService {
  public static readonly AI_TIMEOUT_MS = 1200;

  /**
   * Validates that the AI service returned a valid object containing required sub-objects and finite values.
   */
  private static isValidAcousticResponse(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (!data.deepfake || typeof data.deepfake !== 'object' || typeof data.deepfake.status !== 'string') return false;
    if (!data.speaker || typeof data.speaker !== 'object' || typeof data.speaker.status !== 'string') return false;
    if (!data.replay || typeof data.replay !== 'object' || typeof data.replay.status !== 'string') return false;

    // Numerical and probability validation for deepfake
    const dfScore = data.deepfake.spoof_score;
    if (dfScore !== null && dfScore !== undefined) {
      if (typeof dfScore !== 'number' || !Number.isFinite(dfScore) || dfScore < 0 || dfScore > 1.0) {
        return false;
      }
    }
    const dfConf = data.deepfake.confidence;
    if (dfConf !== null && dfConf !== undefined) {
      if (typeof dfConf !== 'number' || !Number.isFinite(dfConf) || dfConf < 0 || dfConf > 1.0) {
        return false;
      }
    }

    // Numerical validation for speaker verification
    const spkSim = data.speaker.similarity_score;
    if (spkSim !== null && spkSim !== undefined) {
      if (typeof spkSim !== 'number' || !Number.isFinite(spkSim) || spkSim < -1.0 || spkSim > 1.0) {
        return false;
      }
    }
    const spkConf = data.speaker.confidence;
    if (spkConf !== null && spkConf !== undefined) {
      if (typeof spkConf !== 'number' || !Number.isFinite(spkConf) || spkConf < 0 || spkConf > 1.0) {
        return false;
      }
    }

    // Numerical validation for replay
    const rpProb = data.replay.replay_probability;
    if (rpProb !== null && rpProb !== undefined) {
      if (typeof rpProb !== 'number' || !Number.isFinite(rpProb) || rpProb < 0 || rpProb > 1.0) {
        return false;
      }
    }
    const rpConf = data.replay.confidence;
    if (rpConf !== null && rpConf !== undefined) {
      if (typeof rpConf !== 'number' || !Number.isFinite(rpConf) || rpConf < 0 || rpConf > 1.0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Constructs an explicit safe degraded failure structure without fabricating security assessments.
   */
  private static buildDegradedResult(
    payload: AcousticAnalyzePayload,
    failureReason: AcousticFailureReason,
    httpStatus?: number
  ): any {
    return {
      call_id: payload.callId,
      stream_id: payload.streamId,
      chunk_index: payload.chunkIndex,
      timestamp: new Date().toISOString(),
      overall_assessment: 'NOT_AVAILABLE',
      analysis_status: failureReason,
      http_status: httpStatus ?? null,
      deepfake: {
        status: 'NOT_AVAILABLE',
        spoof_score: null,
        confidence: 0.0,
        uncertainty: 1.0,
        model_version: 'robust_mini_acoustic_cnn_v1',
        engine_type: null,
        explainability: ['Acoustic AI service unavailable; deepfake detection degraded.'],
        inference_latency_ms: null,
      },
      speaker: {
        status: 'NOT_AVAILABLE',
        similarity_score: null,
        confidence: 0.0,
        is_enrolled: false,
        enrolled_speaker_id: null,
        threshold_applied: null,
        model_version: 'speaker_xvector_biometric_v3',
        engine_type: null,
        explainability: ['Acoustic AI service unavailable; biometric speaker verification degraded.'],
        inference_latency_ms: null,
      },
      replay: {
        status: 'NOT_AVAILABLE',
        replay_probability: null,
        confidence: 0.0,
        high_frequency_loss: null,
        reverberation_decay_anomaly: null,
        model_version: 'replay_spectral_decay_v3',
        engine_type: null,
        explainability: ['Acoustic AI service unavailable; replay detection degraded.'],
        inference_latency_ms: null,
      },
      manipulation: {
        level: 'NOT_AVAILABLE',
        discontinuity_score: null,
        splicing_detected: null,
        packet_repetition_detected: null,
        indicators: [],
        explainability: ['Acoustic AI service unavailable; audio manipulation analysis degraded.'],
      },
      vad: {
        state: 'UNKNOWN',
        speech_probability: null,
        energy_rms: null,
        zero_crossing_rate: null,
        spectral_centroid: null,
        confidence: 0.0,
        processing_latency_ms: null,
      },
      quality: {
        rating: 'UNKNOWN',
        rms_dbfs: null,
        peak_amplitude: null,
        clipping_ratio: null,
        silence_ratio: null,
        snr_estimate_db: null,
        dynamic_range_db: null,
        sample_rate: 16000,
        channels: 1,
        duration_ms: null,
        uncertainty_penalty: 1.0,
        notes: 'Acoustic AI service unavailable; quality metrics degraded.',
      },
      temporal_metrics: {
        window_duration_seconds: 0.0,
        accumulated_speech_seconds: 0.0,
        total_chunks_processed: payload.chunkIndex || 0,
        is_warmed_up: false,
        stability_confidence: 0.0,
      },
      total_ai_latency_ms: 0.0,
      evidence_summary: [
        `Acoustic AI analysis unavailable (${failureReason}); assessment degraded to prevent false trust.`,
      ],
    };
  }

  public static async analyze(payload: AcousticAnalyzePayload): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.AI_TIMEOUT_MS);
    let failureReason: AcousticFailureReason = 'AI_UNAVAILABLE';
    let httpStatus: number | undefined = undefined;

    try {
      const response = await fetch(`${env.AI_SERVICE_URL}/v1/acoustic/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: payload.callId,
          stream_id: payload.streamId,
          chunk_index: payload.chunkIndex,
          sample_rate: payload.sampleRate || 16000,
          channels: payload.channels || 1,
          format: 'pcm_s16le',
          audio_base64: payload.audioBase64,
          claimed_speaker_id: payload.claimedSpeakerId,
          channel_type: payload.channel_type,
          codec: payload.codec,
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
          if (this.isValidAcousticResponse(data)) {
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

    // Record audit event safely without leaking raw audio
    try {
      await AuditService.record({
        organizationId: payload.metadata?.organizationId || '00000000-0000-0000-0000-000000000001',
        action: 'ACOUSTIC_AI_UNAVAILABLE',
        resourceType: 'ACOUSTIC_SERVICE',
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

  public static async getStatus(): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.AI_TIMEOUT_MS);
    try {
      const response = await fetch(`${env.AI_SERVICE_URL}/v1/status`, {
        signal: controller.signal,
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {} finally {
      clearTimeout(timeoutId);
    }

    return {
      overall_status: 'ACOUSTIC_INTELLIGENCE_DEGRADED',
      modules: {
        deepfake_detection: { status: 'UNAVAILABLE', model: 'robust_mini_acoustic_cnn_v1' },
        speaker_verification: { status: 'UNAVAILABLE', model: 'speaker_xvector_biometric_v3' },
        replay_detection: { status: 'UNAVAILABLE', model: 'replay_spectral_decay_v3' },
        vad: { status: 'UNAVAILABLE', model: 'acoustic_multi_feature_vad_v2' },
        audio_quality: { status: 'UNAVAILABLE', model: 'signal_health_quality_v2' },
      },
    };
  }
}
