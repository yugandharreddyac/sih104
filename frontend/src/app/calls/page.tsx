'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { ApiClient, WS_BASE, CallSession } from '@/lib/api';
import { BrowserAudioStreamer, MicStreamState } from '@/lib/audio_streamer';
import { getSeverityBadgeConfig, formatConfidence, formatDuration, formatRiskScore } from '@/lib/adapters';
import { renderRedactedText, sanitizeTranscript } from '@/lib/privacy';
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
  ShieldX,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ArrowRight,
  GitBranch,
  RefreshCw,
  Volume2,
  UserX,
  PhoneOff,
  Plus,
  AlertCircle,
  HelpCircle,
  Eye,
  Info,
  Sliders,
  Shield,
  Layers,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  timestamp: string;
  turnIndex?: number;
  type: 'CALL_START' | 'VAD_SPEECH' | 'DEEPFAKE_CHECK' | 'SPEAKER_VERIFIED' | 'CONVERSATION_ALERT' | 'RISK_UPDATE' | 'POLICY_TRIGGER' | 'INTERVENTION' | 'STREAM_END';
  title: string;
  description: string;
  severity: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INFO' | 'INCONCLUSIVE';
  riskScore?: number | null;
  velocity?: number;
  isDemo?: boolean;
}

interface ExplainableSignal {
  category: 'DEEPFAKE_SYNTHETIC' | 'SPEAKER_MISMATCH' | 'REPLAY_INJECTION' | 'SOCIAL_ENGINEERING' | 'CREDENTIAL_THEFT' | 'FINANCIAL_FRAUD' | 'BEHAVIORAL_ANOMALY';
  name: string;
  severity: 'SAFE' | 'SUSPICIOUS' | 'CRITICAL' | 'INCONCLUSIVE' | 'NOT_AVAILABLE';
  confidence: number | null;
  timestamp: string | null;
  explanation: string;
  recommendedAction: string;
}

interface EvidenceNode {
  node_id: string;
  layer: string;
  cue: string;
  confidence: number;
}

interface EvidenceGraph {
  nodes: EvidenceNode[];
  edges: { source_node_id: string; target_node_id: string; relationship: string }[];
  primary_findings: string[];
}

export default function CallsPage() {
  // Call sessions state
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallSession | null>(null);
  const [callsLoading, setCallsLoading] = useState(false);
  const [newCallerId, setNewCallerId] = useState('');
  const [showNewCallModal, setShowNewCallModal] = useState(false);

  // Live Call Duration Timer
  const [callDuration, setCallDuration] = useState(0);
  const durationTimerRef = useRef<any>(null);

  // Streaming & WS State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamSource, setStreamSource] = useState<'MIC' | 'DEMO_SCENARIO' | 'NONE'>('NONE');
  const [activeDemoScenario, setActiveDemoScenario] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>('NORMAL_HUMAN');
  const [claimedSpeakerId, setClaimedSpeakerId] = useState('speaker-cfo-001');
  const [wsStatus, setWsStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'AUTHENTICATED' | 'STREAMING' | 'ERROR'>('DISCONNECTED');
  const [wsError, setWsError] = useState<string | null>(null);

  // Real Microphone Capture State
  const [micState, setMicState] = useState<MicStreamState>('IDLE');
  const [micError, setMicError] = useState<string | null>(null);
  const [micRmsDb, setMicRmsDb] = useState<number>(-96);

  // Telemetry state (Acoustic & NLP)
  const [telemetry, setTelemetry] = useState({
    status: 'NOT_AVAILABLE' as 'AVAILABLE' | 'NOT_AVAILABLE' | 'WAITING' | 'ERROR',
    overallAssessment: 'WAITING_FOR_SIGNAL',
    deepfake: {
      status: 'NOT_AVAILABLE' as 'AUTHENTIC' | 'DEEPFAKE_CLONE' | 'SYNTHETIC_ARTIFACTS_DETECTED' | 'INCONCLUSIVE' | 'NOT_AVAILABLE',
      spoofScore: null as number | null,
      confidence: null as number | null,
      uncertainty: null as number | null,
      artifacts: [] as string[],
      explainability: [] as string[],
      latencyMs: 0,
    },
    speaker: {
      status: 'NOT_AVAILABLE' as 'MATCH' | 'MISMATCH' | 'UNENROLLED' | 'INCONCLUSIVE' | 'NOT_AVAILABLE',
      similarityScore: null as number | null,
      confidence: null as number | null,
      isEnrolled: false,
      enrolledSpeakerId: null as string | null,
      explainability: [] as string[],
    },
    replay: {
      status: 'NOT_AVAILABLE' as 'REPLAY_ATTACK' | 'NOT_REPLAY' | 'INCONCLUSIVE' | 'NOT_AVAILABLE',
      replayProbability: null as number | null,
      confidence: null as number | null,
      explainability: [] as string[],
    },
    manipulation: {
      level: 'NO_INDICATOR',
      indicators: [] as string[],
    },
    vad: {
      state: 'SILENCE' as 'SPEECH' | 'SILENCE',
      speechProbability: 0,
    },
    quality: {
      rating: 'GOOD',
      rmsDbfs: -96.0,
      peakAmplitude: 0,
      snrEstimateDb: 0,
      notes: 'Awaiting audio stream',
    },
    temporal: {
      accumulatedSpeechSec: 0,
      isWarmedUp: false,
    },
    conversation: {
      transcript: '',
      redactedTranscript: '',
      language: 'EN',
      languageConfidence: 0.95,
      intent: 'INCOMING_CALL_INITIATED',
      isAdversarialIntent: false,
      requestedAction: null as string | null,
      actionType: null as string | null,
      isHighRiskAction: false,
      tactics: [] as string[],
      progressionState: 'INITIAL_CONTACT',
      sequenceScore: 0,
      highestSeverity: 'LOW',
      claims: [] as { identity: string; org: string; turn: number }[],
      inconsistencies: [] as string[],
      nlpLatencyMs: 0,
    },
    totalAiLatencyMs: 0,
    evidenceSummary: [] as string[],
  });

  // Unified Multi-Modal Risk Fusion State (Strict Fail-Closed Defaults)
  const [unifiedRisk, setUnifiedRisk] = useState({
    status: 'NOT_AVAILABLE' as 'AVAILABLE' | 'NOT_AVAILABLE' | 'DEGRADED',
    overallRiskScore: null as number | null,
    riskLevel: 'INCONCLUSIVE' as 'SAFE' | 'GUARDED' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'INCONCLUSIVE' | 'NOT_AVAILABLE',
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
    riskVelocity: 0.0,
    riskTrajectoryTrend: 'STABLE' as 'ESCALATING' | 'STABLE' | 'DE_ESCALATING',
    primaryDrivers: ['Awaiting audio stream telemetry for multi-modal risk evaluation.'] as string[],
    contradictingSignals: [] as string[],
    evidenceGraph: {
      nodes: [] as EvidenceNode[],
      edges: [] as any[],
      primary_findings: [] as string[],
    } as EvidenceGraph,
    policyRecommendation: null as {
      policy_id: string;
      policy_name?: string;
      version?: string;
      priority?: string;
      is_triggered: boolean;
      recommended_action: string;
      requires_human_approval?: boolean;
      explanation: string;
    } | null,
    humanWorkflowState: 'IDLE' as 'IDLE' | 'AWAITING_HUMAN' | 'EXECUTED' | 'OVERRIDDEN' | 'TERMINATED',
    fusionLatencyMs: 0,
    lastUpdatedAt: new Date().toISOString(),
  });

  // Explainable AI Signals Breakdown ("Why was this call flagged?")
  const [explainableSignals, setExplainableSignals] = useState<ExplainableSignal[]>([]);

  // Timeline events history
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  // Intervention UI State
  const [interventionLoading, setInterventionLoading] = useState(false);
  const [interventionFeedback, setInterventionFeedback] = useState<{
    type: 'SUCCESS' | 'ERROR' | 'INFO';
    message: string;
  } | null>(null);
  const [confirmActionModal, setConfirmActionModal] = useState<{
    action: 'APPROVE' | 'OVERRIDE' | 'TERMINATE' | 'STEP_UP';
    title: string;
    description: string;
  } | null>(null);

  // Live Toast Alerts
  const [liveAlerts, setLiveAlerts] = useState<{
    id: string;
    callId: string;
    severity: string;
    message: string;
    action: string;
    timestamp: string;
  }[]>([]);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioStreamerRef = useRef<BrowserAudioStreamer | null>(null);
  const audioIntervalRef = useRef<any>(null);
  const selectedCallRef = useRef<CallSession | null>(null);
  selectedCallRef.current = selectedCall;

  // Add event helper to timeline
  const addTimelineEvent = useCallback((event: Omit<TimelineEvent, 'id'>) => {
    setTimeline((prev) => [
      {
        ...event,
        id: `tl-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // Live Duration Timer Handler
  useEffect(() => {
    if (isStreaming) {
      if (!durationTimerRef.current) {
        durationTimerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }
  }, [isStreaming]);

  // Fetch Calls on Mount
  useEffect(() => {
    fetchCalls();
    return () => {
      stopStreaming();
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, []);

  const fetchCalls = async () => {
    setCallsLoading(true);
    try {
      const res = await ApiClient.get<CallSession[]>('/calls');
      if (res.success && res.data && res.data.length > 0) {
        setCalls(res.data);
        if (!selectedCall) {
          selectCallSession(res.data[0]);
        }
      } else {
        const fallbackCalls: CallSession[] = [
          {
            id: 'call-sec-demo-101',
            callerIdentifier: '+1 (555) 839-2041',
            callerDisplayName: 'Corporate Wire Request Pretext',
            direction: 'INBOUND',
            status: 'ACTIVE',
            organizationId: '00000000-0000-0000-0000-000000000001',
            claimedSpeakerId: 'speaker-cfo-001',
            createdAt: new Date(Date.now() - 120000).toISOString(),
          },
          {
            id: 'call-sec-demo-102',
            callerIdentifier: '+91 98201 48291',
            callerDisplayName: 'Urgent Helpdesk Password Reset',
            direction: 'INBOUND',
            status: 'ACTIVE',
            organizationId: '00000000-0000-0000-0000-000000000001',
            claimedSpeakerId: 'speaker-admin-002',
            createdAt: new Date(Date.now() - 300000).toISOString(),
          },
        ];
        setCalls(fallbackCalls);
        if (!selectedCall) {
          selectCallSession(fallbackCalls[0]);
        }
      }
    } catch {
      const offlineCall: CallSession = {
        id: 'call-sec-demo-101',
        callerIdentifier: '+1 (555) 839-2041',
        callerDisplayName: 'Corporate Wire Request Pretext',
        direction: 'INBOUND',
        status: 'ACTIVE',
        organizationId: '00000000-0000-0000-0000-000000000001',
        claimedSpeakerId: 'speaker-cfo-001',
        createdAt: new Date().toISOString(),
      };
      setCalls([offlineCall]);
      selectCallSession(offlineCall);
    } finally {
      setCallsLoading(false);
    }
  };

  const selectCallSession = async (call: CallSession) => {
    setSelectedCall(call);
    setInterventionFeedback(null);
    setMicError(null);
    setCallDuration(0);

    try {
      const riskRes = await ApiClient.get(`/risk/${call.id}`);
      if (riskRes.success && riskRes.data) {
        const d = riskRes.data;
        setUnifiedRisk((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          overallRiskScore: d.overall_risk_score ?? d.compositeScore ?? prev.overallRiskScore,
          riskLevel: d.risk_level ?? d.severity ?? prev.riskLevel,
          confidence: d.confidence ?? prev.confidence,
          uncertainty: d.uncertainty ?? prev.uncertainty,
          dimensions: d.dimensions || prev.dimensions,
          riskVelocity: d.risk_velocity ?? 0.0,
          riskTrajectoryTrend: d.risk_trajectory_trend || 'STABLE',
          primaryDrivers: d.primary_drivers || prev.primaryDrivers,
          contradictingSignals: d.contradicting_signals || [],
          evidenceGraph: d.evidence_graph || prev.evidenceGraph,
          policyRecommendation: d.policy_recommendation || null,
          humanWorkflowState: d.human_workflow_state || 'IDLE',
          lastUpdatedAt: d.timestamp || new Date().toISOString(),
        }));
      }
    } catch {}

    try {
      const tlRes = await ApiClient.get(`/risk/${call.id}/timeline`);
      if (tlRes.success && Array.isArray(tlRes.data) && tlRes.data.length > 0) {
        const backendEvents: TimelineEvent[] = tlRes.data.map((item: any, idx: number) => ({
          id: `tl-back-${idx}-${item.turnIndex || idx}`,
          timestamp: item.timestamp || new Date().toISOString(),
          turnIndex: item.turnIndex,
          type: 'RISK_UPDATE',
          title: `Turn ${item.turnIndex ?? idx + 1}: Threat Assessment Update`,
          description: `Risk evaluated at ${item.overallScore ?? item.overall_risk_score ?? 'N/A'} (${item.riskLevel ?? item.risk_level ?? 'INCONCLUSIVE'}). Velocity: +${item.velocity ?? 0}/s`,
          severity: item.riskLevel || 'LOW',
          riskScore: item.overallScore,
          velocity: item.velocity,
        }));
        setTimeline(backendEvents);
      } else {
        setTimeline([
          {
            id: `tl-init-${call.id}`,
            timestamp: call.createdAt || new Date().toISOString(),
            type: 'CALL_START',
            title: 'Call Session Established',
            description: `Channel open for ${call.callerIdentifier} (${call.direction}). Monitoring pipeline active.`,
            severity: 'INFO',
          },
        ]);
      }
    } catch {
      setTimeline([
        {
          id: `tl-init-${call.id}`,
          timestamp: new Date().toISOString(),
          type: 'CALL_START',
          title: 'Call Session Established',
          description: `Channel open for ${call.callerIdentifier} (${call.direction}). Zero synthetic data injected.`,
          severity: 'INFO',
        },
      ]);
    }
  };

  const handleCreateCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCallerId.trim()) return;

    try {
      const res = await ApiClient.post('/calls', {
        callerIdentifier: newCallerId.trim(),
        callerDisplayName: 'Manual Live SOC Pretext Session',
        direction: 'INBOUND',
        claimedSpeakerId,
      });

      if (res.success && res.data) {
        setCalls((prev) => [res.data, ...prev]);
        selectCallSession(res.data);
        setShowNewCallModal(false);
        setNewCallerId('');
      }
    } catch {
      const localCall: CallSession = {
        id: `call-local-${Date.now()}`,
        callerIdentifier: newCallerId.trim(),
        callerDisplayName: 'Simulated Manual Session',
        direction: 'INBOUND',
        status: 'ACTIVE',
        organizationId: '00000000-0000-0000-0000-000000000001',
        claimedSpeakerId,
        createdAt: new Date().toISOString(),
      };
      setCalls((prev) => [localCall, ...prev]);
      selectCallSession(localCall);
      setShowNewCallModal(false);
      setNewCallerId('');
    }
  };

  // WebSocket Connection Management
  const connectWebSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        resolve(wsRef.current);
        return;
      }

      setWsStatus('CONNECTING');
      setWsError(null);

      try {
        const ws = new WebSocket(WS_BASE);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsStatus('AUTHENTICATED');
          const token = localStorage.getItem('voxshield_token') || 'dev-token-phase1';
          ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));

          const currentCall = selectedCallRef.current;
          if (currentCall) {
            ws.send(
              JSON.stringify({
                type: 'START_STREAM',
                callId: currentCall.id,
                streamId: `stream-${Date.now()}`,
              })
            );
          }
          resolve(ws);
        };

        ws.onerror = (err) => {
          setWsStatus('ERROR');
          setWsError('WebSocket gateway unavailable. Using fail-closed status.');
          reject(err);
        };

        ws.onclose = () => {
          setWsStatus('DISCONNECTED');
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'UNIFIED_RISK_ASSESSMENT' && msg.payload) {
              const r = msg.payload;
              setUnifiedRisk((prev) => {
                const nextScore = r.overall_risk_score ?? prev.overallRiskScore;
                const nextLevel = r.risk_level || prev.riskLevel;
                const nextVelocity = r.risk_velocity ?? prev.riskVelocity;

                return {
                  ...prev,
                  status: 'AVAILABLE',
                  overallRiskScore: nextScore,
                  riskLevel: nextLevel,
                  confidence: r.confidence ?? prev.confidence,
                  uncertainty: r.uncertainty ?? prev.uncertainty,
                  dimensions: r.dimensions || prev.dimensions,
                  riskVelocity: nextVelocity,
                  riskTrajectoryTrend: r.risk_trajectory_trend || prev.riskTrajectoryTrend,
                  primaryDrivers: r.primary_drivers || prev.primaryDrivers,
                  contradictingSignals: r.contradicting_signals || prev.contradictingSignals,
                  evidenceGraph: r.evidence_graph || prev.evidenceGraph,
                  policyRecommendation: r.policy_recommendation || prev.policyRecommendation,
                  humanWorkflowState: r.human_workflow_state || prev.humanWorkflowState,
                  fusionLatencyMs: r.fusion_latency_ms || prev.fusionLatencyMs,
                  lastUpdatedAt: r.timestamp || new Date().toISOString(),
                };
              });

              if (r.overall_risk_score !== undefined && r.overall_risk_score !== null) {
                addTimelineEvent({
                  timestamp: r.timestamp || new Date().toISOString(),
                  turnIndex: msg.sequenceNumber,
                  type: 'RISK_UPDATE',
                  title: `Turn ${msg.sequenceNumber ?? ''}: Multi-Modal Risk Update`,
                  description: `Threat Score: ${r.overall_risk_score.toFixed(1)}/100 (${r.risk_level}). Drivers: ${r.primary_drivers?.[0] || 'Multi-modal analysis complete.'}`,
                  severity: r.risk_level === 'CRITICAL' ? 'CRITICAL' : r.risk_level === 'HIGH' ? 'HIGH' : 'MEDIUM',
                  riskScore: r.overall_risk_score,
                  velocity: r.risk_velocity,
                });
              }
            }

            if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
              const p = msg.payload;
              const conv = p.conversation || {};

              setTelemetry((prev) => ({
                ...prev,
                status: 'AVAILABLE',
                overallAssessment: p.overall_assessment || prev.overallAssessment,
                deepfake: {
                  status: p.deepfake?.status || prev.deepfake.status,
                  spoofScore: p.deepfake?.spoof_score ?? prev.deepfake.spoofScore,
                  confidence: p.deepfake?.confidence ?? prev.deepfake.confidence,
                  uncertainty: p.deepfake?.uncertainty ?? prev.deepfake.uncertainty,
                  artifacts: p.deepfake?.artifacts_detected || [],
                  explainability: p.deepfake?.explainability || prev.deepfake.explainability,
                  latencyMs: p.deepfake?.inference_latency_ms || 1.8,
                },
                speaker: {
                  status: p.speaker?.status || prev.speaker.status,
                  similarityScore: p.speaker?.similarity_score ?? prev.speaker.similarityScore,
                  confidence: p.speaker?.confidence ?? prev.speaker.confidence,
                  isEnrolled: p.speaker?.is_enrolled ?? prev.speaker.isEnrolled,
                  enrolledSpeakerId: p.speaker?.enrolled_speaker_id || prev.speaker.enrolledSpeakerId,
                  explainability: p.speaker?.explainability || prev.speaker.explainability,
                },
                replay: {
                  status: p.replay?.status || prev.replay.status,
                  replayProbability: p.replay?.replay_probability ?? prev.replay.replayProbability,
                  confidence: p.replay?.confidence ?? prev.replay.confidence,
                  explainability: p.replay?.explainability || prev.replay.explainability,
                },
                manipulation: {
                  level: p.manipulation?.level || prev.manipulation.level,
                  indicators: p.manipulation?.indicators || [],
                },
                vad: {
                  state: p.vad?.state || prev.vad.state,
                  speechProbability: p.vad?.speech_probability ?? prev.vad.speechProbability,
                },
                quality: {
                  rating: p.quality?.rating || prev.quality.rating,
                  rmsDbfs: p.quality?.rms_dbfs ?? prev.quality.rmsDbfs,
                  peakAmplitude: p.quality?.peak_amplitude ?? prev.quality.peakAmplitude,
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
                  language: conv.asr?.language ? conv.asr.language.toUpperCase() : prev.conversation.language,
                  languageConfidence: conv.asr?.language_confidence ?? prev.conversation.languageConfidence,
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
                  nlpLatencyMs: conv.total_nlp_latency_ms || prev.conversation.nlpLatencyMs,
                },
                totalAiLatencyMs: p.pipeline_latency_ms || prev.totalAiLatencyMs,
                evidenceSummary: p.evidence_summary || prev.evidenceSummary,
              }));

              buildExplainableSignals(p);
            }

            if (msg.type === 'SOCIAL_ENGINEERING_ALERT' && msg.payload) {
              const se = msg.payload;
              addTimelineEvent({
                timestamp: msg.timestamp || new Date().toISOString(),
                type: 'CONVERSATION_ALERT',
                title: 'Critical Social Engineering Progression',
                description: `Progression state: ${se.progression_state}. Score: ${(se.score * 100).toFixed(0)}%. Tactics: ${se.tactics?.join(', ')}`,
                severity: 'CRITICAL',
              });
            }

            if (msg.type === 'POLICY_ENFORCEMENT_TRIGGER' && msg.payload) {
              const pol = msg.payload;
              addTimelineEvent({
                timestamp: msg.timestamp || new Date().toISOString(),
                type: 'POLICY_TRIGGER',
                title: `Deterministic Policy Triggered: ${pol.policy_id || pol.rule_name || 'Enforcement'}`,
                description: `Enforced Action: ${pol.recommended_action || pol.action}. ${pol.explanation || ''}`,
                severity: 'CRITICAL',
              });
            }

            if (msg.type === 'SOC_ALERT' && msg.payload) {
              const alert = {
                id: `alert-${Date.now()}`,
                callId: msg.callId || selectedCallRef.current?.id || 'active',
                severity: msg.payload.severity || 'CRITICAL',
                message: msg.payload.message || 'Threat threshold exceeded',
                action: msg.payload.action || 'INTERVENE',
                timestamp: msg.timestamp || new Date().toISOString(),
              };
              setLiveAlerts((prev) => [alert, ...prev.slice(0, 4)]);
            }
          } catch {}
        };
      } catch (err: any) {
        setWsStatus('ERROR');
        setWsError(err.message || 'Failed to connect WebSocket gateway');
        reject(err);
      }
    });
  }, [addTimelineEvent]);

  const buildExplainableSignals = (p: any) => {
    const signals: ExplainableSignal[] = [];
    const now = new Date().toLocaleTimeString();

    if (p.deepfake?.status === 'DEEPFAKE_CLONE' || (p.deepfake?.spoof_score && p.deepfake.spoof_score > 0.7)) {
      signals.push({
        category: 'DEEPFAKE_SYNTHETIC',
        name: 'Synthetic Voice / Vocoder Artifacts',
        severity: 'CRITICAL',
        confidence: p.deepfake.confidence ?? 0.89,
        timestamp: now,
        explanation: p.deepfake.explainability?.[0] || 'Neural vocoder phase discontinuity & synthetic spectral cluster detected.',
        recommendedAction: 'Enforce out-of-band identity verification immediately.',
      });
    } else if (p.deepfake?.status === 'AUTHENTIC') {
      signals.push({
        category: 'DEEPFAKE_SYNTHETIC',
        name: 'Acoustic Voice Authenticity',
        severity: 'SAFE',
        confidence: p.deepfake.confidence ?? 0.94,
        timestamp: now,
        explanation: 'Bona-fide human glottal pulse timing with organic pitch variation.',
        recommendedAction: 'Continue monitoring secondary behavioral & conversational channels.',
      });
    }

    if (p.speaker?.status === 'MISMATCH') {
      signals.push({
        category: 'SPEAKER_MISMATCH',
        name: 'Speaker Biometric Mismatch',
        severity: 'CRITICAL',
        confidence: p.speaker.confidence ?? 0.84,
        timestamp: now,
        explanation: `Voice embedding diverges significantly from enrolled profile (${claimedSpeakerId}).`,
        recommendedAction: 'Lock high-value transaction authorization.',
      });
    }

    if (p.replay?.status === 'REPLAY_ATTACK') {
      signals.push({
        category: 'REPLAY_INJECTION',
        name: 'Acoustic Replay Attack',
        severity: 'CRITICAL',
        confidence: p.replay.confidence ?? 0.82,
        timestamp: now,
        explanation: 'Double loudspeaker acoustic reverberation and ambient noise mismatch.',
        recommendedAction: 'Challenge caller with dynamic interactive passphrase.',
      });
    }

    const conv = p.conversation || {};
    if (conv.social_engineering?.tactics_detected?.length > 0 || conv.intent?.is_adversarial) {
      signals.push({
        category: 'SOCIAL_ENGINEERING',
        name: 'Social Engineering & Pretexting Tactics',
        severity: 'CRITICAL',
        confidence: 0.91,
        timestamp: now,
        explanation: `Adversarial tactics detected: ${conv.social_engineering?.tactics_detected?.join(', ') || 'Urgency Pretext'}. Progression: ${conv.social_engineering?.progression_state || 'SECRET_HARVESTING'}`,
        recommendedAction: 'Operator intervention: Warn recipient not to disclose authentication tokens.',
      });
    }

    if (conv.requested_action?.action_type === 'CREDENTIAL_HARVESTING' || conv.requested_action?.is_high_risk) {
      signals.push({
        category: 'CREDENTIAL_THEFT',
        name: 'Direct Credential / OTP Solicitation',
        severity: 'CRITICAL',
        confidence: 0.96,
        timestamp: now,
        explanation: `Caller explicitly solicited authentication secrets: ${conv.requested_action?.target_object || 'OTP [REDACTED]'}.`,
        recommendedAction: 'Lock live audio authorization and execute out-of-band Step-Up.',
      });
    }

    setExplainableSignals(signals);
  };

  const startMicStreaming = async () => {
    setMicError(null);
    setActiveDemoScenario(null);
    try {
      const ws = await connectWebSocket();
      setWsStatus('STREAMING');

      const streamer = new BrowserAudioStreamer({
        sampleRate: 16000,
        bufferSize: 4096,
        onChunk: (base64Audio, seq, rmsDb) => {
          setMicRmsDb(rmsDb);
          const currCall = selectedCallRef.current;
          if (ws.readyState === WebSocket.OPEN && currCall) {
            ws.send(
              JSON.stringify({
                type: 'AUDIO_CHUNK',
                callId: currCall.id,
                sequenceNumber: seq,
                payload: {
                  format: 'pcm_s16le',
                  sample_rate: 16000,
                  channels: 1,
                  audio_base64: base64Audio,
                  claimedSpeakerId,
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

      addTimelineEvent({
        timestamp: new Date().toISOString(),
        type: 'VAD_SPEECH',
        title: 'Microphone Stream Active',
        description: 'Streaming live 16 kHz Linear PCM audio to VOXSHIELD neural gateway.',
        severity: 'INFO',
      });
    } catch (err: any) {
      setMicState('ERROR');
      setMicError(err.message || 'Microphone initialization failed');
      setIsStreaming(false);
      setStreamSource('NONE');
    }
  };

  const runDemoScenario = async (scenarioId: string) => {
    setMicError(null);
    setActiveDemoScenario(scenarioId);
    stopStreaming();

    try {
      const ws = await connectWebSocket();
      setWsStatus('STREAMING');
      setIsStreaming(true);
      setStreamSource('DEMO_SCENARIO');
      setMicState('STREAMING');

      let chunkIdx = 0;
      let phrases: string[] = [];

      if (scenarioId === 'NORMAL_HUMAN') {
        phrases = [
          'Hello, this is Robert from Global Procurement.',
          'I am calling regarding invoice INV-8821 for our standard quarterly hardware renewal.',
          'Everything has been approved by finance and we will be processing the vendor payment on Friday.',
        ];
        setTelemetry((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          deepfake: {
            ...prev.deepfake,
            status: 'AUTHENTIC',
            spoofScore: 0.04,
            confidence: 0.96,
            explainability: ['Organic vocal fold vibration', 'Natural formant transitions'],
          },
          speaker: {
            ...prev.speaker,
            status: 'MATCH',
            similarityScore: 0.92,
            confidence: 0.94,
          },
          conversation: {
            ...prev.conversation,
            transcript: phrases[0],
            redactedTranscript: phrases[0],
            intent: 'ROUTINE_VENDOR_INVOICE_INQUIRY',
            isAdversarialIntent: false,
            tactics: [],
          },
        }));
        setUnifiedRisk((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          overallRiskScore: 6.5,
          riskLevel: 'SAFE',
          confidence: 0.95,
          primaryDrivers: ['Bona-fide human speech confirmed with zero adversarial indicators.'],
          dimensions: {
            overall: 6.5,
            identity_impersonation: 5.0,
            deepfake_synthetic: 4.0,
            replay_injection: 3.0,
            social_engineering: 5.0,
            credential_theft: 2.0,
            financial_fraud: 5.0,
            account_takeover: 2.0,
            verification_bypass: 3.0,
            inconsistency: 0.0,
          },
        }));
        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'RISK_UPDATE',
          title: '[DEMO] Scenario 1: Normal Human Call',
          description: 'Acoustic neural classifier verified genuine voice. Threat score: 6.5 / 100 (SAFE).',
          severity: 'SAFE',
          isDemo: true,
        });
      } else if (scenarioId === 'SYNTHETIC_DEEPFAKE') {
        phrases = [
          'Hello, this is the Chief Financial Officer speaking.',
          'I am currently boarding a flight and urgently need you to execute wire transfer WIRE-9941 to beneficiary account 8839.',
          'Do not delay this wire; it is critical for our international acquisition closing today.',
        ];
        setTelemetry((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          deepfake: {
            ...prev.deepfake,
            status: 'DEEPFAKE_CLONE',
            spoofScore: 0.94,
            confidence: 0.91,
            artifacts: ['Vocoder phase anomaly at 4.2 kHz', 'Robotic pitch quantization'],
            explainability: ['Synthetic vocoder artifacts detected at harmonic boundaries'],
          },
          speaker: {
            ...prev.speaker,
            status: 'MISMATCH',
            similarityScore: 0.41,
            confidence: 0.88,
          },
          conversation: {
            ...prev.conversation,
            transcript: phrases[0],
            redactedTranscript: phrases[0],
            intent: 'HIGH_VALUE_WIRE_TRANSFER_PRETEXT',
            isAdversarialIntent: true,
            tactics: ['URGENCY', 'AUTHORITY_IMPERSONATION'],
          },
        }));
        setUnifiedRisk((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          overallRiskScore: 92.5,
          riskLevel: 'CRITICAL',
          confidence: 0.93,
          primaryDrivers: [
            'CRITICAL THREAT: High-confidence AI voice clone deepfake detected (94.0% spoof probability).',
            'Executive impersonation combined with urgent wire transfer pretext.',
          ],
          dimensions: {
            overall: 92.5,
            identity_impersonation: 95.0,
            deepfake_synthetic: 94.0,
            replay_injection: 12.0,
            social_engineering: 88.0,
            credential_theft: 40.0,
            financial_fraud: 96.0,
            account_takeover: 55.0,
            verification_bypass: 85.0,
            inconsistency: 20.0,
          },
          policyRecommendation: {
            policy_id: 'POL-DEEPFAKE-002',
            recommended_action: 'REQUIRE_STEP_UP_VERIFICATION',
            is_triggered: true,
            explanation: 'Acoustic deepfake synthesis detected. Lock voice channel and dispatch out-of-band IdP push.',
          },
        }));
        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'DEEPFAKE_CHECK',
          title: '[DEMO] Scenario 2: Synthetic Voice Deepfake Detected',
          description: 'Acoustic vocoder phase anomalies detected. Spoof probability: 94.0%. Threat: CRITICAL.',
          severity: 'CRITICAL',
          isDemo: true,
        });
      } else if (scenarioId === 'HUMAN_CREDENTIAL_THEFT') {
        phrases = [
          'Hello, this is security analyst Jonathan from corporate IT Helpdesk.',
          'We have detected an active credential compromise on your enterprise login.',
          'Please state the 6-digit one-time passcode OTP 938201 sent to your mobile device right now so I can reset your access.',
        ];
        const rawPhrase = phrases[2];
        const redacted = sanitizeTranscript(rawPhrase);
        setTelemetry((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          deepfake: {
            ...prev.deepfake,
            status: 'AUTHENTIC',
            spoofScore: 0.08,
            confidence: 0.92,
            explainability: ['Acoustic voice is bona-fide human; threat is conversational.'],
          },
          conversation: {
            ...prev.conversation,
            transcript: rawPhrase,
            redactedTranscript: redacted,
            intent: 'CREDENTIAL_HARVESTING_ATTACK',
            isAdversarialIntent: true,
            requestedAction: 'OTP',
            actionType: 'CREDENTIAL_HARVESTING',
            isHighRiskAction: true,
            tactics: ['URGENCY', 'CREDENTIAL_HARVESTING', 'HELPDESK_PRETEXT'],
            progressionState: 'SECRET_HARVESTING_ATTEMPTED',
          },
        }));
        setUnifiedRisk((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          overallRiskScore: 89.0,
          riskLevel: 'CRITICAL',
          confidence: 0.94,
          primaryDrivers: [
            'CRITICAL THREAT: Authentic human voice soliciting sensitive authentication secrets (OTP [REDACTED]).',
            'Multi-modal defense triggered: Low acoustic risk does NOT bypass social-engineering defense.',
          ],
          dimensions: {
            overall: 89.0,
            identity_impersonation: 80.0,
            deepfake_synthetic: 8.0,
            replay_injection: 5.0,
            social_engineering: 94.0,
            credential_theft: 98.0,
            financial_fraud: 60.0,
            account_takeover: 92.0,
            verification_bypass: 90.0,
            inconsistency: 10.0,
          },
          policyRecommendation: {
            policy_id: 'POL-CRED-001',
            recommended_action: 'REQUIRE_STEP_UP_VERIFICATION',
            is_triggered: true,
            explanation: 'OTP solicitation detected. Enforcing deterministic out-of-band challenge.',
          },
        }));
        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'POLICY_TRIGGER',
          title: '[DEMO] Scenario 3: Human Voice + OTP Credential Theft',
          description: 'Acoustic spoof is low, but conversational threat is 98.0% (CRITICAL). OTP [REDACTED] intercepted.',
          severity: 'CRITICAL',
          isDemo: true,
        });
      } else if (scenarioId === 'AI_UNAVAILABLE') {
        setTelemetry((prev) => ({
          ...prev,
          status: 'NOT_AVAILABLE',
          deepfake: {
            ...prev.deepfake,
            status: 'NOT_AVAILABLE',
            spoofScore: null,
            confidence: null,
            uncertainty: null,
            explainability: ['Acoustic neural model service offline or connection timeout.'],
          },
          speaker: {
            ...prev.speaker,
            status: 'NOT_AVAILABLE',
            similarityScore: null,
            confidence: null,
          },
          replay: {
            ...prev.replay,
            status: 'NOT_AVAILABLE',
            replayProbability: null,
          },
        }));
        setUnifiedRisk((prev) => ({
          ...prev,
          status: 'DEGRADED',
          overallRiskScore: null,
          riskLevel: 'INCONCLUSIVE',
          confidence: null,
          uncertainty: 1.0,
          primaryDrivers: ['FAIL-CLOSED: AI Neural Service unavailable. Threat assessment is INCONCLUSIVE.'],
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
        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'RISK_UPDATE',
          title: '[DEMO] Scenario 4: AI Engine Service Degraded / Fail-Closed',
          description: 'Acoustic models offline. System strictly displays INCONCLUSIVE / AI UNAVAILABLE (never Green/Safe).',
          severity: 'INCONCLUSIVE',
          isDemo: true,
        });
        return;
      } else if (scenarioId === 'PRIVACY_REDACTION') {
        phrases = [
          'My payment card number is 4532 8819 0293 1184 and the CVV code is 492.',
          'The confirmation PIN password is Secret@2026 and one-time passcode OTP is 582910.',
        ];
        const rawPhrase = phrases[0];
        const redacted = sanitizeTranscript(rawPhrase);
        setTelemetry((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          conversation: {
            ...prev.conversation,
            transcript: rawPhrase,
            redactedTranscript: redacted,
            intent: 'PAYMENT_INFORMATION_EXCHANGE',
            isAdversarialIntent: false,
            highestSeverity: 'HIGH',
          },
        }));
        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'CONVERSATION_ALERT',
          title: '[DEMO] Scenario 5: Privacy Firewall Redaction Active',
          description: 'Payment card numbers & CVV tokens intercepted and replaced with [REDACTED] before persistence.',
          severity: 'HIGH',
          isDemo: true,
        });
      } else if (scenarioId === 'HIGH_RISK_ESCALATION') {
        phrases = [
          'Execute immediate wire transfer of $120,000 to offshore escrow account immediately or you will face immediate termination.',
        ];
        setTelemetry((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          deepfake: {
            ...prev.deepfake,
            status: 'DEEPFAKE_CLONE',
            spoofScore: 0.98,
            confidence: 0.97,
            explainability: ['Critical neural vocoder synthesis cues detected.'],
          },
          conversation: {
            ...prev.conversation,
            transcript: phrases[0],
            redactedTranscript: phrases[0],
            intent: 'EXTORTION_WIRE_FRAUD',
            isAdversarialIntent: true,
            isHighRiskAction: true,
            tactics: ['EXTORTION', 'URGENCY', 'AUTHORITY_COERCION'],
          },
        }));
        setUnifiedRisk((prev) => ({
          ...prev,
          status: 'AVAILABLE',
          overallRiskScore: 98.0,
          riskLevel: 'CRITICAL',
          confidence: 0.98,
          primaryDrivers: ['CRITICAL EXTORTION THREAT: High-value fraudulent wire demand ($120,000) combined with AI voice deepfake.'],
          dimensions: {
            overall: 98.0,
            identity_impersonation: 98.0,
            deepfake_synthetic: 98.0,
            replay_injection: 40.0,
            social_engineering: 99.0,
            credential_theft: 80.0,
            financial_fraud: 99.0,
            account_takeover: 95.0,
            verification_bypass: 98.0,
            inconsistency: 30.0,
          },
          policyRecommendation: {
            policy_id: 'POL-FIN-003',
            recommended_action: 'TERMINATE_CALL_AND_NOTIFY_AUTHORITIES',
            is_triggered: true,
            explanation: 'Exceeds critical threat threshold (98.0/100). Carrier termination & executive alert recommended.',
          },
        }));
        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'POLICY_TRIGGER',
          title: '[DEMO] Scenario 6: High-Risk Escalation Triggered',
          description: 'Composite threat score 98.0 / 100. Deterministic policy triggered: TERMINATE_CALL_AND_NOTIFY.',
          severity: 'CRITICAL',
          isDemo: true,
        });
      }

      audioIntervalRef.current = setInterval(() => {
        const buffer = new Int16Array(4000);
        for (let i = 0; i < buffer.length; i++) {
          buffer[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 12000;
        }
        const uint8 = new Uint8Array(buffer.buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);
        const phrase = phrases[chunkIdx % phrases.length];

        const currCall = selectedCallRef.current;
        if (ws.readyState === WebSocket.OPEN && currCall) {
          ws.send(
            JSON.stringify({
              type: 'AUDIO_CHUNK',
              callId: currCall.id,
              sequenceNumber: chunkIdx++,
              payload: {
                format: 'pcm_s16le',
                sample_rate: 16000,
                channels: 1,
                audio_base64: base64,
                text_transcript: phrase,
                transcript: phrase,
                claimedSpeakerId,
              },
            })
          );
        }
      }, 500);
    } catch {
      setWsError('Failed to initiate demo test scenario');
    }
  };

  const stopStreaming = () => {
    if (audioStreamerRef.current) {
      audioStreamerRef.current.stop();
      audioStreamerRef.current = null;
    }
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && selectedCall) {
      wsRef.current.send(JSON.stringify({ type: 'END_STREAM', callId: selectedCall.id }));
    }
    setIsStreaming(false);
    setStreamSource('NONE');
    setMicState('STOPPED');
    setMicRmsDb(-96);

    addTimelineEvent({
      timestamp: new Date().toISOString(),
      type: 'STREAM_END',
      title: 'Audio Stream Stopped',
      description: 'Audio session ended by analyst. Real-time telemetry buffer flushed.',
      severity: 'INFO',
    });
  };

  const executeIntervention = async (action: 'APPROVE' | 'OVERRIDE' | 'TERMINATE' | 'STEP_UP') => {
    if (!selectedCall) return;
    setInterventionLoading(true);
    setInterventionFeedback(null);

    try {
      if (action === 'APPROVE' || action === 'STEP_UP') {
        const policyId = unifiedRisk.policyRecommendation?.policy_id || 'POL-CRED-001';
        const recRes = await ApiClient.post('/interventions/recommend', {
          callId: selectedCall.id,
          level: 'LEVEL_2_STEP_UP_VERIFICATION',
          actionType: 'REQUIRE_STEP_UP_VERIFICATION',
          policyId,
          evidenceSummary: unifiedRisk.primaryDrivers,
        });

        if (recRes.success && recRes.data?.id) {
          await ApiClient.post('/interventions/decision', {
            interventionId: recRes.data.id,
            decision: 'APPROVED',
            reason: 'SOC Analyst authorized out-of-band step-up challenge upon threat detection.',
          });
        }

        await ApiClient.post('/verification', {
          callId: selectedCall.id,
          mechanism: 'AUTHENTICATOR_PUSH',
          targetIdentity: claimedSpeakerId,
          payload: { channel: 'IDP_CHALLENGE' },
        });

        setUnifiedRisk((prev) => ({ ...prev, humanWorkflowState: 'EXECUTED' }));
        setInterventionFeedback({
          type: 'SUCCESS',
          message: 'Step-Up Challenge Dispatched to enrolled identity via independent IdP channel.',
        });

        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'INTERVENTION',
          title: 'Analyst Intervention: Step-Up Challenge Enforced',
          description: 'Out-of-band push challenge dispatched to enrolled user identity. Live voice channel locked.',
          severity: 'HIGH',
        });
      } else if (action === 'OVERRIDE') {
        const policyId = unifiedRisk.policyRecommendation?.policy_id || 'POL-CRED-001';
        const recRes = await ApiClient.post('/interventions/recommend', {
          callId: selectedCall.id,
          level: 'LEVEL_1_WARNING',
          actionType: 'OVERRIDE_POLICY',
          policyId,
          evidenceSummary: ['Manual SOC Analyst False Positive Override'],
        });

        if (recRes.success && recRes.data?.id) {
          await ApiClient.post('/interventions/decision', {
            interventionId: recRes.data.id,
            decision: 'OVERRIDDEN',
            reason: 'Analyst verified caller identity via secondary trusted channel.',
          });
        }

        setUnifiedRisk((prev) => ({ ...prev, humanWorkflowState: 'OVERRIDDEN' }));
        setInterventionFeedback({
          type: 'INFO',
          message: 'Alert marked as False Positive with logged analyst justification.',
        });

        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'INTERVENTION',
          title: 'Analyst Intervention: False Positive Overridden',
          description: 'Analyst marked risk alert as overridden with logged justification.',
          severity: 'LOW',
        });
      } else if (action === 'TERMINATE') {
        await ApiClient.patch(`/calls/${selectedCall.id}/status`, {
          status: 'TERMINATED',
          notes: 'Emergency termination executed by SOC Analyst due to critical threat level.',
        });

        stopStreaming();
        setSelectedCall((prev) => (prev ? { ...prev, status: 'TERMINATED' } : null));
        setUnifiedRisk((prev) => ({ ...prev, humanWorkflowState: 'TERMINATED' }));
        setInterventionFeedback({
          type: 'SUCCESS',
          message: 'Call Session Terminated Immediately. Carrier disconnect signal dispatched.',
        });

        addTimelineEvent({
          timestamp: new Date().toISOString(),
          type: 'INTERVENTION',
          title: 'Analyst Intervention: Emergency Call Termination',
          description: 'Carrier disconnect signal dispatched. Session permanently closed.',
          severity: 'CRITICAL',
        });
      }
    } catch (err: any) {
      setInterventionFeedback({
        type: 'ERROR',
        message: err.message || 'Intervention request failed.',
      });
    } finally {
      setInterventionLoading(false);
      setConfirmActionModal(null);
    }
  };

  const currentBadge = getSeverityBadgeConfig(unifiedRisk.riskLevel);

  return (
    <div className="flex h-screen bg-[#1A1A1F] text-[#F5F5F7] overflow-hidden font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Navbar
          title="Live Call Surveillance & Threat Mitigation Command"
          subtitle="Real-Time Acoustic Deepfake Neural Engine • Multi-Modal Fusion • Explainable AI"
        />

        <main className="p-6 space-y-5">
          <Phase1Notice />

          {/* Live Alert Toast Banner */}
          {liveAlerts.length > 0 && (
            <div className="space-y-2">
              {liveAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3.5 rounded-xl bg-[#D94A5A]/15 border border-[#D94A5A]/40 text-xs font-mono text-[#D94A5A] flex items-center justify-between shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-top-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#D94A5A]/20 text-[#D94A5A] border border-[#D94A5A]/40 shadow-sm">
                      <ShieldAlert className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <span className="font-bold text-[#F5F5F7] tracking-wider">
                        CRITICAL SECURITY ALERT [{alert.severity}]: {alert.message}
                      </span>
                      <p className="text-[11px] text-[#A0A4AE]">
                        Affected Call Session: <strong className="text-[#F5F5F7]">{alert.callId}</strong> • Recommended Action: <strong className="text-[#D94A5A]">{alert.action}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setLiveAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                    className="text-[#A0A4AE] hover:text-[#F5F5F7] px-2.5 py-1 text-sm font-bold transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#3A3A42] pb-4">
            <div>
              <h1 className="text-xl font-bold text-[#F5F5F7] flex items-center gap-2.5 tracking-tight">
                <Activity className="w-5 h-5 text-[#7A1F3D]" />
                <span>Live Call Telemetry & Forensic Triage</span>
              </h1>
              <p className="text-xs text-[#A0A4AE] font-mono mt-0.5">
                Real-time speech stream inspection • Pre-persistence PII firewall • Human-in-the-loop control
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Claimed Speaker Selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-mono text-[#A0A4AE]">Biometric Profile:</label>
                <select
                  value={claimedSpeakerId}
                  onChange={(e) => setClaimedSpeakerId(e.target.value)}
                  className="bg-[#24242B] border border-[#3A3A42] text-xs rounded-lg px-2.5 py-1.5 text-[#F5F5F7] font-mono focus:outline-none focus:border-[#7A1F3D] focus:ring-1 focus:ring-[#7A1F3D]/40 shadow-sm transition-all"
                >
                  <option value="speaker-cfo-001">Enrolled CFO (speaker-cfo-001)</option>
                  <option value="speaker-admin-002">Enrolled SysAdmin (speaker-admin-002)</option>
                  <option value="unknown-speaker">Unenrolled Unknown Voice</option>
                </select>
              </div>

              {/* Add Call Button */}
              <button
                onClick={() => setShowNewCallModal(true)}
                className="px-3.5 py-1.5 bg-[#24242B] hover:bg-[#2E2E36] text-[#F5F5F7] rounded-lg text-xs font-mono flex items-center gap-1.5 border border-[#3A3A42] transition-all shadow-sm hover:border-[#7A1F3D]"
              >
                <Plus className="w-3.5 h-3.5 text-[#7A1F3D]" />
                <span>New Session</span>
              </button>
            </div>
          </div>

          {/* VOXSHIELD DEMO LAB • REAL-TIME THREAT SCENARIOS BENCH */}
          <div className="p-4 rounded-xl bg-[#24242B] border border-[#3A3A42] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#7A1F3D] animate-pulse" />
                <span className="text-xs font-bold text-[#F5F5F7] font-mono uppercase tracking-wider">
                  VOXSHIELD DEMO LAB • REAL-TIME THREAT SCENARIOS
                </span>
                <span className="px-2 py-0.5 rounded bg-[#7A1F3D]/20 text-[#F5F5F7] font-mono font-bold text-[10px] border border-[#7A1F3D]/40">
                  SIH TEST BENCH
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#A0A4AE] hidden sm:inline">
                Simulate 6 realistic voice security conditions
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono text-xs">
              <button
                onClick={() => runDemoScenario('NORMAL_HUMAN')}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  activeDemoScenario === 'NORMAL_HUMAN'
                    ? 'bg-[#168F86]/20 border-[#168F86]/60 text-[#168F86] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] hover:border-[#3A3A42]/80 hover:bg-[#2E2E36] text-[#A0A4AE]'
                }`}
              >
                <span className="font-bold text-[11px] text-[#F5F5F7]">1. Normal Human</span>
                <span className="text-[10px] text-[#168F86] mt-1">Authentic & Safe</span>
              </button>

              <button
                onClick={() => runDemoScenario('SYNTHETIC_DEEPFAKE')}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  activeDemoScenario === 'SYNTHETIC_DEEPFAKE'
                    ? 'bg-[#D94A5A]/20 border-[#D94A5A]/60 text-[#D94A5A] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] hover:border-[#3A3A42]/80 hover:bg-[#2E2E36] text-[#A0A4AE]'
                }`}
              >
                <span className="font-bold text-[11px] text-[#F5F5F7]">2. Synthetic Deepfake</span>
                <span className="text-[10px] text-[#D94A5A] mt-1">Acoustic Vocoder Spoof</span>
              </button>

              <button
                onClick={() => runDemoScenario('HUMAN_CREDENTIAL_THEFT')}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  activeDemoScenario === 'HUMAN_CREDENTIAL_THEFT'
                    ? 'bg-[#C87524]/20 border-[#C87524]/60 text-[#C87524] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] hover:border-[#3A3A42]/80 hover:bg-[#2E2E36] text-[#A0A4AE]'
                }`}
              >
                <span className="font-bold text-[11px] text-[#F5F5F7]">3. Human + OTP Theft</span>
                <span className="text-[10px] text-[#C87524] mt-1">Genuine Voice / High Threat</span>
              </button>

              <button
                onClick={() => runDemoScenario('AI_UNAVAILABLE')}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  activeDemoScenario === 'AI_UNAVAILABLE'
                    ? 'bg-[#2E2E36] border-[#3A3A42] text-[#F5F5F7] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] hover:border-[#3A3A42]/80 hover:bg-[#2E2E36] text-[#A0A4AE]'
                }`}
              >
                <span className="font-bold text-[11px] text-[#F5F5F7]">4. AI Unavailable</span>
                <span className="text-[10px] text-[#A0A4AE] mt-1">Fail-Closed / Neutral</span>
              </button>

              <button
                onClick={() => runDemoScenario('PRIVACY_REDACTION')}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  activeDemoScenario === 'PRIVACY_REDACTION'
                    ? 'bg-[#C87524]/20 border-[#C87524]/60 text-[#C87524] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] hover:border-[#3A3A42]/80 hover:bg-[#2E2E36] text-[#A0A4AE]'
                }`}
              >
                <span className="font-bold text-[11px] text-[#F5F5F7]">5. Privacy Redaction</span>
                <span className="text-[10px] text-[#C87524] mt-1">Card / OTP [REDACTED]</span>
              </button>

              <button
                onClick={() => runDemoScenario('HIGH_RISK_ESCALATION')}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  activeDemoScenario === 'HIGH_RISK_ESCALATION'
                    ? 'bg-[#D94A5A]/20 border-[#D94A5A]/60 text-[#D94A5A] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] hover:border-[#3A3A42]/80 hover:bg-[#2E2E36] text-[#A0A4AE]'
                }`}
              >
                <span className="font-bold text-[11px] text-[#F5F5F7]">6. Risk Escalation</span>
                <span className="text-[10px] text-[#D94A5A] mt-1">Carrier Terminate & Lock</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left Column: Active Call Sessions Queue */}
            <div className="bg-[#24242B] p-4 rounded-xl border border-[#3A3A42] shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                <span className="text-xs font-mono font-semibold text-[#A0A4AE] uppercase tracking-wider flex items-center gap-2">
                  <PhoneCall className="w-3.5 h-3.5 text-[#7A1F3D]" />
                  Active Call Queue ({calls.length})
                </span>
                <button
                  onClick={fetchCalls}
                  disabled={callsLoading}
                  className="p-1 text-[#A0A4AE] hover:text-[#F5F5F7] rounded transition-colors"
                  title="Refresh Calls"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${callsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1 font-mono">
                {calls.map((call) => {
                  const isSelected = selectedCall?.id === call.id;
                  const isTerminated = call.status === 'TERMINATED' || call.status === 'BLOCKED';

                  return (
                    <div
                      key={call.id}
                      onClick={() => selectCallSession(call)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#7A1F3D]/20 border-[#7A1F3D] shadow-sm'
                          : 'bg-[#1A1A1F] border-[#3A3A42] hover:border-[#3A3A42]/80 hover:bg-[#2E2E36]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#F5F5F7]">{call.callerIdentifier}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                            isTerminated
                              ? 'bg-[#24242B] text-[#A0A4AE] border-[#3A3A42]'
                              : 'bg-[#168F86]/15 text-[#168F86] border border-[#168F86]/40'
                          }`}
                        >
                          {call.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#A0A4AE] mt-1 line-clamp-1 font-sans">
                        {call.callerDisplayName || 'Voice Interception Channel'}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-[#A0A4AE] mt-2 pt-2 border-t border-[#3A3A42]">
                        <span className="flex items-center gap-1">
                          <Radio className="w-3 h-3 text-[#7A1F3D]" />
                          {call.direction}
                        </span>
                        <span>{new Date(call.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Middle & Right Column: Surveillance & Intelligence Console */}
            <div className="lg:col-span-2 space-y-5">
              {selectedCall ? (
                <>
                  {/* Top Session Header */}
                  <div className="bg-[#24242B] p-4 rounded-xl border border-[#3A3A42] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-base font-bold text-[#F5F5F7]">{selectedCall.callerIdentifier}</h2>
                        <span className={`text-[11px] px-3 py-0.5 rounded-full font-bold uppercase tracking-wider border ${currentBadge.badgeClass}`}>
                          {currentBadge.label} {unifiedRisk.overallRiskScore !== null ? `(${unifiedRisk.overallRiskScore.toFixed(1)}/100)` : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#A0A4AE] mt-1">
                        <span>Session ID: <strong className="text-[#F5F5F7]">{selectedCall.id}</strong></span>
                        <span>•</span>
                        <span>
                          Duration: <strong className="text-[#168F86]">{formatDuration(callDuration)}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          AI Latency: <strong className="text-[#F5F5F7]">{telemetry.totalAiLatencyMs.toFixed(1)}ms</strong>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#A0A4AE] bg-[#1A1A1F] px-2.5 py-1 rounded-lg border border-[#3A3A42]">
                        Channel: <strong className="text-[#F5F5F7]">{selectedCall.direction}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Side-by-Side Dual Stream Surveillance & Simulation Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* CARD 1: LIVE MICROPHONE STREAM */}
                    <div className="bg-[#24242B] p-4 rounded-xl border border-[#3A3A42] shadow-sm flex flex-col justify-between space-y-3.5">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-[#168F86]/15 border border-[#168F86]/30 text-[#168F86]">
                              <Mic className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-xs font-bold text-[#F5F5F7] font-mono uppercase tracking-wider">
                                Live Microphone Stream
                              </h3>
                              <p className="text-[10px] text-[#A0A4AE] font-mono">16 kHz Linear PCM Ingestion</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                            isStreaming && streamSource === 'MIC'
                              ? 'bg-[#168F86]/20 text-[#168F86] border-[#168F86]/40 animate-pulse'
                              : 'bg-[#1A1A1F] text-[#A0A4AE] border-[#3A3A42]'
                          }`}>
                            {isStreaming && streamSource === 'MIC' ? 'LIVE STREAMING' : 'STANDBY'}
                          </span>
                        </div>

                        <p className="text-xs text-[#A0A4AE] leading-relaxed font-sans">
                          Capture real-time acoustic speech directly from your local browser microphone for live biometric & deepfake verification.
                        </p>

                        {/* Mic Audio Energy Visualizer */}
                        {isStreaming && streamSource === 'MIC' && (
                          <div className="p-2.5 rounded-lg bg-[#1A1A1F] border border-[#3A3A42] flex items-center justify-between text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#168F86] animate-ping" />
                              <span className="text-[#A0A4AE] text-[11px]">Signal Level:</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-[#2E2E36] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#168F86] transition-all duration-75"
                                  style={{ width: `${Math.max(0, Math.min(100, (micRmsDb + 60) * 2))}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-[#A0A4AE] font-bold">
                                {micRmsDb > -90 ? `${micRmsDb.toFixed(0)} dB` : 'MUTE'}
                              </span>
                            </div>
                          </div>
                        )}

                        {micError && (
                          <div className="px-3 py-2 rounded-lg bg-[#D94A5A]/15 border border-[#D94A5A]/40 text-xs font-mono text-[#D94A5A] flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-[#D94A5A] shrink-0" />
                            <span><strong>Microphone Error:</strong> {micError}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        {isStreaming && streamSource === 'MIC' ? (
                          <button
                            onClick={stopStreaming}
                            className="w-full py-2.5 px-4 bg-[#D94A5A] hover:bg-[#c43c4b] text-[#F5F5F7] rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-sm border border-[#D94A5A]"
                          >
                            <Square className="w-4 h-4" />
                            <span>Stop Microphone Stream</span>
                          </button>
                        ) : (
                          <button
                            onClick={startMicStreaming}
                            disabled={selectedCall.status === 'TERMINATED'}
                            className="w-full py-2.5 px-4 bg-[#7A1F3D] hover:bg-[#691a34] disabled:opacity-50 text-[#F5F5F7] rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-sm border border-[#7A1F3D]"
                          >
                            <Mic className="w-4 h-4" />
                            <span>Stream Live Microphone</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* CARD 2: TEST SCENARIO STREAM */}
                    <div className="bg-[#24242B] p-4 rounded-xl border border-[#3A3A42] shadow-sm flex flex-col justify-between space-y-3.5">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-[#7A1F3D]/20 border border-[#7A1F3D]/40 text-[#F5F5F7]">
                              <Sparkles className="w-4 h-4 text-[#7A1F3D]" />
                            </div>
                            <div>
                              <h3 className="text-xs font-bold text-[#F5F5F7] font-mono uppercase tracking-wider">
                                Test Scenario Stream
                              </h3>
                              <p className="text-[10px] text-[#A0A4AE] font-mono">Acoustic & Threat Simulation</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                            isStreaming && streamSource === 'DEMO_SCENARIO'
                              ? 'bg-[#7A1F3D]/25 text-[#F5F5F7] border-[#7A1F3D]/50 animate-pulse'
                              : 'bg-[#1A1A1F] text-[#A0A4AE] border-[#3A3A42]'
                          }`}>
                            {isStreaming && streamSource === 'DEMO_SCENARIO' ? 'SIMULATING' : 'READY'}
                          </span>
                        </div>

                        <p className="text-xs text-[#A0A4AE] leading-relaxed font-sans">
                          Inject realistic synthetic voice cloning, credential theft, and extortion scenarios into the triage engine.
                        </p>

                        {/* Scenario Dropdown Selector */}
                        <div className="space-y-1 font-mono">
                          <label className="text-[10px] text-[#A0A4AE] uppercase tracking-wider">Select Threat Scenario:</label>
                          <select
                            value={activeDemoScenario || selectedScenario}
                            onChange={(e) => {
                              setSelectedScenario(e.target.value);
                              if (isStreaming && streamSource === 'DEMO_SCENARIO') {
                                runDemoScenario(e.target.value);
                              }
                            }}
                            disabled={selectedCall.status === 'TERMINATED'}
                            className="w-full bg-[#1A1A1F] border border-[#3A3A42] text-xs rounded-lg px-3 py-2 text-[#F5F5F7] font-mono focus:outline-none focus:border-[#7A1F3D] focus:ring-1 focus:ring-[#7A1F3D]/40 transition-all shadow-inner"
                          >
                            <option value="NORMAL_HUMAN">1. Normal Human Voice (Authentic & Safe)</option>
                            <option value="SYNTHETIC_DEEPFAKE">2. Synthetic AI Deepfake (Acoustic Spoof)</option>
                            <option value="HUMAN_CREDENTIAL_THEFT">3. Human Voice + OTP Theft (Credential Pretext)</option>
                            <option value="AI_UNAVAILABLE">4. AI Service Degraded (Fail-Closed / Neutral)</option>
                            <option value="PRIVACY_REDACTION">5. Privacy Firewall Redaction (PII / Card / PIN)</option>
                            <option value="HIGH_RISK_ESCALATION">6. Extortion & Wire Escalation (Carrier Terminate)</option>
                          </select>
                        </div>

                        {/* Active Scenario Indicator */}
                        {isStreaming && streamSource === 'DEMO_SCENARIO' && (
                          <div className="p-2 rounded-lg bg-[#1A1A1F] border border-[#7A1F3D]/40 flex items-center justify-between text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#7A1F3D] animate-ping" />
                              <span className="text-[#A0A4AE] text-[10px]">Active Vector:</span>
                            </div>
                            <span className="text-[10px] text-[#F5F5F7] font-bold truncate max-w-[180px]">
                              {activeDemoScenario}
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        {isStreaming && streamSource === 'DEMO_SCENARIO' ? (
                          <button
                            onClick={stopStreaming}
                            className="w-full py-2.5 px-4 bg-[#D94A5A] hover:bg-[#c43c4b] text-[#F5F5F7] rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-sm border border-[#D94A5A]"
                          >
                            <Square className="w-4 h-4" />
                            <span>Stop Scenario Stream</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => runDemoScenario(selectedScenario)}
                            disabled={selectedCall.status === 'TERMINATED'}
                            className="w-full py-2.5 px-4 bg-[#2E2E36] hover:bg-[#3A3A42] hover:border-[#7A1F3D] disabled:opacity-50 text-[#F5F5F7] rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-sm border border-[#3A3A42]"
                          >
                            <Play className="w-4 h-4 text-[#7A1F3D]" />
                            <span>Start Scenario Stream</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 1. EXPLAINABLE AI: "Why was this call flagged?" */}
                  <div className="bg-[#24242B] p-5 rounded-xl border border-[#3A3A42] shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-[#7A1F3D]" />
                        <h3 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider font-mono">
                          Explainable AI Diagnostic: Why was this call flagged?
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono text-[#A0A4AE]">
                        Signal-by-signal transparent attribution
                      </span>
                    </div>

                    {/* Threat Drivers List */}
                    <div className="space-y-2 font-mono text-xs">
                      {unifiedRisk.primaryDrivers.map((driver, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-[#1A1A1F] border border-[#3A3A42] text-[#F5F5F7] flex items-start gap-2.5 hover:border-[#3A3A42]/80 transition-colors"
                        >
                          <span className="text-[#7A1F3D] font-bold mt-0.5">•</span>
                          <span className="leading-relaxed font-sans text-[#F5F5F7]">{driver}</span>
                        </div>
                      ))}
                    </div>

                    {/* Breakdown by Threat Categories */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 font-mono text-xs">
                      {/* Deepfake & Synthetic Voice */}
                      <div className="p-3 rounded-lg bg-[#1A1A1F] border border-[#3A3A42] space-y-1.5 hover:border-[#3A3A42]/80 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#F5F5F7] flex items-center gap-1.5">
                            <Volume2 className="w-3.5 h-3.5 text-[#168F86]" />
                            Acoustic Deepfake
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                              telemetry.deepfake.status === 'DEEPFAKE_CLONE'
                                ? 'bg-[#D94A5A]/15 text-[#D94A5A] border-[#D94A5A]/40'
                                : telemetry.deepfake.status === 'AUTHENTIC'
                                ? 'bg-[#168F86]/15 text-[#168F86] border-[#168F86]/40'
                                : 'bg-[#24242B] text-[#A0A4AE] border-[#3A3A42]'
                            }`}
                          >
                            {telemetry.deepfake.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#A0A4AE] flex justify-between">
                          <span>Spoof Probability:</span>
                          <strong className="text-[#F5F5F7]">
                            {telemetry.deepfake.spoofScore !== null ? `${(telemetry.deepfake.spoofScore * 100).toFixed(1)}%` : 'N/A'}
                          </strong>
                        </div>
                        <div className="text-[11px] text-[#A0A4AE] flex justify-between">
                          <span>Confidence:</span>
                          <strong className="text-[#F5F5F7]">{formatConfidence(telemetry.deepfake.confidence)}</strong>
                        </div>
                      </div>

                      {/* Speaker Biometric Check */}
                      <div className="p-3 rounded-lg bg-[#1A1A1F] border border-[#3A3A42] space-y-1.5 hover:border-[#3A3A42]/80 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#F5F5F7] flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-[#7A1F3D]" />
                            Speaker Biometrics
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                              telemetry.speaker.status === 'MATCH'
                                ? 'bg-[#168F86]/15 text-[#168F86] border-[#168F86]/40'
                                : telemetry.speaker.status === 'MISMATCH'
                                ? 'bg-[#D94A5A]/15 text-[#D94A5A] border-[#D94A5A]/40'
                                : 'bg-[#24242B] text-[#A0A4AE] border-[#3A3A42]'
                            }`}
                          >
                            {telemetry.speaker.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#A0A4AE] flex justify-between">
                          <span>Similarity:</span>
                          <strong className="text-[#F5F5F7]">
                            {telemetry.speaker.similarityScore !== null ? `${(telemetry.speaker.similarityScore * 100).toFixed(0)}%` : 'N/A'}
                          </strong>
                        </div>
                        <div className="text-[11px] text-[#A0A4AE] flex justify-between">
                          <span>Profile:</span>
                          <strong className="text-[#F5F5F7]">{claimedSpeakerId}</strong>
                        </div>
                      </div>

                      {/* Social Engineering & Urgency */}
                      <div className="p-3 rounded-lg bg-[#1A1A1F] border border-[#3A3A42] space-y-1.5 hover:border-[#3A3A42]/80 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#F5F5F7] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-[#C87524]" />
                            Social Engineering
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                              telemetry.conversation.isAdversarialIntent
                                ? 'bg-[#D94A5A]/15 text-[#D94A5A] border-[#D94A5A]/40'
                                : 'bg-[#24242B] text-[#A0A4AE] border-[#3A3A42]'
                            }`}
                          >
                            {telemetry.conversation.progressionState}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#A0A4AE] flex justify-between">
                          <span>Intent:</span>
                          <strong className="text-[#F5F5F7] truncate max-w-[180px]">{telemetry.conversation.intent}</strong>
                        </div>
                        <div className="text-[11px] text-[#A0A4AE] flex justify-between">
                          <span>Tactics:</span>
                          <strong className="text-[#C87524]">
                            {telemetry.conversation.tactics.length > 0 ? telemetry.conversation.tactics.join(', ') : 'None reported'}
                          </strong>
                        </div>
                      </div>

                      {/* Credential Theft Solicitation */}
                      <div className="p-3 rounded-lg bg-[#1A1A1F] border border-[#3A3A42] space-y-1.5 hover:border-[#3A3A42]/80 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#F5F5F7] flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-[#D94A5A]" />
                            Credential Threat
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                              telemetry.conversation.requestedAction
                                ? 'bg-[#D94A5A]/15 text-[#D94A5A] border-[#D94A5A]/40'
                                : 'bg-[#168F86]/15 text-[#168F86] border-[#168F86]/40'
                            }`}
                          >
                            {telemetry.conversation.requestedAction ? 'SOLICITED' : 'NONE DETECTED'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#A0A4AE] flex justify-between">
                          <span>Target:</span>
                          <strong className="text-[#D94A5A]">{telemetry.conversation.requestedAction || 'None'}</strong>
                        </div>
                        <div className="text-[11px] text-[#A0A4AE] flex justify-between">
                          <span>Firewall Action:</span>
                          <strong className="text-[#168F86]">Deterministic Redaction</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. 10-DIMENSIONAL THREAT MATRIX */}
                  <div className="bg-[#24242B] p-5 rounded-xl border border-[#3A3A42] shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[#7A1F3D]" />
                        10-Dimensional Multi-Modal Threat Tensor
                      </span>
                      <div className="flex items-center gap-3 text-[11px] font-mono">
                        <span className="text-[#A0A4AE]">
                          Confidence: <strong className="text-[#168F86]">{formatConfidence(unifiedRisk.confidence)}</strong>
                        </span>
                        <span className="text-[#A0A4AE] flex items-center gap-1">
                          Velocity: <TrendingUp className="w-3 h-3 text-[#D94A5A]" />
                          <strong className="text-[#D94A5A]">+{unifiedRisk.riskVelocity.toFixed(1)}/s</strong>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                      {[
                        { label: 'Credential Theft', val: unifiedRisk.dimensions.credential_theft, color: 'bg-[#D94A5A]' },
                        { label: 'Social Eng.', val: unifiedRisk.dimensions.social_engineering, color: 'bg-[#D94A5A]' },
                        { label: 'Verification Bypass', val: unifiedRisk.dimensions.verification_bypass, color: 'bg-[#D94A5A]' },
                        { label: 'Financial Fraud', val: unifiedRisk.dimensions.financial_fraud, color: 'bg-[#C87524]' },
                        { label: 'Identity Impersonation', val: unifiedRisk.dimensions.identity_impersonation, color: 'bg-[#7A1F3D]' },
                        { label: 'Account Takeover', val: unifiedRisk.dimensions.account_takeover, color: 'bg-[#C87524]' },
                        { label: 'Deepfake Synth', val: unifiedRisk.dimensions.deepfake_synthetic, color: 'bg-[#168F86]' },
                        { label: 'Replay Injection', val: unifiedRisk.dimensions.replay_injection, color: 'bg-[#168F86]' },
                        { label: 'Inconsistency', val: unifiedRisk.dimensions.inconsistency, color: 'bg-[#168F86]' },
                        { label: 'Overall Threat', val: unifiedRisk.dimensions.overall, color: 'bg-[#D94A5A]' },
                      ].map((dim, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-[#1A1A1F] border border-[#3A3A42] space-y-1 font-mono">
                          <div className="flex justify-between text-[10px] text-[#A0A4AE]">
                            <span className="truncate">{dim.label}</span>
                            <span className="font-bold text-[#F5F5F7]">{dim.val !== null && dim.val !== undefined ? dim.val.toFixed(0) : 'N/A'}</span>
                          </div>
                          <div className="h-1.5 w-full bg-[#2E2E36] rounded-full overflow-hidden">
                            <div
                              className={`h-full ${dim.color} rounded-full transition-all duration-300`}
                              style={{ width: `${Math.min(100, dim.val || 0)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. POLICY ENFORCEMENT & HUMAN INTERVENTION CONSOLE */}
                  <div className="p-5 rounded-xl bg-[#24242B] border border-[#3A3A42] shadow-sm space-y-3 font-mono">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-[#D94A5A] animate-pulse" />
                        <span className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider">
                          Policy Enforcement & Human Intervention Console
                        </span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#C87524]/15 text-[#C87524] font-bold border border-[#C87524]/30">
                        {unifiedRisk.humanWorkflowState}
                      </span>
                    </div>

                    <p className="text-xs text-[#A0A4AE] font-sans">
                      {unifiedRisk.policyRecommendation?.explanation ||
                        'Policy Engine Active: Deterministic rules monitoring multi-modal acoustic, biometric, and conversational telemetry.'}
                    </p>

                    {interventionFeedback && (
                      <div
                        className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                          interventionFeedback.type === 'SUCCESS'
                            ? 'bg-[#168F86]/15 border border-[#168F86]/40 text-[#168F86]'
                            : interventionFeedback.type === 'ERROR'
                            ? 'bg-[#D94A5A]/15 border border-[#D94A5A]/40 text-[#D94A5A]'
                            : 'bg-[#7A1F3D]/20 border border-[#7A1F3D]/40 text-[#F5F5F7]'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{interventionFeedback.message}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                      <button
                        onClick={() =>
                          setConfirmActionModal({
                            action: 'OVERRIDE',
                            title: 'Override Policy Warning',
                            description:
                              'Are you sure you want to mark this alert as a False Positive? This decision will be logged to the immutable audit trail with your analyst credentials.',
                          })
                        }
                        disabled={interventionLoading || selectedCall.status === 'TERMINATED'}
                        className="px-3 py-1.5 bg-[#1A1A1F] hover:bg-[#2E2E36] disabled:opacity-50 text-[#A0A4AE] hover:text-[#F5F5F7] rounded-lg text-xs flex items-center gap-1.5 transition-all border border-[#3A3A42]"
                      >
                        <XCircle className="w-3.5 h-3.5 text-[#A0A4AE]" />
                        <span>Override False Positive</span>
                      </button>

                      <button
                        onClick={() =>
                          setConfirmActionModal({
                            action: 'TERMINATE',
                            title: 'Emergency Call Termination',
                            description:
                              'Are you sure you want to forcibly terminate this active call session? Carrier disconnect signal will be broadcasted immediately.',
                          })
                        }
                        disabled={interventionLoading || selectedCall.status === 'TERMINATED'}
                        className="px-3 py-1.5 bg-[#D94A5A] hover:bg-[#c43c4b] disabled:opacity-50 text-[#F5F5F7] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-[#D94A5A]"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        <span>Terminate Call</span>
                      </button>

                      <button
                        onClick={() =>
                          setConfirmActionModal({
                            action: 'APPROVE',
                            title: 'Enforce Step-Up Verification',
                            description:
                              'Dispatch an out-of-band push authentication challenge to the enrolled executive profile via independent corporate IdP.',
                          })
                        }
                        disabled={interventionLoading || selectedCall.status === 'TERMINATED'}
                        className="px-3.5 py-1.5 bg-[#7A1F3D] hover:bg-[#691a34] disabled:opacity-50 text-[#F5F5F7] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm border border-[#7A1F3D]"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Enforce Out-of-Band Step-Up Challenge</span>
                      </button>
                    </div>
                  </div>

                  {/* 4. CONVERSATIONAL STREAM & PRIVACY REDACTION */}
                  <div className="bg-[#24242B] p-4 rounded-xl border border-[#3A3A42] shadow-sm space-y-2.5 font-mono">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#A0A4AE] flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
                        <MessageSquare className="w-3.5 h-3.5 text-[#7A1F3D]" />
                        Pre-Persistence Redacted Transcript Stream
                      </span>
                      <span className="text-[10px] text-[#168F86] font-bold px-2 py-0.5 rounded bg-[#168F86]/15 border border-[#168F86]/30">
                        {telemetry.conversation.language} ({telemetry.conversation.intent})
                      </span>
                    </div>

                    <div className="text-xs text-[#F5F5F7] bg-[#1A1A1F] p-3.5 rounded-lg border border-[#3A3A42] leading-relaxed font-sans shadow-inner">
                      "{renderRedactedText(telemetry.conversation.redactedTranscript || telemetry.conversation.transcript) ||
                        'Listening for live conversational audio turn...'}"
                    </div>

                    {telemetry.conversation.tactics.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                        <span className="text-[#A0A4AE]">Tactics Detected:</span>
                        {telemetry.conversation.tactics.map((t, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-[#D94A5A]/15 text-[#D94A5A] border border-[#D94A5A]/30 font-bold">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 5. CHRONOLOGICAL SECURITY RISK TIMELINE */}
                  <div className="bg-[#24242B] p-5 rounded-xl border border-[#3A3A42] shadow-sm space-y-3 font-mono">
                    <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                      <span className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#7A1F3D]" />
                        Chronological Risk Timeline & Security Audit Trail
                      </span>
                      <span className="text-[10px] text-[#A0A4AE]">{timeline.length} Events Recorded</span>
                    </div>

                    <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                      {timeline.length > 0 ? (
                        timeline.map((event) => (
                          <div
                            key={event.id}
                            className={`p-2.5 rounded-lg border text-xs space-y-1 transition-all ${
                              event.severity === 'CRITICAL'
                                ? 'bg-[#D94A5A]/10 border-[#D94A5A]/40 text-[#D94A5A]'
                                : event.severity === 'HIGH'
                                ? 'bg-[#C87524]/10 border-[#C87524]/30 text-[#C87524]'
                                : event.severity === 'MEDIUM'
                                ? 'bg-[#C87524]/8 border-[#C87524]/20 text-[#C87524]'
                                : event.severity === 'SAFE'
                                ? 'bg-[#168F86]/10 border-[#168F86]/30 text-[#168F86]'
                                : 'bg-[#1A1A1F] border-[#3A3A42] text-[#A0A4AE]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold flex items-center gap-1.5 text-[#F5F5F7]">
                                {event.isDemo && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-[#7A1F3D]/25 text-[#F5F5F7] border border-[#7A1F3D]/40">
                                    DEMO
                                  </span>
                                )}
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#2E2E36] text-[#A0A4AE]">
                                  {event.type}
                                </span>
                                <span>{event.title}</span>
                              </span>
                              <span className="text-[10px] text-[#A0A4AE]">
                                {new Date(event.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#A0A4AE] font-sans">{event.description}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[#A0A4AE] text-xs">
                          No timeline events yet. Initiate audio stream to record real-time telemetry.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-[#24242B] p-12 text-center text-[#A0A4AE] text-sm font-mono rounded-xl border border-[#3A3A42] shadow-sm">
                  Select a call session from the left queue to begin live monitoring and threat triage.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Confirmation Action Modal */}
      {confirmActionModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#2E2E36] p-6 rounded-2xl border border-[#3A3A42] shadow-2xl space-y-4 font-mono animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#D94A5A]/20 text-[#D94A5A] border border-[#D94A5A]/40">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F7]">{confirmActionModal.title}</h3>
                <p className="text-xs text-[#A0A4AE]">SOC Analyst Action Confirmation</p>
              </div>
            </div>

            <p className="text-xs text-[#A0A4AE] leading-relaxed bg-[#1A1A1F] p-3 rounded-lg border border-[#3A3A42] font-sans">
              {confirmActionModal.description}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmActionModal(null)}
                className="px-4 py-2 bg-[#24242B] hover:bg-[#3A3A42] text-[#A0A4AE] hover:text-[#F5F5F7] rounded-lg text-xs transition-colors border border-[#3A3A42]"
              >
                Cancel
              </button>
              <button
                onClick={() => executeIntervention(confirmActionModal.action)}
                disabled={interventionLoading}
                className="px-4 py-2 bg-[#D94A5A] hover:bg-[#c43c4b] text-[#F5F5F7] rounded-lg text-xs font-bold shadow-sm transition-all border border-[#D94A5A]"
              >
                {interventionLoading ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Call Modal */}
      {showNewCallModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#2E2E36] p-6 rounded-2xl border border-[#3A3A42] shadow-2xl space-y-4 font-mono animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-[#F5F5F7] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#7A1F3D]" />
              <span>Simulate New Call Session</span>
            </h3>

            <form onSubmit={handleCreateCall} className="space-y-3">
              <div>
                <label className="block text-xs text-[#A0A4AE] mb-1">Caller Identifier / Phone Number</label>
                <input
                  type="text"
                  value={newCallerId}
                  onChange={(e) => setNewCallerId(e.target.value)}
                  placeholder="+1 (555) 019-2834 or SIP:operator@corp"
                  required
                  className="w-full p-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] placeholder-[#A0A4AE]/50 focus:outline-none focus:border-[#7A1F3D] focus:ring-1 focus:ring-[#7A1F3D]/40"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#3A3A42]">
                <button
                  type="button"
                  onClick={() => setShowNewCallModal(false)}
                  className="px-4 py-2 bg-[#24242B] hover:bg-[#3A3A42] text-[#A0A4AE] hover:text-[#F5F5F7] rounded-lg text-xs transition-colors border border-[#3A3A42]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#7A1F3D] hover:bg-[#691a34] text-[#F5F5F7] rounded-lg text-xs font-bold shadow-sm transition-all border border-[#7A1F3D]"
                >
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
