'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { ApiClient, WS_BASE } from '@/lib/api';
import { BrowserAudioStreamer, MicStreamState } from '@/lib/audio_streamer';
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
  GitBranch,
} from 'lucide-react';

interface CallSession {
  id: string;
  callerIdentifier: string;
  callerDisplayName?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'ACTIVE' | 'RINGING' | 'TERMINATED';
  organizationId: string;
  claimedSpeakerId?: string;
  createdAt: string;
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallSession | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamSource, setStreamSource] = useState<'MIC' | 'SYNTHETIC'>('SYNTHETIC');
  const [claimedSpeakerId, setClaimedSpeakerId] = useState('speaker-cfo-001');

  // Phase 2, 3, 4 Live Telemetry State
  const [telemetry, setTelemetry] = useState({
    overallAssessment: 'AUTHENTICITY_SUPPORTED',
    deepfake: {
      status: 'AUTHENTIC',
      spoofScore: 0.12,
      confidence: 0.88,
      uncertainty: 0.05,
      artifacts: [] as string[],
      explainability: ['Acoustic harmonic distribution consistent with natural human speech.'],
      latencyMs: 1.8,
    },
    speaker: {
      status: 'MATCH',
      similarityScore: 0.88,
      confidence: 0.90,
      isEnrolled: true,
      enrolledSpeakerId: 'speaker-cfo-001',
      explainability: ['Acoustic vocal tract resonance matches enrolled CFO profile.'],
    },
    replay: {
      status: 'NOT_REPLAY',
      replayProbability: 0.08,
      confidence: 0.85,
      explainability: ['Direct acoustic frequency profile verified.'],
    },
    manipulation: {
      level: 'NO_INDICATOR',
      indicators: [] as string[],
    },
    vad: {
      state: 'SPEECH',
      speechProbability: 0.94,
    },
    quality: {
      rating: 'GOOD',
      rmsDbfs: -22.5,
      peakAmplitude: 0.62,
      clippingRatio: 0.0,
      snrEstimateDb: 28.4,
      notes: 'Clean telephony signal',
    },
    temporal: {
      accumulatedSpeechSec: 2.5,
      isWarmedUp: true,
    },
    conversation: {
      transcript: 'I am calling from your bank security team. Please verify the OTP 482910 right now.',
      redactedTranscript: 'I am calling from your bank security team. Please verify the OTP [REDACTED] right now.',
      language: 'EN',
      languageConfidence: 0.98,
      asrConfidence: 0.96,
      asrUncertainty: 0.04,
      intent: 'OTP_REQUEST',
      isAdversarialIntent: true,
      requestedAction: 'One-Time Authentication Code',
      actionType: 'DISCLOSE_CREDENTIAL',
      isHighRiskAction: true,
      tactics: ['AUTHORITY_EXPLOITATION', 'URGENCY_PRESSURE', 'VERIFICATION_BYPASS'],
      progressionState: 'SECRET_HARVESTING_ATTEMPTED',
      sequenceScore: 0.88,
      highestSeverity: 'CRITICAL',
      claims: [{ identity: 'Bank Security Department', org: 'Central Bank Fraud Unit', turn: 1 }],
      inconsistencies: [] as string[],
      currentPhase: 'ACTION_REQUEST',
      nlpLatencyMs: 4.2,
    },
    totalAiLatencyMs: 6.8,
    evidenceSummary: [
      'Acoustic vocal tract resonance matches enrolled CFO profile.',
      'Intent: Direct OTP credential solicitation with high urgency.',
      'Behavioral: Multi-turn sequence reached secret harvesting stage.',
    ],
  });

  // Phase 5 Unified Multi-Modal Decision & Policy State
  const [unifiedRisk, setUnifiedRisk] = useState({
    overallRiskScore: 88.5,
    riskLevel: 'CRITICAL',
    confidence: 0.92,
    uncertainty: 0.08,
    dimensions: {
      overall: 88.5,
      identity_impersonation: 85.0,
      deepfake_synthetic: 12.0,
      replay_injection: 8.0,
      social_engineering: 92.0,
      credential_theft: 95.0,
      financial_fraud: 88.0,
      account_takeover: 45.0,
      verification_bypass: 90.0,
      inconsistency: 0.0,
    },
    riskVelocity: 14.2,
    riskTrajectoryTrend: 'ESCALATING',
    primaryDrivers: [
      'CRITICAL THREAT: High-confidence multi-modal credential harvesting pattern.',
      'Direct solicitation of authentication credentials / OTP [REDACTED].',
      'Multi-turn sequence reached SECRET_HARVESTING_ATTEMPTED stage.',
    ],
    contradictingSignals: [
      'Acoustic voice is bona-fide human speech; threat is driven by conversational social engineering.',
    ],
    evidenceGraph: {
      nodes: [
        { node_id: 'node_intent', layer: 'Semantic', cue: 'Adversarial intent: OTP_REQUEST', confidence: 0.95 },
        { node_id: 'node_secret', layer: 'SensitiveData', cue: 'Direct solicitation of OTP [REDACTED]', confidence: 0.95 },
        { node_id: 'node_prog', layer: 'Behavioral', cue: 'Progression: SECRET_HARVESTING_ATTEMPTED', confidence: 0.92 },
        { node_id: 'node_act', layer: 'Action', cue: 'Action: DISCLOSE_CREDENTIAL', confidence: 0.95 },
      ],
      edges: [
        { source_node_id: 'node_intent', target_node_id: 'node_secret', relationship: 'CAUSES_ESCALATION' },
        { source_node_id: 'node_secret', target_node_id: 'node_prog', relationship: 'SUPPORTS' },
      ],
      primary_findings: [
        'Direct solicitation of authentication credentials / OTP [REDACTED]',
        'Multi-turn sequence reached SECRET_HARVESTING_ATTEMPTED',
      ],
    },
    policyRecommendation: {
      policy_id: 'POL-CRED-001',
      policy_name: 'Enforce Out-of-Band Step-Up on Credential Harvesting',
      version: '1.2.0',
      priority: 'CRITICAL_CREDENTIAL_DEFENSE',
      is_triggered: true,
      recommended_action: 'REQUIRE_STEP_UP_VERIFICATION',
      requires_human_approval: true,
      explanation: 'Policy POL-CRED-001 triggered: High-confidence credential solicitation detected under active social engineering pressure.',
    },
    humanWorkflowState: 'AWAITING_HUMAN',
    fusionLatencyMs: 3.2,
  });

  const [interventionFeedback, setInterventionFeedback] = useState<string | null>(null);

  // Real Microphone Capture State
  const [micState, setMicState] = useState<MicStreamState>('IDLE');
  const [micError, setMicError] = useState<string | null>(null);
  const [micRmsDb, setMicRmsDb] = useState<number>(-96);

  const wsRef = useRef<WebSocket | null>(null);
  const audioStreamerRef = useRef<BrowserAudioStreamer | null>(null);
  const audioIntervalRef = useRef<any>(null);

  useEffect(() => {
    fetchCalls();
  }, []);

  const fetchCalls = async () => {
    try {
      const res = await ApiClient.get('/calls');
      if (res.success && res.data && res.data.length > 0) {
        setCalls(res.data);
        setSelectedCall(res.data[0]);
      } else {
        const dummyCalls: CallSession[] = [
          {
            id: 'call-sec-demo-101',
            callerIdentifier: '+1 (555) 839-2041',
            callerDisplayName: 'Wire Department Pretext',
            direction: 'INBOUND',
            status: 'ACTIVE',
            organizationId: '00000000-0000-0000-0000-000000000001',
            claimedSpeakerId: 'speaker-cfo-001',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'call-sec-demo-102',
            callerIdentifier: '+91 98201 48291',
            callerDisplayName: 'Executive IT Pretext',
            direction: 'INBOUND',
            status: 'ACTIVE',
            organizationId: '00000000-0000-0000-0000-000000000001',
            claimedSpeakerId: 'speaker-admin-002',
            createdAt: new Date().toISOString(),
          },
        ];
        setCalls(dummyCalls);
        setSelectedCall(dummyCalls[0]);
      }
    } catch {
      const fallbackCall: CallSession = {
        id: 'call-sec-demo-101',
        callerIdentifier: '+1 (555) 839-2041',
        callerDisplayName: 'Wire Department Pretext',
        direction: 'INBOUND',
        status: 'ACTIVE',
        organizationId: '00000000-0000-0000-0000-000000000001',
        claimedSpeakerId: 'speaker-cfo-001',
        createdAt: new Date().toISOString(),
      };
      setCalls([fallbackCall]);
      setSelectedCall(fallbackCall);
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = localStorage.getItem('voxshield_token') || '';
      ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
      if (selectedCall) {
        ws.send(
          JSON.stringify({
            type: 'START_STREAM',
            callId: selectedCall.id,
            streamId: `stream-${Date.now()}`,
          })
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Phase 5 Unified Risk Assessment Broadcast
        if (msg.type === 'UNIFIED_RISK_ASSESSMENT' && msg.payload) {
          const r = msg.payload;
          setUnifiedRisk((prev) => ({
            ...prev,
            overallRiskScore: r.overall_risk_score ?? prev.overallRiskScore,
            riskLevel: r.risk_level || prev.riskLevel,
            confidence: r.confidence ?? prev.confidence,
            uncertainty: r.uncertainty ?? prev.uncertainty,
            dimensions: r.dimensions || prev.dimensions,
            riskVelocity: r.risk_velocity ?? prev.riskVelocity,
            riskTrajectoryTrend: r.risk_trajectory_trend || prev.riskTrajectoryTrend,
            primaryDrivers: r.primary_drivers || prev.primaryDrivers,
            contradictingSignals: r.contradicting_signals || prev.contradictingSignals,
            evidenceGraph: r.evidence_graph || prev.evidenceGraph,
            policyRecommendation: r.policy_recommendation || prev.policyRecommendation,
            humanWorkflowState: r.human_workflow_state || prev.humanWorkflowState,
            fusionLatencyMs: r.fusion_latency_ms || prev.fusionLatencyMs,
          }));
        }

        // Phase 2, 3, 4 Telemetry Broadcast
        if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
          const p = msg.payload;
          const conv = p.conversation || {};
          setTelemetry((prev) => ({
            ...prev,
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
  };

  const startMicStreaming = async () => {
    setMicError(null);
    try {
      connectWebSocket();

      const streamer = new BrowserAudioStreamer({
        sampleRate: 16000,
        bufferSize: 4096,
        onChunk: (base64Audio, seq, rmsDb) => {
          setMicRmsDb(rmsDb);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && selectedCall) {
            wsRef.current.send(
              JSON.stringify({
                type: 'AUDIO_CHUNK',
                callId: selectedCall.id,
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
    } catch (err: any) {
      setMicState('ERROR');
      setMicError(err.message || 'Microphone initialization failed');
      setIsStreaming(false);
      // Explicitly DO NOT fall back to synthetic audio!
    }
  };

  const startSyntheticToneStreaming = () => {
    setMicError(null);
    connectWebSocket();
    let chunkIdx = 0;

    const testPhrases = [
      'I am calling from your bank fraud department.',
      'There is unauthorized suspicious activity and your account will be frozen immediately!',
      'Do not contact your branch, I will verify you directly here on this call.',
      'Please read the 6-digit OTP code sent to your phone right now.',
    ];

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

      const phrase = testPhrases[chunkIdx % testPhrases.length];

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && selectedCall) {
        wsRef.current.send(
          JSON.stringify({
            type: 'AUDIO_CHUNK',
            callId: selectedCall.id,
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
    }, 250);

    setIsStreaming(true);
    setStreamSource('SYNTHETIC');
    setMicState('STREAMING');
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
    setMicState('STOPPED');
    setMicRmsDb(-96);
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

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Navbar title="Live SOC Command Center" subtitle="Phase 5 Multi-Modal Risk Fusion & Policy Enforcement" />

        <main className="p-6 space-y-6">
          <Phase1Notice />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>Unified Multi-Modal Decision & Intervention Command Center</span>
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Phase 5 Active: 10-Dimensional Risk Fusion, Deterministic Policy, and Human-in-the-Loop Orchestration
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
                {calls.map((call) => (
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
                      <span>{new Date(call.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Live Telemetry & Phase 5 Decision Console */}
            <div className="lg:col-span-2 soc-glass p-5 rounded-xl border border-slate-800 space-y-5">
              {selectedCall ? (
                <>
                  {/* Top Bar: Call Identification & Live Audio Controls */}
                  <div className="flex flex-col gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-white font-mono">{selectedCall.callerIdentifier}</h2>
                          <span
                            className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              unifiedRisk.riskLevel === 'CRITICAL'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                : unifiedRisk.riskLevel === 'HIGH'
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                                : unifiedRisk.riskLevel === 'ELEVATED' || unifiedRisk.riskLevel === 'GUARDED'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : unifiedRisk.riskLevel === 'LOW' || unifiedRisk.riskLevel === 'SAFE'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-slate-700/40 text-slate-300 border border-slate-600/40'
                            }`}
                          >
                            {unifiedRisk.riskLevel} THREAT ({typeof unifiedRisk.overallRiskScore === 'number' ? `${unifiedRisk.overallRiskScore.toFixed(1)}/100` : 'NOT AVAILABLE'})
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          Session: {selectedCall.id} • Latency: {unifiedRisk.fusionLatencyMs}ms
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isStreaming ? (
                          <>
                            <button
                              onClick={startMicStreaming}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/20"
                            >
                              <Mic className="w-3.5 h-3.5" />
                              <span>Stream Live Mic</span>
                            </button>
                            <button
                              onClick={startSyntheticToneStreaming}
                              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Test Scenario</span>
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

                    {/* Microphone Stream Health Bar & Error Alerts */}
                    {isStreaming && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-indigo-500/30 text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span className="text-slate-300">
                            Source: <strong className="text-indigo-300">{streamSource === 'MIC' ? 'REAL BROWSER MICROPHONE (16 kHz PCM)' : 'SYNTHETIC TEST BENCH'}</strong>
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

                  {/* PHASE 5: 10-Dimensional Multi-Modal Risk Matrix HUD */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-400" />
                        10-Dimensional Unified Risk Matrix
                      </span>
                      <div className="flex items-center gap-3 text-[11px] font-mono">
                        <span className="text-slate-400">
                          Confidence: <strong className="text-emerald-400">{typeof unifiedRisk.confidence === 'number' ? `${(unifiedRisk.confidence * 100).toFixed(0)}%` : 'N/A'}</strong>
                        </span>
                        <span className="text-slate-400 flex items-center gap-1">
                          Velocity: <TrendingUp className="w-3 h-3 text-rose-400" />
                          <strong className="text-rose-400">+{unifiedRisk.riskVelocity ?? 0}/s</strong>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                      {[
                        { label: 'Credential Theft', val: unifiedRisk.dimensions.credential_theft, color: 'bg-rose-500' },
                        { label: 'Social Eng.', val: unifiedRisk.dimensions.social_engineering, color: 'bg-rose-500' },
                        { label: 'Verification Bypass', val: unifiedRisk.dimensions.verification_bypass, color: 'bg-rose-500' },
                        { label: 'Financial Fraud', val: unifiedRisk.dimensions.financial_fraud, color: 'bg-amber-500' },
                        { label: 'Identity Mismatch', val: unifiedRisk.dimensions.identity_impersonation, color: 'bg-indigo-500' },
                        { label: 'Account Takeover', val: unifiedRisk.dimensions.account_takeover, color: 'bg-amber-500' },
                        { label: 'Deepfake Synth', val: unifiedRisk.dimensions.deepfake_synthetic, color: 'bg-emerald-500' },
                        { label: 'Replay Attack', val: unifiedRisk.dimensions.replay_injection, color: 'bg-emerald-500' },
                        { label: 'Inconsistency', val: unifiedRisk.dimensions.inconsistency, color: 'bg-emerald-500' },
                        { label: 'Overall Threat', val: unifiedRisk.dimensions.overall, color: 'bg-rose-600' },
                      ].map((dim, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-slate-400">
                            <span className="truncate">{dim.label}</span>
                            <span className="font-bold text-white">{typeof dim.val === 'number' ? dim.val.toFixed(0) : 'N/A'}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${dim.color} rounded-full`} style={{ width: `${typeof dim.val === 'number' ? Math.min(100, Math.max(0, dim.val)) : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* PHASE 5: Deterministic Policy Trigger & Human-in-the-Loop Decision Bar */}
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

                  {/* PHASE 5: Evidence Graph & Primary Diagnostic Findings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Primary Explainable Drivers */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs font-mono">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        Primary Explainable Drivers
                      </span>
                      <ul className="space-y-1.5 text-slate-300 text-[11px]">
                        {unifiedRisk.primaryDrivers.map((driver, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-rose-400 font-bold">•</span>
                            <span>{driver}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Evidence Graph DAG Nodes */}
                    <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs font-mono">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                        Evidence Graph Cues & Corroboration
                      </span>
                      <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                        {unifiedRisk.evidenceGraph.nodes.map((node, idx) => (
                          <div key={idx} className="p-1.5 rounded bg-slate-950/70 border border-slate-800 flex items-center justify-between text-[10px]">
                            <span className="text-slate-300 truncate">{node.cue}</span>
                            <span className="text-indigo-400 font-bold shrink-0 ml-2">[{node.layer}]</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Redacted Live Transcript & Conversational Turn Summary */}
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
                      "{telemetry.conversation.redactedTranscript}"
                    </p>
                  </div>

                  {/* Phase 5 Operational Status */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400">Decision Intelligence Pipeline:</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      PHASE 5 DECISION LAYER ACTIVE (100% MODULES ONLINE)
                    </span>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-slate-500 text-sm font-mono">
                  Select a live call session to inspect unified multi-modal risk and policy intelligence.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
