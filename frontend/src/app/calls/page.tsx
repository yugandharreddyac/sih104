'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { ApiClient, WS_BASE } from '@/lib/api';
import { BrowserAudioStreamer, MicStreamState } from '@/lib/audio_streamer';
import { formatSafeTime, formatLatency } from '@/lib/format';
import { DominantThreatCard } from '@/components/ui/DominantThreatCard';
import { DetectionSignalsTable } from '@/components/ui/DetectionSignalsTable';
import { EvidenceExplainer } from '@/components/ui/EvidenceExplainer';
import { TechnicalTelemetryPanel } from '@/components/ui/TechnicalTelemetryPanel';
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
  const [selectedScenario, setSelectedScenario] = useState<string>('BENIGN_INQUIRY');

  // Real-time dynamic duration and streaming ticker
  const [timerTick, setTimerTick] = useState<number>(Date.now());
  const [streamDurationSeconds, setStreamDurationSeconds] = useState<number>(0);
  const streamStartRef = useRef<number | null>(null);

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
          // Only populate evaluated score if an active assessment has occurred (not NOT_AVAILABLE baseline)
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
          if (msg.sequenceNumber < latestRiskSeqRef.current) {
            return; // Drop older evaluation that arrived out of order
          }
          latestRiskSeqRef.current = msg.sequenceNumber;
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
              mergedDimensions[key] = incomingVal;
            } else if (incomingVal !== undefined && incomingVal !== null) {
              mergedDimensions[key] = incomingVal;
            }
          }

          const mergedPolicy = r.policy_recommendation !== undefined
            ? r.policy_recommendation
            : prev.policyRecommendation;

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

      // Reset sequence tracker so the new scenario immediately registers in HUD
      latestRiskSeqRef.current = -1;
      streamStartRef.current = Date.now();
      setStreamDurationSeconds(0);

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
            // Authentic human voice harmonic structure (natural fundamental F0 ~140Hz + vocal tract formants and subtle natural breath)
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
        setInterventionFeedback('Intervention recommendation dispatched successfully.');
        setTimeout(() => setInterventionFeedback(null), 4000);
      }
    } catch (err) {
      console.warn('Failed to dispatch intervention:', err);
    }
  };

  const handleRejectIntervention = () => {
    setInterventionFeedback('Policy intervention recommendation dismissed.');
    setTimeout(() => setInterventionFeedback(null), 3000);
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
      setTimeout(() => setInterventionFeedback(null), 3000);
    } catch {
      setInterventionFeedback('Intervention Overridden by SOC Analyst.');
      setTimeout(() => setInterventionFeedback(null), 3000);
    }
  };

  const handleEndSession = async (callId: string) => {
    await handleTerminateCall(callId);
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
        setInterventionFeedback('Step-up verification challenge dispatched to customer.');
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
      const isCurrentStream = isStreaming && (!session || session.id === (selectedCallRef.current || selectedCall)?.id);
      if (isCurrentStream && streamDurationSeconds >= 0) {
        const mins = Math.floor(streamDurationSeconds / 60);
        const secs = streamDurationSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      const dateStr = typeof sessionOrDate === 'string' ? sessionOrDate : (session?.startedAt || session?.createdAt);
      if (dateStr) {
        const start = new Date(dateStr).getTime();
        if (!isNaN(start)) {
          const diffSec = Math.max(0, Math.floor((timerTick - start) / 1000));
          const mins = Math.floor(diffSec / 60);
          const secs = diffSec % 60;
          return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
      }
      const baseSec = session?.durationSeconds || 0;
      const mins = Math.floor(baseSec / 60);
      const secs = baseSec % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } catch {
      return '00:00';
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

    let badgeText = status ? status.replace(/_/g, ' ') : 'STANDBY';
    let badgeClass = 'bg-surface-elevated text-mutedText border border-border';
    let scoreDisplay = '—';

    if (isUnavailable) {
      badgeText = 'OFFLINE';
      badgeClass = 'bg-surface-elevated text-mutedText border border-border';
      scoreDisplay = '—';
    } else if (isStandby) {
      badgeText = 'READY';
      badgeClass = 'bg-surface-elevated text-secondaryText border border-border';
      scoreDisplay = '—';
    } else if (isInsufficient) {
      badgeText = 'EVALUATING';
      badgeClass = 'bg-warning/10 text-warning border border-warning/30';
      scoreDisplay = '—';
    } else if (isError) {
      badgeText = 'ERROR';
      badgeClass = 'bg-danger/10 text-danger border border-danger/30';
      scoreDisplay = '—';
    } else {
      if (typeof score === 'number' && isFinite(score)) {
        const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
        scoreDisplay = `${pct}%`;
      }

      if (type === 'deepfake') {
        if (status === 'DETECTED' || status === 'SPOOF' || status === 'SUSPICIOUS' || (score !== null && score >= 0.685)) {
          badgeText = 'DETECTED';
          badgeClass = 'bg-danger/10 text-danger border border-danger/30';
        } else if (status === 'AUTHENTIC' || status === 'NOT_DETECTED' || (score !== null && score < 0.50)) {
          badgeText = 'AUTHENTIC';
          badgeClass = 'bg-success/10 text-success border border-success/30';
        } else if (status === 'INCONCLUSIVE') {
          badgeText = 'INCONCLUSIVE';
          badgeClass = 'bg-warning/10 text-warning border border-warning/30';
        }
      } else if (type === 'speaker') {
        if (status === 'MATCH') {
          badgeText = 'MATCH';
          badgeClass = 'bg-success/10 text-success border border-success/30';
        } else if (status === 'MISMATCH') {
          badgeText = 'MISMATCH';
          badgeClass = 'bg-danger/10 text-danger border border-danger/30';
        } else if (status === 'NOT_ENROLLED') {
          badgeText = 'UNENROLLED';
          badgeClass = 'bg-warning/10 text-warning border border-warning/30';
        }
      } else if (type === 'replay') {
        if (status === 'REPLAY_DETECTED' || status === 'DETECTED' || status === 'LIKELY_REPLAY') {
          badgeText = 'DETECTED';
          badgeClass = 'bg-danger/10 text-danger border border-danger/30';
        } else if (status === 'NOT_REPLAY' || status === 'AUTHENTIC') {
          badgeText = 'AUTHENTIC';
          badgeClass = 'bg-success/10 text-success border border-success/30';
        } else if (status === 'UNCERTAIN') {
          badgeText = 'UNCERTAIN';
          badgeClass = 'bg-warning/10 text-warning border border-warning/30';
        }
      } else if (type === 'vad') {
        if (status === 'SPEECH' || (typeof score === 'number' && score > 0.5)) {
          badgeText = 'SPEECH';
          badgeClass = 'bg-primary/10 text-primary border border-primary/30';
        } else if (status === 'SILENCE') {
          badgeText = 'SILENCE';
          badgeClass = 'bg-surface-elevated text-mutedText border border-border';
        } else {
          badgeText = 'LISTENING';
          badgeClass = 'bg-surface-elevated text-mutedText border border-border';
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
  const riskScoreText = isEvaluated ? `${Math.round(unifiedRisk.overallRiskScore!)} / 100` : 'PENDING';

  return (
    <div className="flex h-screen bg-background text-primaryText overflow-hidden font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Navbar title="Live Voice Sessions" subtitle="Monitor active voice sessions and real-time threat signals." />

        <main className="p-4 md:p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* Top Operational Telemetry Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-primaryText">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span>Live Voice Stream Telemetry</span>
                <span className="text-mutedText font-normal text-xs ml-2">
                  ({calls.length} {calls.length === 1 ? 'Session Monitored' : 'Sessions Monitored'})
                </span>
              </div>
              <p className="text-xs text-mutedText mt-0.5 font-sans">
                Real-time acoustic deepfake detection, speaker verification, and deterministic policy enforcement.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-secondaryText font-sans shrink-0">Claimed Identity:</label>
              <select
                value={claimedSpeakerId}
                onChange={(e) => setClaimedSpeakerId(e.target.value)}
                className="select-enterprise max-w-[280px] text-xs"
              >
                <option value="speaker-cfo-001">Enrolled CFO — Speaker CFO-001</option>
                <option value="speaker-admin-002">Enrolled SysAdmin — Speaker Admin-002</option>
                <option value="unknown-speaker">Unenrolled Unknown Speaker</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* 1. ACTIVE SESSION LIST (TABLE) */}
            <div className="lg:col-span-4 flex flex-col space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText font-sans">
                    Active Sessions
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-elevated border border-border text-[11px] font-mono text-mutedText">
                    {calls.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span className="text-xs text-mutedText font-sans">Live</span>
                </div>
              </div>

              {/* Table Column Headers */}
              <div className="grid grid-cols-12 px-2 py-1 border-b border-border text-[10px] font-medium text-mutedText uppercase tracking-wider font-sans">
                <div className="col-span-5">Session / Phone</div>
                <div className="col-span-3">Channel</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2 text-right">Risk</div>
              </div>

              {/* Session Rows */}
              <div className="divide-y divide-border/40 max-h-[660px] overflow-y-auto">
                {calls.length === 0 ? (
                  <div className="py-12 text-center text-mutedText font-sans text-xs">
                    <PhoneCall className="w-5 h-5 text-mutedText mx-auto mb-2 opacity-50" />
                    <p>No active sessions detected.</p>
                  </div>
                ) : (
                  calls.map((call) => {
                    const isSelected = selectedCall?.id === call.id;
                    const statusLower = call.status ? call.status.toLowerCase() : 'active';
                    const isVerifying = call.status === 'VERIFYING';
                    const isFlagged = call.status === 'FLAGGED' || call.status === 'BLOCKED';

                    return (
                      <div
                        key={call.id}
                        onClick={() => setSelectedCall(call)}
                        className={`grid grid-cols-12 px-2 py-2.5 items-center cursor-pointer transition-colors text-xs font-sans ${
                          isSelected
                            ? 'bg-surface-elevated border-l-2 border-primary text-primaryText pl-2'
                            : 'hover:bg-surface-hover/50 border-l-2 border-transparent text-secondaryText'
                        }`}
                      >
                        {/* Session / Phone */}
                        <div className="col-span-5 min-w-0 pr-1">
                          <span className={`block font-mono text-xs truncate ${isSelected ? 'font-semibold text-primaryText' : 'text-primaryText'}`}>
                            {call.callerIdentifier}
                          </span>
                          <span className="block text-[10px] font-mono text-mutedText truncate mt-0.5">
                            {getSessionDuration(call)} • {formatSafeTime(call.startedAt || call.createdAt, 'Now')}
                          </span>
                        </div>

                        {/* Channel */}
                        <div className="col-span-3 min-w-0 pr-1">
                          <span className="block text-xs truncate text-secondaryText">
                            {call.callerDisplayName || 'Telephony'}
                          </span>
                          <span className="block text-[10px] text-mutedText font-mono uppercase mt-0.5">
                            {call.direction}
                          </span>
                        </div>

                        {/* Status with dot */}
                        <div className="col-span-2 min-w-0">
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isVerifying
                                  ? 'bg-warning'
                                  : isFlagged
                                  ? 'bg-danger'
                                  : 'bg-success'
                              }`}
                            />
                            <span className="capitalize truncate text-[11px] text-secondaryText">
                              {statusLower}
                            </span>
                          </span>
                        </div>

                        {/* Risk */}
                        <div className="col-span-2 text-right">
                          {isSelected && isEvaluated ? (
                            <span
                              className={`font-mono text-xs font-semibold ${
                                unifiedRisk.riskLevel === 'CRITICAL'
                                  ? 'text-danger'
                                  : unifiedRisk.riskLevel === 'HIGH'
                                  ? 'text-orange-400'
                                  : unifiedRisk.riskLevel === 'ELEVATED'
                                  ? 'text-warning'
                                  : 'text-success'
                              }`}
                            >
                              {Math.round(unifiedRisk.overallRiskScore!)}
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-mutedText">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Live Telemetry & Decision Console (Unboxed Workspace) */}
            <div className="lg:col-span-8 space-y-5 lg:pl-6 lg:border-l lg:border-border">
              {selectedCall ? (
                <>
                  {/* 2. SELECTED SESSION HEADER */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs uppercase font-medium text-mutedText font-sans">Selected Session:</span>
                        <h2 className="text-base font-semibold text-primaryText font-mono tracking-tight">
                          {selectedCall.callerIdentifier}
                        </h2>
                        {isEvaluated && (
                          <span
                            className={`text-[11px] font-sans font-medium px-2 py-0.5 rounded ${
                              unifiedRisk.riskLevel === 'CRITICAL'
                                ? 'badge-danger'
                                : unifiedRisk.riskLevel === 'HIGH'
                                ? 'badge-warning'
                                : unifiedRisk.riskLevel === 'ELEVATED'
                                ? 'badge-warning'
                                : 'badge-success'
                            }`}
                          >
                            {unifiedRisk.riskLevel} Risk ({riskScoreText})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-mutedText mt-1 font-mono">
                        <span>Session ID: <span className="text-secondaryText">{selectedCall.id}</span></span>
                        <span>•</span>
                        <span>Duration: <span className="text-secondaryText">{getSessionDuration(selectedCall)}</span></span>
                        <span>•</span>
                        <span>Latency: <span className="text-secondaryText">{formatLatency(unifiedRisk.fusionLatencyMs || telemetry.totalAiLatencyMs)}</span></span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isStreaming ? (
                        <>
                          {/* Scenario Selector */}
                          <div className="flex items-center gap-1.5 bg-surface border border-border rounded px-2.5 py-1 text-xs">
                            <span className="text-mutedText font-sans text-xs">Scenario:</span>
                            <select
                              id="threat-scenario-select"
                              value={selectedScenario}
                              onChange={(e) => setSelectedScenario(e.target.value)}
                              className="bg-transparent text-primaryText font-sans text-xs focus:outline-none cursor-pointer"
                              title="Select threat scenario to evaluate in Live Calls"
                            >
                              {THREAT_SCENARIOS.map((s) => (
                                <option key={s.id} value={s.id} className="bg-surface text-primaryText">
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Action Buttons */}
                          <button
                            onClick={startMicStreaming}
                            className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3 rounded font-sans"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>Stream Live Mic</span>
                          </button>

                          <button
                            id="test-scream-btn"
                            onClick={startSyntheticToneStreaming}
                            className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 rounded font-sans"
                            title="Stream calibrated synthetic audio scenario"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Test Stream</span>
                          </button>

                          <button
                            onClick={() => handleEndSession(selectedCall.id)}
                            className="btn-outline text-mutedText hover:text-danger hover:border-danger/40 flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded font-sans"
                            title="Terminate this session"
                          >
                            <PhoneOff className="w-3.5 h-3.5" />
                            <span>End Session</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={stopStreaming}
                          className="btn-danger flex items-center gap-1.5 text-xs py-1.5 px-3 rounded font-sans"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop Stream</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3. THREAT ALERT */}
                  {(() => {
                    const THREAT_ALERT_MAPPINGS: Record<string, { title: string; desc: string; severity: string }> = {
                      identity_impersonation: {
                        title: 'Speaker verification mismatch',
                        desc: "The caller's voiceprint does not match the enrolled speaker profile.",
                        severity: 'Critical',
                      },
                      credential_theft: {
                        title: 'Credential theft solicitation',
                        desc: 'The caller actively solicited one-time password (OTP) or authentication credentials.',
                        severity: 'Critical',
                      },
                      financial_fraud: {
                        title: 'Unauthorized financial transfer solicitation',
                        desc: 'High-value fund transfer or beneficiary account modification requested without authorization.',
                        severity: 'Critical',
                      },
                      account_takeover: {
                        title: 'Remote access software solicitation',
                        desc: 'Caller instructed operator to install remote desktop software (AnyDesk) or surrender workstation control.',
                        severity: 'Critical',
                      },
                      verification_bypass: {
                        title: 'Verification bypass coercion',
                        desc: 'Caller attempted to coerce operator into skipping out-of-band identity verification controls.',
                        severity: 'Critical',
                      },
                      social_engineering: {
                        title: 'Conversational social engineering detected',
                        desc: 'Coercive authority exploitation, artificial urgency, or intimidation tactics identified in dialogue.',
                        severity: 'High',
                      },
                      deepfake_synthetic: {
                        title: 'Synthetic voice / acoustic deepfake detected',
                        desc: 'Synthetic vocoder phase jitter, unnatural spectral consistency, or synthesized voice artifacts detected in audio stream.',
                        severity: 'Critical',
                      },
                      replay_injection: {
                        title: 'Replay or loudspeaker injection detected',
                        desc: 'Physical loudspeaker acoustic roll-off and secondary room reverberation decay detected in stream.',
                        severity: 'Elevated',
                      },
                      inconsistency: {
                        title: 'Dialogue claim inconsistency detected',
                        desc: 'Contradictory caller identities, organizations, or factual assertions detected across turns.',
                        severity: 'Elevated',
                      },
                    };

                    const elevatedThreats = Object.entries(unifiedRisk.dimensions)
                      .filter(([k, v]) => k !== 'overall' && typeof v === 'number' && (v ?? 0) >= 50)
                      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
                    const dominantThreat = elevatedThreats[0];
                    const dominantInfo = dominantThreat
                      ? THREAT_ALERT_MAPPINGS[dominantThreat[0]] || {
                          title: `${dominantThreat[0].replace(/_/g, ' ')} detected`,
                          desc: `Elevated risk detected on ${dominantThreat[0].replace(/_/g, ' ')}. Score: ${(dominantThreat[1] as number).toFixed(1)}/100.`,
                          severity: (dominantThreat[1] as number) >= 80 ? 'Critical' : 'High',
                        }
                      : null;

                    if (!dominantThreat || !dominantInfo) return null;

                    return (
                      <div className="py-2.5 px-3 border-l-2 border-danger bg-danger/5 text-xs flex items-start justify-between gap-3 font-sans">
                        <div className="flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0 mt-1.5" />
                          <div>
                            <h4 className="text-xs font-semibold text-primaryText">
                              {dominantInfo.title}
                            </h4>
                            <p className="text-xs text-secondaryText mt-0.5">
                              {dominantInfo.desc}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <span className="badge-danger text-[11px] font-sans font-medium px-2 py-0.5 rounded">
                            Severity: {dominantInfo.severity}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 4. THREAT ASSESSMENT & RISK ASSESSMENT (UNBOXED) */}
                  <DominantThreatCard
                    unboxed={true}
                    overallRiskScore={unifiedRisk.overallRiskScore}
                    riskLevel={unifiedRisk.riskLevel}
                    confidence={unifiedRisk.confidence}
                    velocity={unifiedRisk.riskVelocity}
                    dimensions={unifiedRisk.dimensions}
                    policyId={unifiedRisk.policyRecommendation?.policy_id}
                    policyExplanation={unifiedRisk.policyRecommendation?.explanation}
                  />

                  {/* 8. LIVE MICROPHONE CONTROL & HEALTH */}
                  {isStreaming && (
                    <div className="py-2 px-3 bg-surface-elevated/40 border border-border rounded flex items-center justify-between text-xs font-sans">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-success animate-ping" />
                        <span className="text-secondaryText font-sans">
                          Source: <strong className="text-primaryText">{streamSource === 'MIC' ? 'Browser Microphone (16 kHz PCM)' : 'Synthetic Test Bench'}</strong>
                        </span>
                        <span className="text-border">•</span>
                        <span className="px-1.5 py-0.2 rounded bg-surface text-secondaryText border border-border text-[11px] font-mono">
                          {micState}
                        </span>
                      </div>
                      {streamSource === 'MIC' && (
                        <div className="flex items-center gap-2">
                          <span className="text-mutedText text-[11px] font-sans">Input Energy:</span>
                          <div className="w-24 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                            <div
                              className="h-full bg-success transition-all duration-75"
                              style={{ width: `${Math.max(0, Math.min(100, (micRmsDb + 60) * 2))}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-mutedText font-mono">{micRmsDb > -90 ? `${micRmsDb.toFixed(0)} dB` : 'MUTE'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {micError && (
                    <div className="p-2.5 rounded bg-danger/10 border border-danger/30 text-xs font-sans text-danger flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                      <span><strong>Microphone Error:</strong> {micError}</span>
                    </div>
                  )}

                  {/* Subsystem Model Status Row (Horizontal Divider Based) */}
                  <div className="py-2.5 border-y border-border grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    {/* Deepfake */}
                    <div className="py-1 px-3 space-y-0.5 text-xs font-sans">
                      <span className="text-mutedText text-[10px] block uppercase font-medium tracking-wider">Acoustic Deepfake</span>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primaryText">
                          <span className={`w-1.5 h-1.5 rounded-full ${dfView.badgeText === 'AUTHENTIC' ? 'bg-success' : dfView.badgeText === 'DETECTED' ? 'bg-danger' : 'bg-mutedText'}`} />
                          <span>{dfView.badgeText}</span>
                        </span>
                        <span className="text-secondaryText font-mono">{dfView.scoreDisplay}</span>
                      </div>
                    </div>

                    {/* Biometric Speaker */}
                    <div className="py-1 px-3 space-y-0.5 text-xs font-sans">
                      <span className="text-mutedText text-[10px] block uppercase font-medium tracking-wider">Speaker Match</span>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primaryText">
                          <span className={`w-1.5 h-1.5 rounded-full ${spView.badgeText === 'MATCH' ? 'bg-success' : spView.badgeText === 'MISMATCH' ? 'bg-danger' : 'bg-mutedText'}`} />
                          <span>{spView.badgeText}</span>
                        </span>
                        <span className="text-secondaryText font-mono">{spView.scoreDisplay}</span>
                      </div>
                    </div>

                    {/* Replay */}
                    <div className="py-1 px-3 space-y-0.5 text-xs font-sans">
                      <span className="text-mutedText text-[10px] block uppercase font-medium tracking-wider">Replay Attack</span>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primaryText">
                          <span className={`w-1.5 h-1.5 rounded-full ${rpView.badgeText === 'AUTHENTIC' || rpView.badgeText === 'NOT REPLAY' ? 'bg-success' : rpView.badgeText.includes('REPLAY') ? 'bg-danger' : 'bg-mutedText'}`} />
                          <span>{rpView.badgeText}</span>
                        </span>
                        <span className="text-secondaryText font-mono">{rpView.scoreDisplay}</span>
                      </div>
                    </div>

                    {/* VAD */}
                    <div className="py-1 px-3 space-y-0.5 text-xs font-sans">
                      <span className="text-mutedText text-[10px] block uppercase font-medium tracking-wider">Voice Activity</span>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primaryText">
                          <span className={`w-1.5 h-1.5 rounded-full ${vadView.badgeText === 'VOICE ACTIVE' ? 'bg-success' : 'bg-mutedText'}`} />
                          <span>{vadView.badgeText}</span>
                        </span>
                        <span className="text-secondaryText font-mono">{vadView.scoreDisplay}</span>
                      </div>
                    </div>
                  </div>

                  {/* Analytical Detection Signals Table (Unboxed) */}
                  <DetectionSignalsTable unboxed={true} dimensions={unifiedRisk.dimensions} />

                  {/* Forensic Evidence & Explainability */}
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

                  {/* 9. ANALYST POLICY INTERVENTION ACTIONS */}
                  {unifiedRisk.policyRecommendation?.is_triggered && (
                    <div className="py-3 border-t border-border space-y-2.5 font-sans">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-danger" />
                          <span className="text-xs font-semibold text-primaryText uppercase tracking-wider font-mono">
                            Policy Trigger: {unifiedRisk.policyRecommendation.policy_id}
                          </span>
                        </div>
                        <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-warning/10 text-warning font-medium border border-warning/30">
                          {unifiedRisk.humanWorkflowState}
                        </span>
                      </div>

                      <p className="text-xs text-secondaryText">
                        {unifiedRisk.policyRecommendation.explanation}
                      </p>

                      {interventionFeedback && (
                        <div className="p-2 rounded bg-success/10 border border-success/30 text-success text-xs font-sans flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>{interventionFeedback}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2.5 pt-1">
                        <button
                          onClick={handleOverrideIntervention}
                          className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 rounded font-sans"
                        >
                          <XCircle className="w-3.5 h-3.5 text-mutedText" />
                          <span>Override / False Positive</span>
                        </button>
                        <button
                          onClick={handleApproveIntervention}
                          className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3.5 rounded font-sans font-medium"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve & Dispatch Step-Up Challenge</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Redacted Live Transcript Stream */}
                  <div className="pt-3 border-t border-border space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className="text-mutedText flex items-center gap-1.5 font-medium uppercase tracking-wider text-[10px]">
                        <MessageSquare className="w-3.5 h-3.5 text-secondaryText" />
                        Live Transcript (Privacy Redacted)
                      </span>
                      <span className="text-[10px] text-success font-mono font-medium">
                        {telemetry.conversation.language} ({telemetry.conversation.intent})
                      </span>
                    </div>

                    <p className="text-xs font-sans text-secondaryText italic">
                      &ldquo;{telemetry.conversation.redactedTranscript || telemetry.conversation.transcript || 'Waiting for audio speech turn...'}&rdquo;
                    </p>
                  </div>
                </>
              ) : (
                <div className="py-24 text-center text-mutedText text-sm font-sans space-y-2">
                  <PhoneCall className="w-8 h-8 text-mutedText mx-auto opacity-40" />
                  <p className="text-primaryText font-medium">No Call Session Selected</p>
                  <p className="text-xs text-mutedText max-w-md mx-auto">
                    Select a monitored session from the left queue to inspect real-time threat telemetry.
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
