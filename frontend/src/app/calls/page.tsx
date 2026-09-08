'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { ApiClient, WS_BASE } from '@/lib/api';
import { BrowserAudioStreamer, MicStreamState } from '@/lib/audio_streamer';
import { formatSafeTime, formatLatency, getRiskSeverity, formatPercentage } from '@/lib/format';
import {
  PhoneCall,
  PhoneOff,
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
  Cpu,
  History,
  Volume2,
  Ban,
  FileSearch,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface CallSession {
  id: string;
  callerIdentifier: string;
  callerDisplayName?: string;
  direction?: 'INBOUND' | 'OUTBOUND';
  status: 'ACTIVE' | 'RINGING' | 'TERMINATED' | 'INITIALIZING' | 'VERIFYING' | 'FLAGGED' | 'BLOCKED';
  organizationId: string;
  claimedSpeakerId?: string;
  startedAt?: string;
  createdAt?: string;
  durationSeconds?: number;
}

interface ThreatScenarioOption {
  id: string;
  name: string;
  dimension: string;
  transcript: string;
  claimedSpeaker?: string;
  desc: string;
}

interface TranscriptTurn {
  id: string;
  timestamp: string;
  speaker: string;
  text: string;
  isAdversarial?: boolean;
  threatMarker?: string;
  policyId?: string;
}

interface RiskTransitionEvent {
  id: string;
  timestamp: string;
  score: number;
  level: string;
  driver?: string;
  policyId?: string;
}

const THREAT_SCENARIOS: ThreatScenarioOption[] = [
  {
    id: 'BENIGN_INQUIRY',
    name: '0. Legitimate Customer Call (Normal / Safe)',
    dimension: 'overall',
    transcript: 'Good morning, I would like to check my account balance and business hours please.',
    claimedSpeaker: 'speaker-cfo-001',
    desc: 'Authentic human voice with normal customer banking inquiry and zero adversarial threat indicators.',
  },
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
    desc: 'Acoustic feature analysis detecting vocoder phase jitter and spectral anomalies.',
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
    explainability: ['Awaiting audio stream for acoustic signal evaluation.'],
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
    redactedTranscript: '',
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
  const [selectedScenario, setSelectedScenario] = useState<string>('BENIGN_INQUIRY');

  // Real-time dynamic duration and streaming ticker
  const [timerTick, setTimerTick] = useState<number>(Date.now());
  const [streamDurationSeconds, setStreamDurationSeconds] = useState<number>(0);
  const streamStartRef = useRef<number | null>(null);
  const [activeStreamingCallId, setActiveStreamingCallId] = useState<string | null>(null);
  const activeStreamingCallIdRef = useRef<string | null>(null);

  // Live Telemetry State
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);

  // Live Multi-Modal Unified Risk & Decision State
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

  // Conversation turns and risk transition history
  const [transcriptTurns, setTranscriptTurns] = useState<TranscriptTurn[]>([]);
  const [riskTransitions, setRiskTransitions] = useState<RiskTransitionEvent[]>([]);
  const [interventionFeedback, setInterventionFeedback] = useState<string | null>(null);
  const [evidenceExpanded, setEvidenceExpanded] = useState(true);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);

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
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  // Active 1-second interval ticker for duration display
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick(Date.now());
      if (streamStartRef.current) {
        const sec = Math.max(0, Math.floor((Date.now() - streamStartRef.current) / 1000));
        setStreamDurationSeconds(sec);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    claimedSpeakerIdRef.current = claimedSpeakerId;
  }, [claimedSpeakerId]);

  // Scroll transcript workspace automatically when turns update
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcriptTurns, telemetry.conversation.transcript]);

  useEffect(() => {
    selectedCallRef.current = selectedCall;
    latestRiskSeqRef.current = -1;
    if (selectedCall) {
      // Reset telemetry and risk state when switching call
      setTelemetry(INITIAL_TELEMETRY);
      setTranscriptTurns([]);
      setRiskTransitions([]);
      setUnifiedRisk({
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
        riskVelocity: 0,
        riskTrajectoryTrend: 'STEADY',
        primaryDrivers: [],
        contradictingSignals: [],
        evidenceGraph: { nodes: [], edges: [] },
        policyRecommendation: null,
        humanWorkflowState: 'PENDING_EVALUATION',
        fusionLatencyMs: 0,
      });

      // Load initial risk assessment if already recorded in backend
      ApiClient.get(`/risk/${selectedCall.id}`).then((res) => {
        if (res.success && res.data) {
          const r = res.data;
          if (typeof r.overall_risk_score === 'number' && r.status !== 'NOT_AVAILABLE') {
            setUnifiedRisk((prev) => ({
              ...prev,
              overallRiskScore: r.overall_risk_score,
              riskLevel: r.risk_level ?? prev.riskLevel,
              confidence: typeof r.confidence === 'number' ? r.confidence : prev.confidence,
              uncertainty: typeof r.uncertainty === 'number' ? r.uncertainty : prev.uncertainty,
              dimensions: r.dimensions ?? prev.dimensions,
              primaryDrivers: r.primary_drivers ?? prev.primaryDrivers,
              policyRecommendation: r.policy_recommendation ?? prev.policyRecommendation,
            }));
          }
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
      console.log(
        '[WS-RECV]',
        msg.type,
        msg.callId || '',
        msg.error || msg.message || (msg.sequenceNumber !== undefined ? `seq:${msg.sequenceNumber}` : '')
      );

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
          if (msg.sequenceNumber < latestRiskSeqRef.current) {
            return; // Drop older evaluation that arrived out of order (stale-packet protection)
          }
          latestRiskSeqRef.current = msg.sequenceNumber;
        }

        const validScore =
          typeof r.overall_risk_score === 'number' && Number.isFinite(r.overall_risk_score)
            ? r.overall_risk_score
            : null;

        const incomingDimensions = r.dimensions || {};
        const newLevel = r.risk_level || 'LOW';

        // Track real-time risk transitions for timeline
        if (validScore !== null) {
          const timeString = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setRiskTransitions((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.level !== newLevel || Math.abs(last.score - validScore) >= 15) {
              const newEntry: RiskTransitionEvent = {
                id: `risk-trans-${Date.now()}-${prev.length}`,
                timestamp: timeString,
                score: validScore,
                level: newLevel,
                driver: Array.isArray(r.primary_drivers) && r.primary_drivers.length > 0 ? r.primary_drivers[0] : undefined,
                policyId: r.policy_recommendation?.policy_id,
              };
              return [...prev.slice(-7), newEntry];
            }
            return prev;
          });
        }

        setUnifiedRisk((prev) => {
          const mergedDimensions = { ...prev.dimensions };
          for (const key of Object.keys(mergedDimensions) as (keyof typeof mergedDimensions)[]) {
            const incomingVal = incomingDimensions[key];
            if (typeof incomingVal === 'number' && Number.isFinite(incomingVal)) {
              mergedDimensions[key] = incomingVal;
            } else if (incomingVal !== undefined && incomingVal !== null) {
              mergedDimensions[key] = incomingVal;
            }
          }

          const mergedPolicy =
            r.policy_recommendation !== undefined ? r.policy_recommendation : prev.policyRecommendation;

          return {
            ...prev,
            overallRiskScore: validScore !== null ? validScore : prev.overallRiskScore,
            riskLevel: r.risk_level || prev.riskLevel,
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

      // Dedicated ASR Final Turn Broadcast
      if (msg.type === 'ASR_FINAL' && msg.payload?.transcript) {
        const text = msg.payload.transcript.trim();
        if (text) {
          const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setTranscriptTurns((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.text === text) return prev;
            return [
              ...prev,
              {
                id: `asr-turn-${Date.now()}-${prev.length}`,
                timestamp: timeStr,
                speaker: 'CALLER',
                text,
              },
            ];
          });
        }
      }

      // Telemetry Broadcast
      if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
        const p = msg.payload;
        const conv = p.conversation || {};
        const incomingText = conv.asr?.transcript || conv.asr?.redacted_transcript;

        if (incomingText && typeof incomingText === 'string' && incomingText.trim()) {
          const cleanText = incomingText.trim();
          const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setTranscriptTurns((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.text === cleanText) return prev;
            return [
              ...prev,
              {
                id: `turn-${Date.now()}-${prev.length}`,
                timestamp: timeStr,
                speaker: 'CALLER',
                text: cleanText,
                isAdversarial: conv.intent?.is_adversarial || conv.requested_action?.is_high_risk,
                threatMarker: conv.sensitive_data?.highest_severity === 'CRITICAL' ? 'CRITICAL SOLICITATION' : undefined,
              },
            ];
          });
        }

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
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isWsAuthenticatedRef.current) {
        resolve(wsRef.current);
        return;
      }

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

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
        waitForAuth(wsRef.current);
        return;
      }

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
          authTimeout = setTimeout(() => {
            console.warn('[WS-AUTH-TIMEOUT] Resolving after timeout — server may be slow');
            resolve(ws);
          }, 10000);
        };

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
          rec.onresult = (e: any) => {
            let fullText = '';
            for (let i = 0; i < e.results.length; ++i) {
              fullText += e.results[i][0].transcript + ' ';
            }
            if (fullText.trim()) {
              currentMicTranscriptRef.current = fullText.trim();
            }
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch (recErr) {
          console.warn('[SPEECH_HINT] SpeechRecognition init note:', recErr);
        }
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
      activeStreamingCallIdRef.current = call.id;
      setActiveStreamingCallId(call.id);
      streamStartRef.current = Date.now();
      setStreamDurationSeconds(0);
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

      latestRiskSeqRef.current = -1;
      activeStreamingCallIdRef.current = call.id;
      setActiveStreamingCallId(call.id);
      streamStartRef.current = Date.now();
      setStreamDurationSeconds(0);

      // Add active scenario prompt to transcript log
      const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTranscriptTurns((prev) => [
        ...prev,
        {
          id: `scenario-turn-${Date.now()}`,
          timestamp: timeStr,
          speaker: 'CALLER',
          text: scenarioText,
          threatMarker: activeScenario.id !== 'BENIGN_INQUIRY' ? activeScenario.name : undefined,
        },
      ]);

      audioIntervalRef.current = setInterval(() => {
        const buffer = new Int16Array(4800);
        for (let i = 0; i < buffer.length; i++) {
          if (activeScenario.id === 'ACOUSTIC_DEEPFAKE') {
            buffer[i] =
              Math.sin((2 * Math.PI * 440 * i) / 16000) * 8000 +
              Math.sin((2 * Math.PI * 1760 * i) / 16000) * 4000 +
              (i % 40 === 0 ? 5000 : 0);
          } else if (activeScenario.id === 'REPLAY_ATTACK') {
            const direct = Math.sin((2 * Math.PI * 520 * i) / 16000) * 8000;
            const echo = i > 320 ? Math.sin((2 * Math.PI * 520 * (i - 320)) / 16000) * 4500 : 0;
            buffer[i] = direct + echo;
          } else {
            const f0 = 140;
            const env = 0.5 * (1 - Math.cos((2 * Math.PI * (i % 800)) / 800));
            const h1 = Math.sin((2 * Math.PI * f0 * i) / 16000) * 6500;
            const h2 = Math.sin((2 * Math.PI * (2 * f0) * i) / 16000) * 3500;
            const h3 = Math.sin((2 * Math.PI * (3 * f0) * i) / 16000) * 1500;
            const noise = (Math.random() - 0.5) * 300;
            buffer[i] = Math.round((h1 + h2 + h3 + noise) * env);
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
    activeStreamingCallIdRef.current = null;
    setActiveStreamingCallId(null);
    streamStartRef.current = null;
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
        reason: 'Analyst approved automated policy recommendation from Live Calls HUD',
        policyId: unifiedRisk.policyRecommendation?.policy_id || 'POL-CRED-001',
      });
      if (res.success) {
        setInterventionFeedback('Step-up verification challenge dispatched to customer device.');
        setTimeout(() => setInterventionFeedback(null), 4000);
      }
    } catch (err) {
      console.warn('Failed to dispatch intervention:', err);
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
      setTimeout(() => setInterventionFeedback(null), 3500);
    } catch {
      setInterventionFeedback('Intervention Overridden by SOC Analyst.');
      setTimeout(() => setInterventionFeedback(null), 3000);
    }
  };

  const handleBlockCall = async () => {
    if (!selectedCall) return;
    try {
      const res = await ApiClient.patch(`/calls/${selectedCall.id}/status`, {
        status: 'BLOCKED',
        reason: 'Analyst manual override: high fraud risk confirmed',
      });
      if (res.success) {
        setCalls((prev) => prev.map((c) => (c.id === selectedCall.id ? { ...c, status: 'BLOCKED' } : c)));
        setSelectedCall((prev) => (prev ? { ...prev, status: 'BLOCKED' } : null));
        stopStreaming();
        setInterventionFeedback('Session terminated and phone number blocked from telecommunications gateway.');
        setTimeout(() => setInterventionFeedback(null), 4000);
      }
    } catch (err) {
      console.warn('Failed to block call:', err);
    }
  };

  const handleStepUpAuth = async () => {
    if (!selectedCall) return;
    try {
      const res = await ApiClient.post('/interventions/recommend', {
        callId: selectedCall.id,
        level: 'LEVEL_2_STEP_UP_VERIFICATION',
        actionType: 'REQUIRE_STEP_UP_VERIFICATION',
        reason: 'Analyst triggered manual out-of-band step-up authentication',
        policyId: unifiedRisk.policyRecommendation?.policy_id || 'POL-CRED-001',
      });
      if (res.success) {
        setInterventionFeedback('Manual step-up challenge sent to customer device.');
        setTimeout(() => setInterventionFeedback(null), 4000);
      }
    } catch (err) {
      console.warn('Failed to request step-up:', err);
    }
  };

  const handleTerminateCall = async (callId: string) => {
    try {
      stopStreaming();
      const res = await ApiClient.patch(`/calls/${callId}/status`, {
        status: 'TERMINATED',
        reason: 'Analyst terminated session from Live SOC Console',
      });
      if (res.success) {
        setCalls((prev) => prev.map((c) => (c.id === callId ? { ...c, status: 'TERMINATED' } : c)));
        if (selectedCall?.id === callId) {
          setSelectedCall((prev) => (prev ? { ...prev, status: 'TERMINATED' } : null));
        }
      }
    } catch (err) {
      console.warn('Failed to terminate session:', err);
    }
  };

  const getSessionDuration = (sessionOrDate?: CallSession | string | null) => {
    try {
      if (!sessionOrDate) return '00:00';
      const session = typeof sessionOrDate === 'object' ? sessionOrDate : null;
      const sessionId = session ? session.id : (typeof sessionOrDate === 'string' ? sessionOrDate : null);
      const activeId = activeStreamingCallIdRef.current || activeStreamingCallId;

      if (isStreaming && sessionId && sessionId === activeId && streamDurationSeconds >= 0) {
        const mins = Math.floor(streamDurationSeconds / 60);
        const secs = streamDurationSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }

      const baseSec = session?.durationSeconds ?? 0;
      const mins = Math.floor(baseSec / 60);
      const secs = baseSec % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } catch {
      return '00:00';
    }
  };

  // Safe subsystem status renderer
  const renderSubsystemStatus = (
    rawStatus: string,
    rawScore: number | null,
    type: 'deepfake' | 'speaker' | 'replay' | 'vad'
  ) => {
    let status = rawStatus;
    let score = rawScore;

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
        status = imp >= 50 ? 'MISMATCH' : claimedSpeakerId === 'unknown-speaker' ? 'NOT_ENROLLED' : 'MATCH';
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

    let badgeText = status ? status.replace(/_/g, ' ') : 'STANDBY';
    let badgeClass = 'bg-surface-elevated text-mutedText border border-border';
    let dotClass = 'bg-mutedText';
    let scoreDisplay = '—';

    if (isUnavailable) {
      badgeText = 'OFFLINE';
      badgeClass = 'bg-surface-elevated text-mutedText border border-border';
      dotClass = 'bg-mutedText';
      scoreDisplay = '—';
    } else if (isStandby) {
      badgeText = 'READY';
      badgeClass = 'bg-surface-elevated text-secondaryText border border-border';
      dotClass = 'bg-primary';
      scoreDisplay = '—';
    } else if (isInsufficient) {
      badgeText = 'EVALUATING';
      badgeClass = 'bg-warning/10 text-warning border border-warning/30';
      dotClass = 'bg-warning';
      scoreDisplay = '—';
    } else if (isError) {
      badgeText = 'ERROR';
      badgeClass = 'bg-danger/10 text-danger border border-danger/30';
      dotClass = 'bg-danger';
      scoreDisplay = '—';
    } else {
      if (typeof score === 'number' && Number.isFinite(score)) {
        const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
        scoreDisplay = `${pct}%`;
      }

      if (type === 'deepfake') {
        if (status === 'DETECTED' || status === 'SPOOF' || status === 'SUSPICIOUS' || (score !== null && score >= 0.685)) {
          badgeText = 'SYNTHETIC DETECTED';
          badgeClass = 'bg-danger/10 text-danger border border-danger/30 font-semibold';
          dotClass = 'bg-danger';
        } else if (status === 'AUTHENTIC' || status === 'NOT_DETECTED' || (score !== null && score < 0.5)) {
          badgeText = 'AUTHENTIC';
          badgeClass = 'bg-success/10 text-success border border-success/30';
          dotClass = 'bg-success';
        } else {
          badgeText = 'INCONCLUSIVE';
          badgeClass = 'bg-warning/10 text-warning border border-warning/30';
          dotClass = 'bg-warning';
        }
      } else if (type === 'speaker') {
        if (status === 'MATCH') {
          badgeText = 'BIOMETRIC MATCH';
          badgeClass = 'bg-success/10 text-success border border-success/30';
          dotClass = 'bg-success';
        } else if (status === 'MISMATCH') {
          badgeText = 'IMPERSONATION MISMATCH';
          badgeClass = 'bg-danger/10 text-danger border border-danger/30 font-semibold';
          dotClass = 'bg-danger';
        } else if (status === 'NOT_ENROLLED') {
          badgeText = 'UNENROLLED';
          badgeClass = 'bg-warning/10 text-warning border border-warning/30';
          dotClass = 'bg-warning';
        }
      } else if (type === 'replay') {
        if (status === 'REPLAY_DETECTED' || status === 'DETECTED' || status === 'LIKELY_REPLAY') {
          badgeText = 'REPLAY INJECTION';
          badgeClass = 'bg-danger/10 text-danger border border-danger/30 font-semibold';
          dotClass = 'bg-danger';
        } else {
          badgeText = 'AUTHENTIC';
          badgeClass = 'bg-success/10 text-success border border-success/30';
          dotClass = 'bg-success';
        }
      } else if (type === 'vad') {
        if (status === 'SPEECH' || (typeof score === 'number' && score > 0.5)) {
          badgeText = 'ACTIVE SPEECH';
          badgeClass = 'bg-primary/10 text-primary border border-primary/30';
          dotClass = 'bg-primary animate-pulse';
        } else {
          badgeText = 'SILENCE / IDLE';
          badgeClass = 'bg-surface-elevated text-mutedText border border-border';
          dotClass = 'bg-mutedText';
        }
      }
    }

    return { badgeText, badgeClass, dotClass, scoreDisplay };
  };

  const dfView = renderSubsystemStatus(telemetry.deepfake.status, telemetry.deepfake.spoofScore, 'deepfake');
  const spView = renderSubsystemStatus(telemetry.speaker.status, telemetry.speaker.similarityScore, 'speaker');
  const rpView = renderSubsystemStatus(telemetry.replay.status, telemetry.replay.replayProbability, 'replay');
  const vadView = renderSubsystemStatus(telemetry.vad.state, telemetry.vad.speechProbability, 'vad');

  // Security risk computation & presentation
  const isEvaluated = typeof unifiedRisk.overallRiskScore === 'number';
  const scoreVal = isEvaluated ? Math.round(unifiedRisk.overallRiskScore!) : null;
  const severity = getRiskSeverity(scoreVal);
  const currentRiskLevel = unifiedRisk.riskLevel || (isEvaluated ? severity.level : 'SAFE');
  const isCritical = currentRiskLevel === 'CRITICAL';
  const isHigh = currentRiskLevel === 'HIGH';

  // Dimension details for evidence breakdown
  const DIMENSION_METADATA: Record<string, { label: string; weight: string; desc: string }> = {
    credential_theft: { label: 'Credential Theft', weight: 'High (0.28)', desc: 'Solicitation of MFA, OTP, or password credentials' },
    financial_fraud: { label: 'Financial Fraud', weight: 'High (0.25)', desc: 'Unauthorized wire, beneficiary diversion, or funds transfer' },
    identity_impersonation: { label: 'Identity Impersonation', weight: 'High (0.20)', desc: 'Voiceprint contradicts enrolled biometric profile' },
    deepfake_synthetic: { label: 'Synthetic Voice / Deepfake', weight: 'High (0.20)', desc: 'Vocoder phase jitter and synthetic spectral anomalies' },
    account_takeover: { label: 'Account Takeover', weight: 'Medium (0.15)', desc: 'Remote access tool installation (AnyDesk, TeamViewer)' },
    verification_bypass: { label: 'Verification Bypass', weight: 'Medium (0.15)', desc: 'Pressure to bypass secondary out-of-band verification' },
    social_engineering: { label: 'Social Engineering', weight: 'Medium (0.12)', desc: 'Coercive authority exploitation and artificial urgency' },
    replay_injection: { label: 'Replay / Loudspeaker', weight: 'Low (0.10)', desc: 'Secondary room reverberation and loudspeaker roll-off' },
    inconsistency: { label: 'Dialogue Inconsistency', weight: 'Low (0.08)', desc: 'Contradictory caller identities or factual assertions' },
  };

  const elevatedDimensions = Object.entries(unifiedRisk.dimensions)
    .filter(([k, v]) => k !== 'overall' && typeof v === 'number' && (v ?? 0) > 0)
    .map(([k, v]) => ({
      key: k,
      meta: DIMENSION_METADATA[k] || { label: k.replace(/_/g, ' '), weight: 'Weight', desc: 'Anomaly indicator' },
      score: Math.round(v as number),
      severity: getRiskSeverity(v as number),
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="flex h-screen bg-background text-primaryText overflow-hidden font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Navbar
          title="Live Voice Investigation Console"
          subtitle="Real-time biometric monitoring, acoustic deepfake detection, and deterministic policy enforcement."
        />

        <main className="p-4 md:p-6 space-y-5 max-w-[1600px] w-full mx-auto">
          {/* LEVEL 1: HEADER — LIVE SECURITY SESSION & TELEMETRY STRIP */}
          <header className="panel-enterprise p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 border-l-4 border-l-primary">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isStreaming ? 'bg-success animate-pulse' : 'bg-secondaryText'}`} />
                <h1 className="text-xs sm:text-sm md:text-base font-bold tracking-tight text-primaryText uppercase font-mono whitespace-nowrap">
                  LIVE VOICE SESSION
                </h1>
              </div>

              <div className="h-4 w-px bg-border hidden sm:block" />

              {/* Status Pill */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] sm:text-xs font-mono font-semibold whitespace-nowrap ${
                    isStreaming
                      ? 'bg-success/15 text-success border border-success/30'
                      : 'bg-surface-elevated text-secondaryText border border-border'
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  <span>{isStreaming ? 'STREAMING' : 'CONNECTED'}</span>
                </span>
              </div>

              {/* Monitored Session Identity */}
              {selectedCall && (
                <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-mono bg-surface-elevated px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-border whitespace-nowrap">
                  <span className="text-mutedText">CALL:</span>
                  <span className="text-primaryText font-semibold">{selectedCall.callerIdentifier}</span>
                </div>
              )}

              {/* Session Duration */}
              {selectedCall && (
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono text-secondaryText bg-surface-elevated px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-border whitespace-nowrap">
                  <Clock className="w-3 h-3 text-mutedText" />
                  <span className="text-mutedText hidden xs:inline">DUR:</span>
                  <span className="font-bold text-primaryText">{getSessionDuration(selectedCall)}</span>
                </div>
              )}

              {/* Live Risk Badge in Header */}
              {isEvaluated && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded text-[11px] sm:text-xs font-mono font-bold border whitespace-nowrap transition-colors ${
                    isCritical
                      ? 'bg-danger/15 text-danger border-danger/40'
                      : isHigh
                      ? 'bg-warning/15 text-warning border-warning/40'
                      : 'bg-success/15 text-success border-success/30'
                  }`}
                >
                  {isCritical ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>{currentRiskLevel} RISK ({scoreVal}/100)</span>
                </div>
              )}
            </div>

            {/* Claimed Speaker Selector & Quick Status */}
            <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t lg:border-t-0 border-border/60 shrink-0 w-full lg:w-auto justify-between lg:justify-end">
              <label className="text-secondaryText font-medium text-[11px] sm:text-xs whitespace-nowrap">Voiceprint:</label>
              <select
                value={claimedSpeakerId}
                onChange={(e) => setClaimedSpeakerId(e.target.value)}
                className="select-enterprise py-1 text-[11px] sm:text-xs max-w-[220px] sm:max-w-[260px]"
              >
                <option value="speaker-cfo-001">Enrolled CFO (Speaker CFO-001)</option>
                <option value="speaker-admin-002">Enrolled SysAdmin (Speaker Admin-002)</option>
                <option value="unknown-speaker">Unenrolled Unknown Voice</option>
              </select>
            </div>
          </header>

          {/* MAIN SOC CONSOLE WORKSPACE (ORDERED FOR MOBILE PRIORITY HIERARCHY) */}
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: ACTIVE MONITORED SESSIONS & RISK TIMELINE (Desktop: left, Mobile: below workspace per Section 16) */}
            <div className="order-2 lg:order-1 w-full lg:col-span-4 xl:col-span-3 space-y-3">
              <div className="panel-enterprise p-3 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
                      MONITORED SESSIONS
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-[11px] font-mono text-secondaryText">
                      {calls.length}
                    </span>
                  </div>
                  <button
                    onClick={fetchCalls}
                    className="p-1 rounded hover:bg-surface-elevated text-mutedText hover:text-primaryText transition-colors"
                    title="Refresh monitored sessions"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Dense Investigation Sessions Table */}
                <div className="space-y-1.5 max-h-[360px] lg:max-h-[580px] overflow-y-auto pr-0.5">
                  {calls.length === 0 ? (
                    <div className="py-12 text-center text-mutedText font-sans text-xs space-y-2">
                      <PhoneCall className="w-6 h-6 text-mutedText mx-auto opacity-40" />
                      <p className="font-medium text-secondaryText">NO ACTIVE VOICE SESSION</p>
                      <p className="text-[11px]">Initiate or simulate a session from the right console controls.</p>
                    </div>
                  ) : (
                    calls.map((call) => {
                      const isSelected = selectedCall?.id === call.id;
                      const isStreamingThis = isStreaming && activeStreamingCallId === call.id;
                      const statusLower = call.status ? call.status.toLowerCase() : 'active';
                      const isFlagged = call.status === 'FLAGGED' || call.status === 'BLOCKED';

                      return (
                        <div
                          key={call.id}
                          onClick={() => setSelectedCall(call)}
                          className={`p-2.5 rounded border transition-all cursor-pointer select-none text-xs ${
                            isSelected
                              ? 'bg-surface-elevated border-primary text-primaryText shadow-subtle'
                              : 'bg-surface/60 border-border hover:bg-surface-elevated/70 text-secondaryText'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isStreamingThis
                                    ? 'bg-success animate-pulse'
                                    : isFlagged
                                    ? 'bg-danger'
                                    : 'bg-primary'
                                }`}
                              />
                              <span className="font-mono font-bold text-xs truncate text-primaryText">
                                {call.callerIdentifier}
                              </span>
                            </div>

                            {/* Risk score pill if evaluated */}
                            {isSelected && isEvaluated ? (
                              <span
                                className={`px-1.5 py-0.2 rounded font-mono text-[11px] font-bold ${
                                  isCritical
                                    ? 'bg-danger/20 text-danger border border-danger/40'
                                    : isHigh
                                    ? 'bg-warning/20 text-warning border border-warning/40'
                                    : 'bg-success/20 text-success border border-success/30'
                                }`}
                              >
                                {scoreVal}/100
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-mutedText uppercase">{statusLower}</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-mutedText mt-1 font-mono">
                            <span>{call.callerDisplayName || 'Telephony Gateway'}</span>
                            <span>{getSessionDuration(call)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* RISK HISTORY / TRANSITIONS TIMELINE */}
              <div className="panel-enterprise p-3 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-border">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-secondaryText font-mono">
                    <History className="w-3.5 h-3.5 text-secondaryText" />
                    <span>Risk Transitions Timeline</span>
                  </div>
                  <span className="text-[10px] text-mutedText font-mono">Auto-audited</span>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  {riskTransitions.length === 0 ? (
                    <p className="py-4 text-center text-[11px] text-mutedText italic">
                      No risk transitions recorded. Awaiting speech turns.
                    </p>
                  ) : (
                    riskTransitions.map((item) => {
                      const itemSev = getRiskSeverity(item.score);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-1 px-2 rounded bg-surface-elevated/60 border border-border/70 text-[11px]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-mutedText shrink-0">{item.timestamp}</span>
                            <span className="text-border">•</span>
                            <span className={`font-bold ${itemSev.textClass} truncate`}>
                              {item.level} ({Math.round(item.score)})
                            </span>
                          </div>
                          {item.driver && (
                            <span className="text-[10px] text-secondaryText truncate max-w-[100px] ml-1">
                              {item.driver}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: INVESTIGATION WORKSPACE & DECISION CONSOLE */}
            <div className="order-1 lg:order-2 w-full lg:col-span-8 xl:col-span-9 space-y-4 sm:space-y-5">
              {selectedCall ? (
                <>
                  {/* LEVEL 1.5: RISK COMMAND PANEL */}
                  <section
                    aria-label="Risk Command Panel"
                    className={`panel-enterprise p-4 rounded-lg transition-all ${
                      isCritical
                        ? 'border-danger/60 bg-danger/5 shadow-subtle'
                        : isHigh
                        ? 'border-warning/60 bg-warning/5'
                        : 'border-border bg-surface'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Dominant Risk Metric Display */}
                      <div className="md:col-span-4 flex items-center gap-4 border-b md:border-b-0 md:border-r border-border pb-3 md:pb-0 md:pr-4">
                        <div
                          className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center border font-mono font-extrabold ${
                            isCritical
                              ? 'bg-danger/20 border-danger text-danger'
                              : isHigh
                              ? 'bg-warning/20 border-warning text-warning'
                              : isEvaluated
                              ? 'bg-success/20 border-success text-success'
                              : 'bg-surface-elevated border-border text-mutedText'
                          }`}
                        >
                          <span className="text-2xl leading-none">{isEvaluated ? scoreVal : '—'}</span>
                          <span className="text-[10px] uppercase tracking-wider mt-0.5 opacity-80">/ 100</span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider text-mutedText font-semibold block font-mono">
                            FUSION THREAT STATE
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${
                                isCritical
                                  ? 'badge-danger'
                                  : isHigh
                                  ? 'badge-warning'
                                  : isEvaluated
                                  ? 'badge-success'
                                  : 'badge-neutral'
                              }`}
                            >
                              {currentRiskLevel} RISK
                            </span>
                          </div>
                          <span className="text-[11px] text-secondaryText block font-mono">
                            Confidence: <strong className="text-primaryText">{formatPercentage(unifiedRisk.confidence)}</strong> • Velocity: <strong className="text-primaryText">{unifiedRisk.riskVelocity >= 0 ? `+${unifiedRisk.riskVelocity}` : unifiedRisk.riskVelocity}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Primary Threat Driver & Policy Overview */}
                      <div className="md:col-span-5 space-y-1 md:px-2">
                        <span className="text-[10px] uppercase tracking-wider text-mutedText font-semibold block font-mono">
                          PRIMARY THREAT REASON
                        </span>
                        <h3 className="text-xs md:text-sm font-semibold text-primaryText leading-snug">
                          {elevatedDimensions.length > 0
                            ? elevatedDimensions[0].meta.label
                            : 'Nominal baseline conversation (No adversarial threat detected)'}
                        </h3>
                        <p className="text-xs text-secondaryText line-clamp-2">
                          {elevatedDimensions.length > 0
                            ? elevatedDimensions[0].meta.desc
                            : 'All acoustic features and semantic dialogue intents remain within safe operational bounds.'}
                        </p>
                      </div>

                      {/* Enforced Policy / Action Directive */}
                      <div className="md:col-span-3 flex flex-col justify-center bg-surface-elevated p-3 rounded border border-border">
                        <span className="text-[10px] uppercase tracking-wider text-mutedText font-semibold font-mono">
                          GOVERNING POLICY
                        </span>
                        <div className="mt-1">
                          <span className="text-xs font-mono font-bold text-primaryText block truncate">
                            {unifiedRisk.policyRecommendation?.policy_id || 'POL-DEFAULT-ALLOW'}
                          </span>
                          <span
                            className={`text-[11px] font-mono font-semibold block mt-0.5 ${
                              unifiedRisk.policyRecommendation?.is_triggered ? 'text-danger' : 'text-success'
                            }`}
                          >
                            {unifiedRisk.policyRecommendation?.action ||
                              (isCritical ? 'BLOCK_DISCLOSURE' : 'ALLOW_SESSION')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* STREAM CONTROL & TEST HARNESS TOOLBAR */}
                  <div className="panel-enterprise p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-xs font-semibold text-secondaryText font-mono">TEST BENCH & STREAM:</span>
                      <select
                        id="threat-scenario-select"
                        value={selectedScenario}
                        onChange={(e) => setSelectedScenario(e.target.value)}
                        className="select-enterprise py-1 text-xs max-w-[280px]"
                        title="Calibrated voice attack and benign baseline scenarios"
                      >
                        {THREAT_SCENARIOS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>

                      {!isStreaming ? (
                        <>
                          <button
                            onClick={startMicStreaming}
                            className="btn-primary py-1.5 px-3 flex items-center gap-1.5"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>Stream Live Mic</span>
                          </button>

                          <button
                            id="test-scream-btn"
                            onClick={startSyntheticToneStreaming}
                            className="btn-secondary py-1.5 px-3 flex items-center gap-1.5"
                            title="Execute calibrated neural test scenario"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Test Scenario</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={stopStreaming}
                          className="btn-danger py-1.5 px-3.5 flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop Stream</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleStepUpAuth}
                        className="btn-outline py-1.5 px-2.5 flex items-center gap-1.5 text-xs"
                        title="Dispatch out-of-band MFA verification challenge"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-primary" />
                        <span>Step-Up Challenge</span>
                      </button>

                      <button
                        onClick={handleBlockCall}
                        className="btn-outline text-danger hover:border-danger py-1.5 px-2.5 flex items-center gap-1.5 text-xs"
                        title="Block active session"
                      >
                        <Ban className="w-3.5 h-3.5 text-danger" />
                        <span>Block</span>
                      </button>

                      <button
                        onClick={() => handleTerminateCall(selectedCall.id)}
                        className="btn-outline hover:text-danger py-1.5 px-2.5 flex items-center gap-1.5 text-xs"
                        title="Terminate session"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        <span>End</span>
                      </button>
                    </div>
                  </div>

                  {/* LIVE AUDIO STREAMING ENERGY STRIP */}
                  {isStreaming && (
                    <div className="p-2.5 bg-surface-elevated/70 border border-border rounded flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-success animate-ping" />
                        <span className="text-secondaryText font-medium">AUDIO CHANNEL ACTIVE:</span>
                        <span className="text-primaryText font-bold">
                          {streamSource === 'MIC' ? 'Microphone (16 kHz PCM / WebRTC AEC)' : 'Synthetic Scenario Test Bench'}
                        </span>
                        <span className="text-border">•</span>
                        <span className="px-1.5 py-0.2 rounded bg-surface border border-border text-[11px]">
                          {micState}
                        </span>
                      </div>

                      {streamSource === 'MIC' && (
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-3.5 h-3.5 text-mutedText" />
                          <span className="text-mutedText text-[11px]">Level:</span>
                          <div className="w-24 h-2 bg-surface rounded-full overflow-hidden border border-border">
                            <div
                              className="h-full bg-success transition-all duration-75"
                              style={{ width: `${Math.max(0, Math.min(100, (micRmsDb + 60) * 2))}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-secondaryText w-10 text-right">
                            {micRmsDb > -90 ? `${micRmsDb.toFixed(0)} dB` : 'MUTE'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {micError && (
                    <div className="alert-danger text-xs font-sans flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span><strong>Microphone Error:</strong> {micError}</span>
                    </div>
                  )}

                  {/* LEVEL 2: LIVE TRANSCRIPT WORKSPACE (PRIMARY INVESTIGATION FOCUS) */}
                  <section aria-label="Live Investigation Transcript" className="panel-enterprise overflow-hidden">
                    <div className="p-3 bg-surface-elevated/60 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        <h2 className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
                          LIVE TRANSCRIPT WORKSPACE
                        </h2>
                        <span className="text-[11px] text-mutedText font-mono">
                          (Faster-Whisper ASR • 16 kHz Linear Stream)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-secondaryText">
                          Lang: <strong className="text-primaryText">{telemetry.conversation.language}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-secondaryText">
                          Intent: <strong className="text-primaryText">{telemetry.conversation.intent}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Speech Turn Log */}
                    <div
                      ref={transcriptScrollRef}
                      className="p-4 space-y-3 min-h-[160px] max-h-[300px] overflow-y-auto bg-surface/40 text-xs font-sans"
                    >
                      {transcriptTurns.length === 0 && !telemetry.conversation.transcript ? (
                        <div className="py-12 text-center text-mutedText text-xs space-y-1">
                          <p className="font-mono text-secondaryText">Awaiting speech activity...</p>
                          <p className="text-[11px] text-mutedText">
                            Speech utterances from the monitored audio stream will appear here in real time.
                          </p>
                        </div>
                      ) : (
                        transcriptTurns.map((turn) => (
                          <div
                            key={turn.id}
                            className={`p-2.5 rounded border transition-colors ${
                              turn.threatMarker
                                ? 'bg-danger/10 border-danger/40 text-primaryText'
                                : 'bg-surface-elevated/50 border-border/80 text-secondaryText'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 font-mono text-[11px]">
                                <span className="text-mutedText">{turn.timestamp}</span>
                                <span className="font-bold text-primaryText">{turn.speaker}</span>
                              </div>
                              {turn.threatMarker && (
                                <span className="badge-danger text-[10px] font-mono font-bold px-1.5 py-0.2 rounded">
                                  {turn.threatMarker}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-sans text-primaryText pl-1 border-l-2 border-primary/40">
                              &ldquo;{turn.text}&rdquo;
                            </p>
                          </div>
                        ))
                      )}

                      {/* Current live turn if pending finalization */}
                      {telemetry.conversation.transcript &&
                        (!transcriptTurns.length ||
                          transcriptTurns[transcriptTurns.length - 1]?.text !== telemetry.conversation.transcript) && (
                          <div className="p-2.5 rounded bg-primary/5 border border-primary/30 text-primaryText">
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                              <span className="text-primary font-bold">CURRENT UTTERANCE</span>
                              <span className="text-mutedText animate-pulse">TRANSCRIBING...</span>
                            </div>
                            <p className="text-xs italic pl-1 border-l-2 border-primary">
                              &ldquo;{telemetry.conversation.redactedTranscript || telemetry.conversation.transcript}&rdquo;
                            </p>
                          </div>
                        )}
                    </div>
                  </section>

                  {/* LEVEL 3: THREAT SIGNALS (4 CORE SUBSYSTEM STATUS TILES) */}
                  <section aria-label="Acoustic Threat Signals" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Deepfake */}
                    <div className="panel-enterprise p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-mutedText font-mono font-semibold">
                          Acoustic Deepfake
                        </span>
                        <span className={`w-2 h-2 rounded-full ${dfView.dotClass}`} />
                      </div>
                      <div className="flex items-baseline justify-between pt-0.5">
                        <span className="text-xs font-bold text-primaryText font-mono">{dfView.badgeText}</span>
                        <span className="text-xs font-mono text-secondaryText">{dfView.scoreDisplay}</span>
                      </div>
                      <span className="text-[10px] text-mutedText block font-sans">MiniAcousticCNN + AASIST</span>
                    </div>

                    {/* Biometric Speaker */}
                    <div className="panel-enterprise p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-mutedText font-mono font-semibold">
                          Speaker Biometric
                        </span>
                        <span className={`w-2 h-2 rounded-full ${spView.dotClass}`} />
                      </div>
                      <div className="flex items-baseline justify-between pt-0.5">
                        <span className="text-xs font-bold text-primaryText font-mono">{spView.badgeText}</span>
                        <span className="text-xs font-mono text-secondaryText">{spView.scoreDisplay}</span>
                      </div>
                      <span className="text-[10px] text-mutedText block font-sans">ECAPA-TDNN Embedding</span>
                    </div>

                    {/* Replay */}
                    <div className="panel-enterprise p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-mutedText font-mono font-semibold">
                          Replay Filter
                        </span>
                        <span className={`w-2 h-2 rounded-full ${rpView.dotClass}`} />
                      </div>
                      <div className="flex items-baseline justify-between pt-0.5">
                        <span className="text-xs font-bold text-primaryText font-mono">{rpView.badgeText}</span>
                        <span className="text-xs font-mono text-secondaryText">{rpView.scoreDisplay}</span>
                      </div>
                      <span className="text-[10px] text-mutedText block font-sans">Acoustic Room Convolution</span>
                    </div>

                    {/* VAD */}
                    <div className="panel-enterprise p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-mutedText font-mono font-semibold">
                          Voice Activity (VAD)
                        </span>
                        <span className={`w-2 h-2 rounded-full ${vadView.dotClass}`} />
                      </div>
                      <div className="flex items-baseline justify-between pt-0.5">
                        <span className="text-xs font-bold text-primaryText font-mono">{vadView.badgeText}</span>
                        <span className="text-xs font-mono text-secondaryText">{vadView.scoreDisplay}</span>
                      </div>
                      <span className="text-[10px] text-mutedText block font-sans">Speech Energy Gate</span>
                    </div>
                  </section>

                  {/* LEVEL 4: RISK EXPLANATION — "WHY THIS RISK LEVEL?" (EVIDENCE & SIGNALS) */}
                  <section aria-label="Risk Explanation and Evidence" className="panel-enterprise overflow-hidden">
                    <button
                      onClick={() => setEvidenceExpanded(!evidenceExpanded)}
                      className="w-full p-3.5 bg-surface-elevated/40 border-b border-border flex items-center justify-between hover:bg-surface-elevated transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileSearch className="w-4 h-4 text-primary" />
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
                            WHY THIS RISK LEVEL? (FORENSIC EVIDENCE & EXPLAINABILITY)
                          </h3>
                          <span className="text-[11px] text-mutedText font-sans">
                            Signal → Evidence → Policy Impact breakdown across 10-dimensional risk fusion
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                        <span>{evidenceExpanded ? 'Collapse' : 'Expand'}</span>
                        {evidenceExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {evidenceExpanded && (
                      <div className="p-4 space-y-4 text-xs font-sans">
                        {/* Evidence Signal Rows */}
                        <div className="space-y-2">
                          {elevatedDimensions.length === 0 ? (
                            <div className="py-4 text-center text-mutedText text-xs">
                              No active threat indicators. Multi-modal sensor fusion registers nominal baseline operations.
                            </div>
                          ) : (
                            elevatedDimensions.map(({ key, meta, score, severity: s }) => (
                              <div
                                key={key}
                                className="p-3 rounded border border-border bg-surface-elevated/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 font-mono">
                                    <span className="font-bold text-primaryText">{meta.label}</span>
                                    <span className="text-mutedText text-[10px]">({meta.weight})</span>
                                  </div>
                                  <p className="text-xs text-secondaryText">{meta.desc}</p>
                                </div>

                                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                                  <div className="w-28 h-2 bg-surface rounded-full overflow-hidden border border-border">
                                    <div
                                      className={`h-full ${
                                        score >= 80 ? 'bg-danger' : score >= 50 ? 'bg-warning' : 'bg-success'
                                      }`}
                                      style={{ width: `${score}%` }}
                                    />
                                  </div>
                                  <span className={`font-mono font-bold text-xs w-12 text-right ${s.textClass}`}>
                                    {score} / 100
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Explainability Summary */}
                        {unifiedRisk.primaryDrivers.length > 0 && (
                          <div className="p-3 rounded bg-surface border border-border/80 space-y-1">
                            <span className="text-[11px] font-semibold text-secondaryText font-mono uppercase">
                              PRIMARY DRIVERS DETECTED BY AI ENGINE:
                            </span>
                            <ul className="list-disc list-inside text-xs text-secondaryText space-y-0.5">
                              {unifiedRisk.primaryDrivers.map((driver, idx) => (
                                <li key={idx}>
                                  <span className="text-primaryText">{driver}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  {/* LEVEL 5: POLICY DECISION & RESPONSE PANEL (DETECTION → DECISION → RESPONSE) */}
                  <section aria-label="Policy Decision & Response Panel" className="panel-enterprise p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-primary" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
                          POLICY DECISION & ENFORCEMENT ENGINE
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-elevated text-secondaryText border border-border">
                        Workflow: <strong className="text-primaryText">{unifiedRisk.humanWorkflowState}</strong>
                      </span>
                    </div>

                    {/* 3-Step Triad: DETECTION -> DECISION -> RESPONSE */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      {/* 1. DETECTION */}
                      <div className="p-3 rounded bg-surface-elevated/50 border border-border space-y-1">
                        <span className="text-[10px] uppercase font-bold text-mutedText font-mono block">
                          1. DETECTION
                        </span>
                        <h4 className="text-xs font-semibold text-primaryText">
                          {elevatedDimensions[0]?.meta.label || 'No Violation Detected'}
                        </h4>
                        <p className="text-[11px] text-secondaryText">
                          {elevatedDimensions[0]?.meta.desc || 'Audio stream conforms to legitimate caller profile.'}
                        </p>
                      </div>

                      {/* 2. DECISION */}
                      <div className="p-3 rounded bg-surface-elevated/50 border border-border space-y-1">
                        <span className="text-[10px] uppercase font-bold text-mutedText font-mono block">
                          2. DECISION (POLICY)
                        </span>
                        <h4 className="text-xs font-mono font-semibold text-primaryText">
                          {unifiedRisk.policyRecommendation?.policy_id || 'POL-DEFAULT-ALLOW'}
                        </h4>
                        <p className="text-[11px] text-secondaryText">
                          {unifiedRisk.policyRecommendation?.explanation ||
                            'Deterministic safety rules passed without threshold breach.'}
                        </p>
                      </div>

                      {/* 3. RESPONSE */}
                      <div className="p-3 rounded bg-surface-elevated/50 border border-border space-y-1">
                        <span className="text-[10px] uppercase font-bold text-mutedText font-mono block">
                          3. RESPONSE ACTION
                        </span>
                        <h4
                          className={`text-xs font-mono font-bold ${
                            isCritical ? 'text-danger' : isHigh ? 'text-warning' : 'text-success'
                          }`}
                        >
                          {unifiedRisk.policyRecommendation?.action ||
                            (isCritical ? 'REQUIRE_STEP_UP_VERIFICATION' : 'ALLOW_SESSION')}
                        </h4>
                        <p className="text-[11px] text-secondaryText">
                          {isCritical
                            ? 'Disclosure blocked until out-of-band verification is satisfied.'
                            : 'Continuous multi-modal background verification.'}
                        </p>
                      </div>
                    </div>

                    {/* Feedback banner */}
                    {interventionFeedback && (
                      <div className="p-2.5 rounded bg-success/15 border border-success/30 text-success text-xs flex items-center gap-2 font-sans">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{interventionFeedback}</span>
                      </div>
                    )}

                    {/* Officer Action Buttons */}
                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-border">
                      <button
                        onClick={handleOverrideIntervention}
                        className="btn-secondary py-1.5 px-3 flex items-center gap-1.5 text-xs"
                      >
                        <XCircle className="w-3.5 h-3.5 text-mutedText" />
                        <span>Override (Audited False Positive)</span>
                      </button>

                      <button
                        onClick={handleApproveIntervention}
                        className="btn-primary py-1.5 px-3.5 flex items-center gap-1.5 text-xs font-medium"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve Step-Up Challenge</span>
                      </button>
                    </div>
                  </section>

                  {/* LEVEL 6: TECHNICAL TELEMETRY PANEL (EXPANDABLE) */}
                  <section aria-label="Stream Telemetry" className="panel-enterprise overflow-hidden">
                    <button
                      onClick={() => setTelemetryExpanded(!telemetryExpanded)}
                      className="w-full p-3 bg-surface-elevated/40 border-b border-border flex items-center justify-between hover:bg-surface-elevated transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-secondaryText" />
                        <span className="text-xs font-bold uppercase tracking-wider text-secondaryText font-mono">
                          ACOUSTIC & STREAMING TELEMETRY (16 KHZ PCM • LATENCY: {formatLatency(unifiedRisk.fusionLatencyMs || telemetry.totalAiLatencyMs)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                        <span>{telemetryExpanded ? 'Collapse' : 'Inspect'}</span>
                        {telemetryExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {telemetryExpanded && (
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                        <div className="p-2.5 rounded bg-surface border border-border">
                          <span className="text-[10px] text-mutedText block">SAMPLE RATE</span>
                          <span className="text-primaryText font-bold text-xs mt-0.5 block">16.0 kHz (16-bit)</span>
                        </div>
                        <div className="p-2.5 rounded bg-surface border border-border">
                          <span className="text-[10px] text-mutedText block">CHANNELS</span>
                          <span className="text-primaryText font-bold text-xs mt-0.5 block">Mono (Linear PCM)</span>
                        </div>
                        <div className="p-2.5 rounded bg-surface border border-border">
                          <span className="text-[10px] text-mutedText block">CHUNK WINDOW</span>
                          <span className="text-primaryText font-bold text-xs mt-0.5 block">300 ms (4800 samples)</span>
                        </div>
                        <div className="p-2.5 rounded bg-surface border border-border">
                          <span className="text-[10px] text-mutedText block">TOTAL AI LATENCY</span>
                          <span className="text-primary font-bold text-xs mt-0.5 block">
                            {formatLatency(unifiedRisk.fusionLatencyMs || telemetry.totalAiLatencyMs)}
                          </span>
                        </div>
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <div className="panel-enterprise py-24 text-center text-mutedText text-sm space-y-2">
                  <PhoneCall className="w-10 h-10 text-mutedText mx-auto opacity-30" />
                  <p className="text-primaryText font-medium text-base">NO MONITORED SESSION SELECTED</p>
                  <p className="text-xs text-mutedText max-w-md mx-auto font-sans">
                    Select an active voice session from the monitored queue or start a new call to inspect real-time threat telemetry.
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
