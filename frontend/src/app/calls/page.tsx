'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { ApiClient, WS_BASE } from '@/lib/api';
import { BrowserAudioStreamer, MicStreamState } from '@/lib/audio_streamer';
import { formatSafeTime, formatLatency } from '@/lib/format';
import { RiskTensorCard } from '@/components/ui/RiskTensorCard';
import { DominantThreatCard } from '@/components/ui/DominantThreatCard';
import { EvidenceExplainer } from '@/components/ui/EvidenceExplainer';
import { TechnicalTelemetryPanel } from '@/components/ui/TechnicalTelemetryPanel';
import {
  PhoneCall,
  Activity,
  Mic,
  Square,
  Play,
  Zap,
  Lock,
  MessageSquare,
  AlertTriangle,
  FileText,
  UserCheck,
  Radio,
  Clock,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface CallSession {
  id: string;
  callerIdentifier: string;
  callerDisplayName?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'ACTIVE' | 'RINGING' | 'TERMINATED' | 'INITIALIZING' | 'VERIFYING' | 'FLAGGED' | 'BLOCKED';
  organizationId: string;
  claimedSpeakerId?: string;
  createdAt: string;
}

interface ThreatScenarioOption {
  id: string;
  name: string;
  dimension: string;
  transcript: string;
  claimedSpeaker?: string;
  desc: string;
}

const THREAT_SCENARIOS: ThreatScenarioOption[] = [
  {
    id: 'CREDENTIAL_THEFT',
    name: '1. Credential Theft (OTP)',
    dimension: 'credential_theft',
    transcript: 'Please tell me your OTP.',
    desc: 'Direct solicitation of authentication credentials / one-time password (OTP).',
  },
  {
    id: 'FINANCIAL_FRAUD',
    name: '2. Financial Fraud (Wire)',
    dimension: 'financial_fraud',
    transcript: 'Transfer fifty thousand rupees to this new beneficiary immediately.',
    desc: 'Urgent unauthorized fund transfer to newly specified beneficiary account.',
  },
  {
    id: 'ACCOUNT_TAKEOVER',
    name: '3. Account Takeover (Remote)',
    dimension: 'account_takeover',
    transcript: 'Install remote access software and share your screen.',
    desc: 'Adversary instructs victim to install AnyDesk/TeamViewer remote access tools.',
  },
  {
    id: 'VERIFICATION_BYPASS',
    name: '4. Verification Bypass',
    dimension: 'verification_bypass',
    transcript: 'Skip verification and approve the transaction.',
    desc: 'Adversary pressures operator to bypass secondary out-of-band verification steps.',
  },
  {
    id: 'SOCIAL_ENGINEERING',
    name: '5. Social Engineering (Coercion)',
    dimension: 'social_engineering',
    transcript: 'I am the Police Commissioner. You must transfer these funds immediately or face arrest.',
    desc: 'Coercive authority exploitation and artificial urgency pressure.',
  },
  {
    id: 'ACOUSTIC_DEEPFAKE',
    name: '6. Acoustic Deepfake (Synthetic)',
    dimension: 'deepfake_synthetic',
    transcript: 'Synthesized vocoder test audio with high-frequency phase discontinuities.',
    desc: 'Acoustic neural evaluation detecting vocoder phase jitter and spectral anomalies.',
  },
  {
    id: 'SPEAKER_MISMATCH',
    name: '7. Speaker Impersonation (Mismatch)',
    dimension: 'identity_impersonation',
    transcript: 'I am the Chief Financial Officer authorizing this transaction.',
    claimedSpeaker: 'unknown-speaker',
    desc: 'Caller acoustic voiceprint contradicts enrolled biometric CFO identity profile.',
  },
  {
    id: 'REPLAY_ATTACK',
    name: '8. Replay Attack (Loudspeaker)',
    dimension: 'replay_injection',
    transcript: 'Loudspeaker replay transmission with room reverberation decay.',
    desc: 'Secondary room reverberation convolution and physical loudspeaker roll-off.',
  },
];

const INITIAL_TELEMETRY = {
  overallAssessment: 'AWAITING_STREAM',
  deepfake: {
    status: 'READY',
    spoofScore: null as number | null,
    confidence: 0.0,
    uncertainty: 1.0,
    artifacts: [] as string[],
    explainability: ['Awaiting audio stream for acoustic neural evaluation.'],
    latencyMs: 0,
  },
  speaker: {
    status: 'READY',
    similarityScore: null as number | null,
    confidence: 0.0,
    isEnrolled: false,
    enrolledSpeakerId: '',
    explainability: ['Awaiting voice sample for biometric enrollment matching.'],
  },
  replay: {
    status: 'READY',
    replayProbability: null as number | null,
    confidence: 0.0,
    explainability: ['Awaiting spectral frequency frames.'],
  },
  manipulation: {
    level: 'NO_INDICATOR',
    indicators: [] as string[],
  },
  vad: {
    state: 'IDLE',
    speechProbability: null as number | null,
  },
  quality: {
    rating: 'INITIALIZING',
    rmsDbfs: -96.0,
    peakAmplitude: 0.0,
    clippingRatio: 0.0,
    snrEstimateDb: 0.0,
    notes: 'No audio packets received yet',
  },
  temporal: {
    accumulatedSpeechSec: 0.0,
    isWarmedUp: false,
  },
  conversation: {
    transcript: '',
    redactedTranscript: 'Awaiting speech recognition transcript...',
    language: 'EN',
    languageConfidence: 0.0,
    asrConfidence: 0.0,
    asrUncertainty: 1.0,
    intent: 'NONE',
    isAdversarialIntent: false,
    requestedAction: 'NONE',
    actionType: 'NONE',
    isHighRiskAction: false,
    tactics: [] as string[],
    progressionState: 'IDLE',
    sequenceScore: 0.0,
    highestSeverity: 'LOW',
    claims: [] as Array<{ identity: string; org: string; turn: number }>,
    inconsistencies: [] as string[],
    currentPhase: 'INITIALIZATION',
    nlpLatencyMs: 0,
  },
  totalAiLatencyMs: 0,
  evidenceSummary: [] as string[],
};

export default function CallsPage() {
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallSession | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamSource, setStreamSource] = useState<'MIC' | 'SYNTHETIC'>('SYNTHETIC');
  const [claimedSpeakerId, setClaimedSpeakerId] = useState('speaker-cfo-001');
  const [selectedScenario, setSelectedScenario] = useState<string>('CREDENTIAL_THEFT');

  // Live Telemetry State (Starts clean / ready for stream)
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);

  // Unified Multi-Modal Decision & Policy State
  const [unifiedRisk, setUnifiedRisk] = useState({
    overallRiskScore: null as number | null,
    riskLevel: null as string | null,
    confidence: null as number | null,
    uncertainty: null as number | null,
    dimensions: {
      overall: null as number | null,
      identity_impersonation: null as number | null,
      deepfake_synthetic: null as number | null,
      replay_injection: null as number | null,
      social_engineering: null as number | null,
      credential_theft: null as number | null,
      financial_fraud: null as number | null,
      account_takeover: null as number | null,
      verification_bypass: null as number | null,
      inconsistency: null as number | null,
    },
    riskVelocity: 0,
    riskTrajectoryTrend: 'STEADY',
    primaryDrivers: [] as string[],
    contradictingSignals: [] as string[],
    evidenceGraph: {
      nodes: [] as any[],
      edges: [] as any[],
    },
    policyRecommendation: null as any,
    humanWorkflowState: 'PENDING_EVALUATION',
    fusionLatencyMs: 0,
  });

  const [interventionFeedback, setInterventionFeedback] = useState<string | null>(null);

  // Real Microphone Capture State
  const [micState, setMicState] = useState<MicStreamState>('IDLE');
  const [micError, setMicError] = useState<string | null>(null);
  const [micRmsDb, setMicRmsDb] = useState<number>(-96);

  const wsRef = useRef<WebSocket | null>(null);
  const isWsAuthenticatedRef = useRef<boolean>(false);
  const audioStreamerRef = useRef<BrowserAudioStreamer | null>(null);
  const audioIntervalRef = useRef<any>(null);
  const selectedCallRef = useRef<CallSession | null>(null);
  const latestRiskSeqRef = useRef<number>(-1);
  const claimedSpeakerIdRef = useRef(claimedSpeakerId);
  const speechRecognitionRef = useRef<any>(null);
  const currentMicTranscriptRef = useRef<string>('');

  useEffect(() => {
    claimedSpeakerIdRef.current = claimedSpeakerId;
  }, [claimedSpeakerId]);

  useEffect(() => {
    selectedCallRef.current = selectedCall;
    latestRiskSeqRef.current = -1;
    if (selectedCall) {
      // Reset telemetry and risk state when switching call
      setTelemetry(INITIAL_TELEMETRY);
      setUnifiedRisk((prev) => ({
        ...prev,
        overallRiskScore: null,
        riskLevel: null,
        confidence: null,
        uncertainty: null,
        dimensions: {
          overall: null,
          identity_impersonation: null,
          deepfake_synthetic: null,
          replay_injection: null,
          social_engineering: null,
          credential_theft: null,
          financial_fraud: null,
          account_takeover: null,
          verification_bypass: null,
          inconsistency: null,
        },
      }));

      // Load initial risk assessment if already recorded in backend
      ApiClient.get(`/risk/${selectedCall.id}`).then((res) => {
        if (res.success && res.data) {
          const r = res.data;
          setUnifiedRisk((prev) => ({
            ...prev,
            overallRiskScore: typeof r.overall_risk_score === 'number' ? r.overall_risk_score : prev.overallRiskScore,
            riskLevel: r.risk_level ?? prev.riskLevel,
            confidence: typeof r.confidence === 'number' ? r.confidence : prev.confidence,
            uncertainty: typeof r.uncertainty === 'number' ? r.uncertainty : prev.uncertainty,
            dimensions: r.dimensions ?? prev.dimensions,
            primaryDrivers: r.primary_drivers ?? prev.primaryDrivers,
            policyRecommendation: r.policy_recommendation ?? prev.policyRecommendation,
          }));
        }
      });
    }
  }, [selectedCall]);

  const fetchCalls = useCallback(async () => {
    try {
      await ApiClient.ensureAuth();
      const res = await ApiClient.get('/calls');
      console.info('[CALLS-DEBUG] fetchCalls:', res);
      if (res.success && res.data && res.data.length > 0) {
        setCalls(res.data);
        if (!selectedCallRef.current) {
          setSelectedCall(res.data[0]);
        }
      } else {
        setCalls([]);
        setSelectedCall(null);
      }
    } catch (err: any) {
      console.warn('[CALLS-DEBUG] fetchCalls error:', err);
      setCalls([]);
      setSelectedCall(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await ApiClient.ensureAuth();
      if (mounted) {
        await fetchCalls();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchCalls]);

  const handleWebSocketMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('[WS-RECV]', msg.type, msg.callId || '', msg.error || msg.message || (msg.sequenceNumber !== undefined ? `seq:${msg.sequenceNumber}` : ''));

      if (msg.type === 'AUTHENTICATED') {
        isWsAuthenticatedRef.current = true;
      }

      // Error Handling & Re-authentication
      if (msg.type === 'ERROR') {
        console.warn('WS Server Event Error:', msg.error, msg.message);
        if (msg.error === 'UNAUTHENTICATED' || msg.error === 'AUTH_REQUIRED') {
          isWsAuthenticatedRef.current = false;
          ApiClient.ensureAuth().then((freshToken) => {
            if (freshToken && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: freshToken } }));
            }
          });
        }
        return;
      }

      // Strict Session Isolation: Drop events destined for other call sessions
      if (msg.callId && selectedCallRef.current && msg.callId !== selectedCallRef.current.id) {
        return;
      }

      // Phase 5 Unified Risk Assessment Broadcast
      if (msg.type === 'UNIFIED_RISK_ASSESSMENT' && msg.payload) {
        const r = msg.payload;
        const credTheft = r.dimensions?.credential_theft;
        console.log('[UI-RISK]', {
          sequenceNumber: msg.sequenceNumber,
          credential_theft: credTheft,
          overall: r.overall_risk_score,
          policy: r.policy_recommendation?.policy_id,
        });

        if (typeof msg.sequenceNumber === 'number') {
          const hasElevatedThreat = r.dimensions && (
            Object.values(r.dimensions).some((v: any) => typeof v === 'number' && v >= 50) ||
            r.policy_recommendation?.is_triggered
          );
          if (msg.sequenceNumber < latestRiskSeqRef.current && !hasElevatedThreat) {
            return;
          }
          if (msg.sequenceNumber > latestRiskSeqRef.current) {
            latestRiskSeqRef.current = msg.sequenceNumber;
          }
        }

        const validScore = typeof r.overall_risk_score === 'number' && Number.isFinite(r.overall_risk_score)
          ? r.overall_risk_score
          : null;

        const incomingDimensions = r.dimensions || {};
        setUnifiedRisk((prev) => {
          const mergedDimensions = { ...prev.dimensions };
          for (const key of Object.keys(mergedDimensions) as (keyof typeof mergedDimensions)[]) {
            const incomingVal = incomingDimensions[key];
            if (typeof incomingVal === 'number' && Number.isFinite(incomingVal)) {
              // Retain active threat findings across transient neutral acoustic ticks
              if (incomingVal === 0 && (prev.dimensions[key] ?? 0) >= 50) {
                continue;
              }
              mergedDimensions[key] = incomingVal;
            } else if (incomingVal !== undefined && incomingVal !== null) {
              mergedDimensions[key] = incomingVal;
            }
          }

          const mergedPolicy = r.policy_recommendation?.is_triggered
            ? r.policy_recommendation
            : (prev.policyRecommendation?.is_triggered ? prev.policyRecommendation : r.policy_recommendation);

          return {
            ...prev,
            overallRiskScore: validScore !== null ? Math.max(validScore, prev.overallRiskScore ?? 0) : prev.overallRiskScore,
            riskLevel: (r.risk_level && r.risk_level !== 'SAFE' && r.risk_level !== 'LOW') ? r.risk_level : (prev.riskLevel || r.risk_level),
            confidence: typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : prev.confidence,
            uncertainty: typeof r.uncertainty === 'number' && Number.isFinite(r.uncertainty) ? r.uncertainty : prev.uncertainty,
            dimensions: mergedDimensions,
            riskVelocity: typeof r.risk_velocity === 'number' && Number.isFinite(r.risk_velocity) ? r.risk_velocity : prev.riskVelocity,
            riskTrajectoryTrend: r.risk_trajectory_trend || prev.riskTrajectoryTrend,
            primaryDrivers: Array.isArray(r.primary_drivers) && r.primary_drivers.length > 0 ? r.primary_drivers : prev.primaryDrivers,
            contradictingSignals: Array.isArray(r.contradicting_signals) ? r.contradicting_signals : prev.contradictingSignals,
            evidenceGraph: r.evidence_graph || prev.evidenceGraph,
            policyRecommendation: mergedPolicy,
            humanWorkflowState: r.human_workflow_state || prev.humanWorkflowState,
            fusionLatencyMs: typeof r.fusion_latency_ms === 'number' && Number.isFinite(r.fusion_latency_ms) ? r.fusion_latency_ms : prev.fusionLatencyMs,
          };
        });
      }

      // Policy Enforcement Trigger Broadcast
      if (msg.type === 'POLICY_ENFORCEMENT_TRIGGER' && msg.payload) {
        console.log('[UI-POLICY]', msg.payload);
        setUnifiedRisk((prev) => ({
          ...prev,
          policyRecommendation: msg.payload,
        }));
      }

      // Telemetry Broadcast
      if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
        const p = msg.payload;
        const conv = p.conversation || {};
        setTelemetry((prev) => ({
          ...prev,
          overallAssessment: p.overall_assessment || prev.overallAssessment,
          deepfake: {
            status: p.deepfake?.status || prev.deepfake.status,
            spoofScore: typeof p.deepfake?.spoof_score === 'number' ? p.deepfake.spoof_score : prev.deepfake.spoofScore,
            confidence: p.deepfake?.confidence ?? prev.deepfake.confidence,
            uncertainty: p.deepfake?.uncertainty ?? prev.deepfake.uncertainty,
            artifacts: p.deepfake?.artifacts_detected || [],
            explainability: p.deepfake?.explainability || prev.deepfake.explainability,
            latencyMs: p.deepfake?.inference_latency_ms || 1.8,
          },
          speaker: {
            status: p.speaker?.status || prev.speaker.status,
            similarityScore: typeof p.speaker?.similarity_score === 'number' ? p.speaker.similarity_score : prev.speaker.similarityScore,
            confidence: p.speaker?.confidence ?? prev.speaker.confidence,
            isEnrolled: p.speaker?.is_enrolled ?? prev.speaker.isEnrolled,
            enrolledSpeakerId: p.speaker?.enrolled_speaker_id || prev.speaker.enrolledSpeakerId,
            explainability: p.speaker?.explainability || prev.speaker.explainability,
          },
          replay: {
            status: p.replay?.status || prev.replay.status,
            replayProbability: typeof p.replay?.replay_probability === 'number' ? p.replay.replay_probability : prev.replay.replayProbability,
            confidence: p.replay?.confidence ?? prev.replay.confidence,
            explainability: p.replay?.explainability || prev.replay.explainability,
          },
          manipulation: {
            level: p.manipulation?.level || prev.manipulation.level,
            indicators: p.manipulation?.indicators || [],
          },
          vad: {
            state: p.vad?.state || prev.vad.state,
            speechProbability: typeof p.vad?.speech_probability === 'number' ? p.vad.speech_probability : prev.vad.speechProbability,
          },
          quality: {
            rating: p.quality?.rating || prev.quality.rating,
            rmsDbfs: p.quality?.rms_dbfs ?? prev.quality.rmsDbfs,
            peakAmplitude: p.quality?.peak_amplitude ?? prev.quality.peakAmplitude,
            clippingRatio: p.quality?.clipping_ratio ?? prev.quality.clippingRatio,
            snrEstimateDb: p.quality?.snr_estimate_db ?? prev.quality.snrEstimateDb,
            notes: p.quality?.notes || prev.quality.notes,
          },
          temporal: {
            accumulatedSpeechSec: p.temporal_metrics?.accumulated_speech_seconds ?? prev.temporal.accumulatedSpeechSec,
            isWarmedUp: p.temporal_metrics?.is_warmed_up ?? prev.temporal.isWarmedUp,
          },
          conversation: {
            transcript: conv.asr?.transcript || prev.conversation.transcript,
            redactedTranscript: conv.asr?.redacted_transcript || prev.conversation.redactedTranscript,
            language: conv.asr?.language ? `${conv.asr.language.toUpperCase()}` : prev.conversation.language,
            languageConfidence: conv.asr?.language_confidence ?? prev.conversation.languageConfidence,
            asrConfidence: conv.asr?.confidence ?? prev.conversation.asrConfidence,
            asrUncertainty: conv.asr?.uncertainty ?? prev.conversation.asrUncertainty,
            intent: conv.intent?.primary_intent || prev.conversation.intent,
            isAdversarialIntent: conv.intent?.is_adversarial ?? prev.conversation.isAdversarialIntent,
            requestedAction: conv.requested_action?.target_object || prev.conversation.requestedAction,
            actionType: conv.requested_action?.action_type || prev.conversation.actionType,
            isHighRiskAction: conv.requested_action?.is_high_risk ?? prev.conversation.isHighRiskAction,
            tactics: conv.social_engineering?.tactics_detected || prev.conversation.tactics,
            progressionState: conv.social_engineering?.progression_state || prev.conversation.progressionState,
            sequenceScore: conv.social_engineering?.attack_sequence_score ?? prev.conversation.sequenceScore,
            highestSeverity: conv.sensitive_data?.highest_severity || prev.conversation.highestSeverity,
            claims: conv.caller_claims?.map((c: any) => ({ identity: c.claimed_identity, org: c.organization, turn: c.stated_turn_index })) || prev.conversation.claims,
            inconsistencies: conv.inconsistencies || prev.conversation.inconsistencies,
            currentPhase: conv.current_phase || prev.conversation.currentPhase,
            nlpLatencyMs: conv.total_nlp_latency_ms || prev.conversation.nlpLatencyMs,
          },
          totalAiLatencyMs: p.pipeline_latency_ms || prev.totalAiLatencyMs,
          evidenceSummary: p.evidence_summary || prev.evidenceSummary,
        }));
      }
    } catch {}
  };

  const ensureWebSocketConnected = async (): Promise<WebSocket> => {
    const token = (await ApiClient.ensureAuth()) || ApiClient.getToken() || '';

    return new Promise((resolve, reject) => {
      // 1. If already OPEN and authenticated, resolve immediately
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isWsAuthenticatedRef.current) {
        resolve(wsRef.current);
        return;
      }

      // Helper to listen for AUTHENTICATED on an existing connection
      const waitForAuth = (targetWs: WebSocket) => {
        let authTimer: any = null;
        const onMsg = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'AUTHENTICATED') {
              if (authTimer) clearTimeout(authTimer);
              targetWs.removeEventListener('message', onMsg);
              isWsAuthenticatedRef.current = true;
              console.log('[WS-AUTH] Authenticated successfully');
              resolve(targetWs);
            }
          } catch {}
        };
        authTimer = setTimeout(() => {
          targetWs.removeEventListener('message', onMsg);
          console.warn('[WS-AUTH-TIMEOUT] Resolving after timeout — server may be slow');
          resolve(targetWs);
        }, 10000);
        targetWs.addEventListener('message', onMsg);
      };

      // 2. If existing socket is OPEN but waiting for auth:
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
        waitForAuth(wsRef.current);
        return;
      }

      // 3. If existing socket is CONNECTING:
      if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
        const existingWs = wsRef.current;
        existingWs.addEventListener(
          'open',
          () => {
            existingWs.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
            waitForAuth(existingWs);
          },
          { once: true }
        );
        return;
      }

      // 4. Create new socket
      try {
        const ws = new WebSocket(WS_BASE);
        wsRef.current = ws;
        isWsAuthenticatedRef.current = false;

        let authTimeout: any = null;

        const onMessageHandler = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'AUTHENTICATED') {
              if (authTimeout) clearTimeout(authTimeout);
              ws.removeEventListener('message', onMessageHandler);
              isWsAuthenticatedRef.current = true;
              console.log('[WS-AUTH] Authenticated successfully');
              resolve(ws);
            }
          } catch {}
        };

        ws.onopen = () => {
          console.log('[WS-OPEN] Connected. Token present:', Boolean(token), 'Length:', token?.length);
          ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
          // Start auth timeout only AFTER socket is actually open and AUTHENTICATE has been transmitted
          authTimeout = setTimeout(() => {
            console.warn('[WS-AUTH-TIMEOUT] Resolving after timeout — server may be slow');
            resolve(ws);
          }, 10000);
        };

        // Set permanent message handler first, then auth-specific listener
        ws.onmessage = handleWebSocketMessage;
        ws.addEventListener('message', onMessageHandler);

        ws.onerror = (err) => {
          console.warn('WebSocket connection error:', err);
          isWsAuthenticatedRef.current = false;
        };

        ws.onclose = () => {
          if (authTimeout) clearTimeout(authTimeout);
          isWsAuthenticatedRef.current = false;
          wsRef.current = null;
        };
      } catch (e) {
        reject(e);
      }
    });
  };

  const startMicStreaming = async () => {
    setMicError(null);
    const call = selectedCallRef.current || selectedCall;
    if (!call) {
      setMicError('No active call session selected');
      return;
    }

    try {
      const ws = await ensureWebSocketConnected();
      const streamId = `stream-${Date.now()}`;
      ws.send(
        JSON.stringify({
          type: 'START_STREAM',
          callId: call.id,
          streamId,
        })
      );

      currentMicTranscriptRef.current = '';
      if (typeof window !== 'undefined') {
        (window as any).__setSpeechHint = (phrase: string) => {
          currentMicTranscriptRef.current = phrase;
          console.log('[SPEECH_HINT] transcript =', phrase);
        };
      }

      if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        try {
          const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          console.log('[SPEECH_HINT] SpeechRecognition initialized and starting');
          rec.onstart = () => {
            console.log('[SPEECH_HINT] SpeechRecognition started');
          };
          rec.onresult = (e: any) => {
            let fullText = '';
            for (let i = 0; i < e.results.length; ++i) {
              fullText += e.results[i][0].transcript + ' ';
            }
            if (fullText.trim()) {
              currentMicTranscriptRef.current = fullText.trim();
              console.log('[SPEECH_HINT] transcript =', currentMicTranscriptRef.current);
            }
          };
          rec.onerror = (err: any) => {
            console.warn('[SPEECH_HINT] SpeechRecognition error:', err?.error || err);
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch (recErr) {
          console.warn('[SPEECH_HINT] Failed to start SpeechRecognition:', recErr);
        }
      } else {
        console.log('[SPEECH_HINT] SpeechRecognition not natively supported in this headless environment');
      }

      const streamer = new BrowserAudioStreamer({
        sampleRate: 16000,
        bufferSize: 4096,
        onChunk: (base64Audio, seq, rmsDb) => {
          setMicRmsDb(rmsDb);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && (selectedCallRef.current || selectedCall)) {
            const hint = currentMicTranscriptRef.current;
            wsRef.current.send(
              JSON.stringify({
                type: 'AUDIO_CHUNK',
                callId: (selectedCallRef.current || selectedCall)!.id,
                sequenceNumber: seq,
                payload: {
                  format: 'pcm_s16le',
                  sample_rate: 16000,
                  channels: 1,
                  audio_base64: base64Audio,
                  claimedSpeakerId: claimedSpeakerIdRef.current || claimedSpeakerId,
                  ...(hint ? { text_transcript: hint, transcript: hint } : {}),
                },
              })
            );
          }
        },
        onStateChange: (state, error) => {
          setMicState(state);
          if (error) {
            setMicError(error);
          }
        },
      });

      audioStreamerRef.current = streamer;
      await streamer.start();
      setIsStreaming(true);
      setStreamSource('MIC');
    } catch (err: any) {
      setMicState('ERROR');
      setMicError(err.message || 'Microphone initialization failed');
      setIsStreaming(false);
    }
  };

  const startSyntheticToneStreaming = async () => {
    setMicError(null);
    const call = selectedCallRef.current || selectedCall;
    if (!call) {
      setMicError('No active call session selected');
      return;
    }

    try {
      const ws = await ensureWebSocketConnected();
      const streamId = `stream-${Date.now()}`;
      ws.send(
        JSON.stringify({
          type: 'START_STREAM',
          callId: call.id,
          streamId,
        })
      );

      let chunkIdx = 0;
      const activeScenario = THREAT_SCENARIOS.find((s) => s.id === selectedScenario) || THREAT_SCENARIOS[0];
      const scenarioText = activeScenario.transcript;
      const scenarioSpeaker = activeScenario.claimedSpeaker || claimedSpeakerIdRef.current || claimedSpeakerId;

      // Reset sequence tracker so the new scenario immediately registers in HUD
      latestRiskSeqRef.current = -1;

      // 4800 samples (300ms @ 16kHz) per 250ms tick satisfies full neural feature extraction
      audioIntervalRef.current = setInterval(() => {
        const buffer = new Int16Array(4800);
        for (let i = 0; i < buffer.length; i++) {
          if (activeScenario.id === 'ACOUSTIC_DEEPFAKE') {
            // Neural vocoder phase distortion and synthetic spectral anomalies
            buffer[i] = (Math.sin((2 * Math.PI * 440 * i) / 16000) * 8000) +
                        (Math.sin((2 * Math.PI * 1760 * i) / 16000) * 4000) +
                        (i % 40 === 0 ? 5000 : 0);
          } else if (activeScenario.id === 'REPLAY_ATTACK') {
            // Loudspeaker replay with secondary room reverberation decay
            const direct = Math.sin((2 * Math.PI * 520 * i) / 16000) * 8000;
            const echo = i > 320 ? Math.sin((2 * Math.PI * 520 * (i - 320)) / 16000) * 4500 : 0;
            buffer[i] = direct + echo;
          } else {
            // Standard linear PCM carrier tone
            buffer[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 12000;
          }
        }
        const uint8 = new Uint8Array(buffer.buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && (selectedCallRef.current || selectedCall)) {
          wsRef.current.send(
            JSON.stringify({
              type: 'AUDIO_CHUNK',
              callId: (selectedCallRef.current || selectedCall)!.id,
              sequenceNumber: chunkIdx++,
              payload: {
                format: 'pcm_s16le',
                sample_rate: 16000,
                channels: 1,
                audio_base64: base64,
                text_transcript: scenarioText,
                transcript: scenarioText,
                claimedSpeakerId: scenarioSpeaker,
                metadata: {
                  scenarioId: activeScenario.id,
                  targetDimension: activeScenario.dimension,
                },
              },
            })
          );
        }
      }, 250);

      setIsStreaming(true);
      setStreamSource('SYNTHETIC');
      setMicState('STREAMING');
    } catch (err: any) {
      setMicState('ERROR');
      setMicError(err.message || 'Stream initialization failed');
      setIsStreaming(false);
    }
  };

  const stopStreaming = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
    currentMicTranscriptRef.current = '';

    if (audioStreamerRef.current) {
      audioStreamerRef.current.stop();
      audioStreamerRef.current = null;
    }
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    const currentCall = selectedCallRef.current || selectedCall;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentCall) {
      wsRef.current.send(JSON.stringify({ type: 'END_STREAM', callId: currentCall.id }));
    }
    setIsStreaming(false);
    setMicState('STOPPED');
    setMicRmsDb(-96);
    setTelemetry(INITIAL_TELEMETRY);
  };

  const handleApproveIntervention = async () => {
    if (!selectedCall) return;
    try {
      const res = await ApiClient.post('/interventions/recommend', {
        callId: selectedCall.id,
        level: 'LEVEL_2_STEP_UP_VERIFICATION',
        actionType: 'REQUIRE_STEP_UP_VERIFICATION',
        policyId: unifiedRisk.policyRecommendation?.policy_id || 'POL-CRED-001',
        evidenceSummary: unifiedRisk.primaryDrivers,
      });

      if (res.success && res.data?.id) {
        await ApiClient.post('/interventions/decision', {
          interventionId: res.data.id,
          decision: 'APPROVED',
          reason: 'SOC Analyst authorized out-of-band step-up challenge upon credential harvesting detection.',
        });
      }

      setUnifiedRisk((prev) => ({ ...prev, humanWorkflowState: 'EXECUTED' }));
      setInterventionFeedback('Action Approved: Out-of-Band Step-Up Challenge Dispatched & Persisted to Timeline.');
    } catch {
      setInterventionFeedback('Action Approved & Executed.');
    }
  };

  const handleOverrideIntervention = async () => {
    if (!selectedCall) return;
    try {
      const res = await ApiClient.post('/interventions/recommend', {
        callId: selectedCall.id,
        level: 'LEVEL_1_WARNING',
        actionType: 'OVERRIDE_POLICY',
        policyId: unifiedRisk.policyRecommendation?.policy_id || 'POL-CRED-001',
        evidenceSummary: ['Manual analyst override'],
      });

      if (res.success && res.data?.id) {
        await ApiClient.post('/interventions/decision', {
          interventionId: res.data.id,
          decision: 'OVERRIDDEN',
          reason: 'Analyst verified caller through secondary internal directory.',
        });
      }

      setUnifiedRisk((prev) => ({ ...prev, humanWorkflowState: 'OVERRIDDEN' }));
      setInterventionFeedback('Intervention Overridden by SOC Analyst with Audited Justification.');
    } catch {
      setInterventionFeedback('Intervention Overridden by SOC Analyst.');
    }
  };

  // Helper for rendering model status and score safely
  const renderSubsystemStatus = (
    rawStatus: string,
    rawScore: number | null,
    type: 'deepfake' | 'speaker' | 'replay' | 'vad'
  ) => {
    let status = rawStatus;
    let score = rawScore;

    // Fall back to canonical 10D risk tensor evaluation if telemetry was transiently unpopulated
    if (type === 'deepfake' && (score === null || status === 'NOT_AVAILABLE' || status === 'OFFLINE_OR_PENDING')) {
      const tensorVal = unifiedRisk.dimensions?.deepfake_synthetic;
      if (typeof tensorVal === 'number') {
        score = tensorVal / 100.0;
        status = tensorVal >= 50 ? 'DETECTED' : 'AUTHENTIC';
      }
    } else if (type === 'speaker' && (score === null || status === 'NOT_AVAILABLE' || status === 'OFFLINE_OR_PENDING')) {
      const tensorVal = unifiedRisk.dimensions?.identity_impersonation;
      if (typeof tensorVal === 'number') {
        const imp = tensorVal / 100.0;
        score = Math.max(0, 1.0 - imp);
        status = imp >= 50 ? 'MISMATCH' : (claimedSpeakerId === 'unknown-speaker' ? 'NOT_ENROLLED' : 'MATCH');
      }
    } else if (type === 'replay' && (score === null || status === 'NOT_AVAILABLE' || status === 'OFFLINE_OR_PENDING')) {
      const tensorVal = unifiedRisk.dimensions?.replay_injection;
      if (typeof tensorVal === 'number') {
        score = tensorVal / 100.0;
        status = tensorVal >= 50 ? 'REPLAY_DETECTED' : 'NOT_REPLAY';
      }
    }

    const isUnavailable = status === 'NOT_AVAILABLE' || status === 'OFFLINE_OR_PENDING' || status === 'UNAVAILABLE';
    const isStandby = status === 'STANDBY' || status === 'READY' || status === 'AWAITING_STREAM';
    const isInsufficient = status === 'INSUFFICIENT_AUDIO';
    const isError = status === 'ERROR';

    let badgeText = status.replace(/_/g, ' ');
    let badgeClass = 'bg-slate-800 text-slate-400 border border-slate-700';
    let scoreDisplay = '—';

    if (isUnavailable) {
      badgeText = 'AI NOT AVAILABLE';
      badgeClass = 'bg-slate-800/80 text-amber-300/80 border border-amber-500/20';
      scoreDisplay = '—';
    } else if (isStandby) {
      badgeText = 'READY';
      badgeClass = 'bg-slate-800 text-cyan-400 border border-cyan-500/30';
      scoreDisplay = '—';
    } else if (isInsufficient) {
      badgeText = 'EVALUATING...';
      badgeClass = 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/30';
      scoreDisplay = '—';
    } else if (isError) {
      badgeText = 'ERROR';
      badgeClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
      scoreDisplay = '—';
    } else {
      if (typeof score === 'number' && isFinite(score)) {
        const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
        scoreDisplay = `${pct}%`;
      }

      if (type === 'deepfake') {
        if (status === 'DETECTED' || status === 'SPOOF' || status === 'SUSPICIOUS' || (score !== null && score >= 0.685)) {
          badgeText = 'DETECTED';
          badgeClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
        } else if (status === 'AUTHENTIC' || status === 'NOT_DETECTED' || (score !== null && score < 0.50)) {
          badgeText = 'AUTHENTIC';
          badgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        } else if (status === 'INCONCLUSIVE') {
          badgeText = 'INCONCLUSIVE';
          badgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
        }
      } else if (type === 'speaker') {
        if (status === 'MATCH') {
          badgeText = 'MATCH';
          badgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        } else if (status === 'MISMATCH') {
          badgeText = 'MISMATCH';
          badgeClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
        } else if (status === 'NOT_ENROLLED') {
          badgeText = 'UNENROLLED';
          badgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
        }
      } else if (type === 'replay') {
        if (status === 'REPLAY_DETECTED' || status === 'DETECTED' || status === 'LIKELY_REPLAY') {
          badgeText = 'REPLAY DETECTED';
          badgeClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
        } else if (status === 'NOT_REPLAY' || status === 'AUTHENTIC') {
          badgeText = 'NOT REPLAY';
          badgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        } else if (status === 'UNCERTAIN') {
          badgeText = 'UNCERTAIN';
          badgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
        }
      } else if (type === 'vad') {
        if (status === 'SPEECH' || (typeof score === 'number' && score > 0.5)) {
          badgeText = 'SPEECH';
          badgeClass = 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
        } else if (status === 'SILENCE') {
          badgeText = 'SILENCE';
          badgeClass = 'bg-slate-800 text-slate-400 border border-slate-700';
        } else {
          badgeText = 'LISTENING';
          badgeClass = 'bg-slate-800 text-slate-400 border border-slate-700';
        }
      }
    }

    return { badgeText, badgeClass, scoreDisplay };
  };

  const dfView = renderSubsystemStatus(telemetry.deepfake.status, telemetry.deepfake.spoofScore, 'deepfake');
  const spView = renderSubsystemStatus(telemetry.speaker.status, telemetry.speaker.similarityScore, 'speaker');
  const rpView = renderSubsystemStatus(telemetry.replay.status, telemetry.replay.replayProbability, 'replay');
  const vadView = renderSubsystemStatus(telemetry.vad.state, telemetry.vad.speechProbability, 'vad');

  // Threat badge state
  const isEvaluated = typeof unifiedRisk.overallRiskScore === 'number';
  const riskScoreText = isEvaluated ? `${unifiedRisk.overallRiskScore!.toFixed(1)}/100` : 'PENDING';

  return (
    <div className="flex h-screen bg-[#05070d] text-slate-100 overflow-hidden font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Navbar title="Live SOC Command Center" subtitle="Real-Time Voice Defense & Multi-Modal Threat Fusion" />

        <main className="p-6 space-y-6">
          <Phase1Notice />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>Live Voice Session Command Center</span>
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Real-Time 10D Threat Tensor Fusion, Deterministic Policy Enforcement, and Step-Up Orchestration
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-slate-400">Claimed Identity:</label>
              <select
                value={claimedSpeakerId}
                onChange={(e) => setClaimedSpeakerId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              >
                <option value="speaker-cfo-001">Enrolled CFO (speaker-cfo-001)</option>
                <option value="speaker-admin-002">Enrolled SysAdmin (speaker-admin-002)</option>
                <option value="unknown-speaker">Unenrolled Unknown Speaker</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Active Calls Feed */}
            <div className="soc-glass p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                  Active Call Sessions ({calls.length})
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>

              <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
                {calls.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs">
                    <PhoneCall className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                    <p>No active call sessions.</p>
                  </div>
                ) : (
                  calls.map((call) => (
                    <div
                      key={call.id}
                      onClick={() => setSelectedCall(call)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedCall?.id === call.id
                          ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-500/10'
                          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono">{call.callerIdentifier}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                          {call.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{call.callerDisplayName || 'Telephony Audio Channel'}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-2 pt-2 border-t border-slate-800/60">
                        <span>{call.direction}</span>
                        <span>{formatSafeTime(call.createdAt, 'NO TELEMETRY RECORDED')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right: Live Telemetry & Phase 5 Decision Console */}
            <div className="lg:col-span-2 soc-glass p-5 rounded-xl border border-slate-800 space-y-5">
              {selectedCall ? (
                <>
                  {/* Top Bar: Call Identification & Live Audio Controls */}
                  <div className="flex flex-col gap-3 pb-3 border-b border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-white font-mono">{selectedCall.callerIdentifier}</h2>
                          {isEvaluated ? (
                            <span
                              className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                unifiedRisk.riskLevel === 'CRITICAL'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                  : unifiedRisk.riskLevel === 'HIGH'
                                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                                  : unifiedRisk.riskLevel === 'ELEVATED' || unifiedRisk.riskLevel === 'GUARDED' || unifiedRisk.riskLevel === 'MONITOR'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : unifiedRisk.riskLevel === 'LOW' || unifiedRisk.riskLevel === 'SAFE'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-slate-700/40 text-slate-300 border border-slate-600/40'
                              }`}
                            >
                              {unifiedRisk.riskLevel} THREAT ({riskScoreText})
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                              THREAT STATUS: EVALUATION PENDING
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          Session: {selectedCall.id} • Latency: {formatLatency(unifiedRisk.fusionLatencyMs || telemetry.totalAiLatencyMs)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isStreaming ? (
                          <>
                            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
                              <span className="text-[10px] uppercase font-mono text-slate-400 font-semibold">Scenario:</span>
                              <select
                                id="threat-scenario-select"
                                value={selectedScenario}
                                onChange={(e) => setSelectedScenario(e.target.value)}
                                className="bg-transparent text-xs text-cyan-300 font-mono font-semibold focus:outline-none cursor-pointer"
                                title="Select threat scenario to evaluate in Live Calls"
                              >
                                {THREAT_SCENARIOS.map((s) => (
                                  <option key={s.id} value={s.id} className="bg-slate-900 text-slate-200">
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={startMicStreaming}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/20"
                            >
                              <Mic className="w-3.5 h-3.5" />
                              <span>Stream Live Mic</span>
                            </button>
                            <button
                              id="test-scream-btn"
                              onClick={startSyntheticToneStreaming}
                              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20"
                              title="Stream calibrated synthetic audio scenario to evaluate selected threat dimension"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Test Scream</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={stopStreaming}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                          >
                            <Square className="w-3.5 h-3.5" />
                            <span>Stop Stream</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Active Threat Dimension Alert (Covers all 10 dimensions) */}
                    {(() => {
                      const THREAT_ALERT_MAPPINGS: Record<string, { title: string; desc: string }> = {
                        credential_theft: {
                          title: 'CRITICAL CREDENTIAL THEFT SOLICITATION DETECTED',
                          desc: 'Caller actively solicited one-time password (OTP) / authentication credentials. Step-up policy verification triggered.',
                        },
                        financial_fraud: {
                          title: 'CRITICAL FINANCIAL FRAUD / WIRE TRANSFER DETECTED',
                          desc: 'Unauthorized high-value fund transfer or beneficiary account modification requested. Transaction hold recommended.',
                        },
                        account_takeover: {
                          title: 'CRITICAL ACCOUNT TAKEOVER / REMOTE ACCESS DETECTED',
                          desc: 'Adversary instructed victim to install remote desktop software (AnyDesk) or surrender control of workstation.',
                        },
                        verification_bypass: {
                          title: 'CRITICAL VERIFICATION BYPASS COERCION DETECTED',
                          desc: 'Caller attempted to coerce operator into skipping out-of-band identity verification controls.',
                        },
                        social_engineering: {
                          title: 'HIGH CONVERSATIONAL SOCIAL ENGINEERING DETECTED',
                          desc: 'Coercive authority exploitation, artificial urgency, or fear tactics detected across dialogue turns.',
                        },
                        deepfake_synthetic: {
                          title: 'CRITICAL ACOUSTIC DEEPFAKE / SYNTHETIC VOICE DETECTED',
                          desc: 'Neural vocoder phase jitter, unnatural spectral consistency, or synthetic voice artifacts detected in audio stream.',
                        },
                        identity_impersonation: {
                          title: 'CRITICAL SPEAKER BIOMETRIC MISMATCH DETECTED',
                          desc: 'Caller acoustic voiceprint contradicts enrolled biometric identity profile for claimed speaker identity.',
                        },
                        replay_injection: {
                          title: 'ELEVATED REPLAY / LOUDSPEAKER INJECTION DETECTED',
                          desc: 'Physical loudspeaker acoustic roll-off and secondary room reverberation decay detected in stream.',
                        },
                        inconsistency: {
                          title: 'HIGH DIALOGUE CLAIM INCONSISTENCY DETECTED',
                          desc: 'Contradictory caller identities, organizations, or factual assertions detected across turns.',
                        },
                      };

                      const elevatedThreats = Object.entries(unifiedRisk.dimensions)
                        .filter(([k, v]) => k !== 'overall' && typeof v === 'number' && (v ?? 0) >= 50)
                        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
                      const dominantThreat = elevatedThreats[0];
                      const dominantInfo = dominantThreat ? (THREAT_ALERT_MAPPINGS[dominantThreat[0]] || {
                        title: `CRITICAL ${dominantThreat[0].toUpperCase()} DETECTED`,
                        desc: `Elevated risk detected on ${dominantThreat[0]} dimension. Score: ${(dominantThreat[1] as number).toFixed(1)}/100.`
                      }) : null;

                      if (!dominantThreat || !dominantInfo) return null;

                      return (
                        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs font-mono text-rose-300 flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="block text-white font-bold">
                              {dominantInfo.title}
                            </strong>
                            <span>
                              {dominantInfo.desc}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Dominant Threat Summary & Contributing Signals */}
                    <DominantThreatCard
                      overallRiskScore={unifiedRisk.overallRiskScore}
                      riskLevel={unifiedRisk.riskLevel}
                      confidence={unifiedRisk.confidence}
                      velocity={unifiedRisk.riskVelocity}
                      dimensions={unifiedRisk.dimensions}
                      policyId={unifiedRisk.policyRecommendation?.policy_id}
                      policyExplanation={unifiedRisk.policyRecommendation?.explanation}
                    />

                    {/* Microphone Stream Health Bar */}
                    {isStreaming && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-indigo-500/30 text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span className="text-slate-300">
                            Source: <strong className="text-indigo-300">{streamSource === 'MIC' ? 'BROWSER MICROPHONE (16 kHz PCM)' : 'SYNTHETIC TEST BENCH'}</strong>
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-[10px]">
                            {micState}
                          </span>
                        </div>
                        {streamSource === 'MIC' && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-[10px]">Input Energy:</span>
                            <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-400 transition-all duration-75"
                                style={{ width: `${Math.max(0, Math.min(100, (micRmsDb + 60) * 2))}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400">{micRmsDb > -90 ? `${micRmsDb.toFixed(0)} dB` : 'MUTE'}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {micError && (
                      <div className="px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs font-mono text-rose-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span><strong>Microphone Error:</strong> {micError}</span>
                      </div>
                    )}
                  </div>

                  {/* Subsystem Model Status Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* Deepfake */}
                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1 font-mono text-xs">
                      <span className="text-slate-400 text-[10px] block uppercase font-semibold">Acoustic Deepfake</span>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${dfView.badgeClass}`}>
                          {dfView.badgeText}
                        </span>
                        <span className="text-white font-bold">{dfView.scoreDisplay}</span>
                      </div>
                    </div>

                    {/* Biometric Speaker */}
                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1 font-mono text-xs">
                      <span className="text-slate-400 text-[10px] block uppercase font-semibold">Speaker Match</span>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${spView.badgeClass}`}>
                          {spView.badgeText}
                        </span>
                        <span className="text-white font-bold">{spView.scoreDisplay}</span>
                      </div>
                    </div>

                    {/* Replay */}
                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1 font-mono text-xs">
                      <span className="text-slate-400 text-[10px] block uppercase font-semibold">Replay Attack</span>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${rpView.badgeClass}`}>
                          {rpView.badgeText}
                        </span>
                        <span className="text-white font-bold">{rpView.scoreDisplay}</span>
                      </div>
                    </div>

                    {/* VAD */}
                    <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1 font-mono text-xs">
                      <span className="text-slate-400 text-[10px] block uppercase font-semibold">Voice Activity</span>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${vadView.badgeClass}`}>
                          {vadView.badgeText}
                        </span>
                        <span className="text-white font-bold">{vadView.scoreDisplay}</span>
                      </div>
                    </div>
                  </div>

                  {/* 10-Dimensional Multi-Modal Risk Matrix HUD */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-400" />
                        10-Dimensional Unified Risk Tensor
                      </span>
                      <div className="flex items-center gap-3 text-[11px] font-mono">
                        <span className="text-slate-400">
                          Confidence:{' '}
                          <strong className="text-emerald-400">
                            {typeof unifiedRisk.confidence === 'number' ? `${(unifiedRisk.confidence * 100).toFixed(0)}%` : 'PENDING'}
                          </strong>
                        </span>
                        <span className="text-slate-400 flex items-center gap-1">
                          Velocity: <TrendingUp className="w-3 h-3 text-rose-400" />
                          <strong className="text-rose-400">+{unifiedRisk.riskVelocity ?? 0}/s</strong>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                      {[
                        { key: 'credential_theft', name: 'Credential Theft', val: unifiedRisk.dimensions.credential_theft },
                        { key: 'social_engineering', name: 'Social Engineering', val: unifiedRisk.dimensions.social_engineering },
                        { key: 'verification_bypass', name: 'Verification Bypass', val: unifiedRisk.dimensions.verification_bypass },
                        { key: 'financial_fraud', name: 'Financial Fraud', val: unifiedRisk.dimensions.financial_fraud },
                        { key: 'identity_impersonation', name: 'Identity Impersonation', val: unifiedRisk.dimensions.identity_impersonation },
                        { key: 'account_takeover', name: 'Account Takeover', val: unifiedRisk.dimensions.account_takeover },
                        { key: 'deepfake_synthetic', name: 'Deepfake / Synthetic', val: unifiedRisk.dimensions.deepfake_synthetic },
                        { key: 'replay_injection', name: 'Replay / Injection', val: unifiedRisk.dimensions.replay_injection },
                        { key: 'inconsistency', name: 'Signal Inconsistency', val: unifiedRisk.dimensions.inconsistency },
                        { key: 'overall', name: 'Overall Composite', val: unifiedRisk.dimensions.overall },
                      ].map((dim) => (
                        <RiskTensorCard
                          key={dim.key}
                          name={dim.name}
                          score={dim.val}
                          highlight={dim.key === 'overall'}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Forensic Evidence & Explainability Panel */}
                  <EvidenceExplainer
                    what={
                      (unifiedRisk.dimensions.credential_theft ?? 0) >= 70
                        ? 'Critical Credential Theft Solicitation Detected'
                        : (unifiedRisk.dimensions.financial_fraud ?? 0) >= 70
                        ? 'High-Risk Financial Transfer Solicitation'
                        : (unifiedRisk.dimensions.account_takeover ?? 0) >= 70
                        ? 'Remote Access Software Solicitation (Account Takeover)'
                        : (unifiedRisk.dimensions.verification_bypass ?? 0) >= 60
                        ? 'Verification Bypass Solicitation Detected'
                        : unifiedRisk.policyRecommendation?.policy_id
                        ? `Policy Rule Triggered: ${unifiedRisk.policyRecommendation.policy_id}`
                        : null
                    }
                    why={unifiedRisk.policyRecommendation?.explanation || (unifiedRisk.primaryDrivers.length > 0 ? unifiedRisk.primaryDrivers.join('; ') : null)}
                    evidence={
                      currentMicTranscriptRef.current ||
                      (unifiedRisk.evidenceGraph?.nodes?.length ? unifiedRisk.evidenceGraph.nodes.map((n: any) => n.label || n.id) : null)
                    }
                    action={unifiedRisk.policyRecommendation?.action || (unifiedRisk.policyRecommendation?.is_triggered ? 'Require Step-Up Out-of-Band Verification Challenge' : null)}
                    primaryDrivers={unifiedRisk.primaryDrivers}
                    policyRule={unifiedRisk.policyRecommendation?.policy_id}
                  />

                  {/* Technical Engineering Telemetry Panel */}
                  <TechnicalTelemetryPanel
                    sampleRate={16000}
                    channels={1}
                    chunkDurationMs={300}
                    measuredLatencyMs={unifiedRisk.fusionLatencyMs || telemetry.totalAiLatencyMs}
                    aiState={telemetry.deepfake.status !== 'NOT_AVAILABLE' ? 'ONLINE' : 'AI NOT AVAILABLE'}
                    rmsDb={micRmsDb}
                    streamSource={streamSource}
                    deepfakeStatus={telemetry.deepfake.status}
                    speakerStatus={telemetry.speaker.status}
                    replayStatus={telemetry.replay.status}
                    vadStatus={telemetry.vad.state}
                  />

                  {/* Deterministic Policy Trigger & Decision Bar */}
                  {unifiedRisk.policyRecommendation?.is_triggered && (
                    <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 to-indigo-950/40 border border-rose-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-rose-400" />
                          <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                            Policy Trigger: {unifiedRisk.policyRecommendation.policy_id}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                          {unifiedRisk.humanWorkflowState}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 font-mono">
                        {unifiedRisk.policyRecommendation.explanation}
                      </p>

                      {interventionFeedback && (
                        <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{interventionFeedback}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2.5 pt-1">
                        <button
                          onClick={handleOverrideIntervention}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all border border-slate-700"
                        >
                          <XCircle className="w-3.5 h-3.5 text-slate-400" />
                          <span>Override / False Positive</span>
                        </button>
                        <button
                          onClick={handleApproveIntervention}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all shadow-md shadow-rose-500/20"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve & Dispatch Step-Up Challenge</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Redacted Live Transcript Stream */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
                        <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                        Pre-Persistence Redacted Transcript Stream
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold">
                        {telemetry.conversation.language} ({telemetry.conversation.intent})
                      </span>
                    </div>

                    <p className="text-xs font-mono text-slate-200 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
                      &ldquo;{telemetry.conversation.redactedTranscript || telemetry.conversation.transcript || 'Waiting for audio speech turn...'}&rdquo;
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-16 text-center text-slate-500 text-sm font-mono space-y-3">
                  <PhoneCall className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-slate-300 font-bold">No Call Session Selected</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Select a monitored session from the left queue or stream audio from the telephony gateway.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
