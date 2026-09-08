'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient, WS_BASE, CallSession } from '@/lib/api';
import { BrowserAudioStreamer, MicStreamState } from '@/lib/audio_streamer';
import { ConsumerCallShell, ConsumerTab } from '@/components/consumer/ConsumerCallShell';
import { IncomingCall } from '@/components/consumer/IncomingCall';
import { CallInProgress } from '@/components/consumer/CallInProgress';
import { CallStatus, ConsumerCallState } from '@/components/consumer/CallStatus';
import { RiskResult, ConsumerRiskLevel } from '@/components/consumer/RiskResult';
import { VoiceAuthenticity, VoiceAuthStatus } from '@/components/consumer/VoiceAuthenticity';
import { RiskReasons } from '@/components/consumer/RiskReasons';
import { HighRiskWarning } from '@/components/consumer/HighRiskWarning';
import { StepUpVerification } from '@/components/consumer/StepUpVerification';
import { VerificationResult } from '@/components/consumer/VerificationResult';
import { CallSummary } from '@/components/consumer/CallSummary';
import { IncidentReport } from '@/components/consumer/IncidentReport';
import { CallHistory } from '@/components/consumer/CallHistory';
import { WSConnectionState } from '@/components/consumer/ConnectionStatus';
import {
  PhoneCall,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  AlertCircle,
  FlaskConical,
} from 'lucide-react';

export default function ConsumerPage() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<ConsumerTab>('CALL');
  const [callState, setCallState] = useState<ConsumerCallState>('INCOMING');

  // Active Call Session
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Live WebSocket Connection State
  const [wsStatus, setWsStatus] = useState<WSConnectionState>('CONNECTING');
  const [wsError, setWsError] = useState<string | null>(null);

  // Real Browser Microphone Capture
  const [micActive, setMicActive] = useState(false);
  const [micState, setMicState] = useState<MicStreamState>('IDLE');
  const [micRmsDb, setMicRmsDb] = useState<number>(-96);
  const [micError, setMicError] = useState<string | null>(null);

  // Backend Risk Engine State (100% Real Backend Data)
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [riskLevel, setRiskLevel] = useState<ConsumerRiskLevel>('ANALYZING');
  const [threatClassification, setThreatClassification] = useState<string | null>(null);
  const [primaryDrivers, setPrimaryDrivers] = useState<string[]>([]);
  const [evidenceFindings, setEvidenceFindings] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<Record<string, number | null>>({});

  // AI Voice Authenticity State
  const [voiceAuthStatus, setVoiceAuthStatus] = useState<VoiceAuthStatus>('ANALYZING');
  const [voiceArtifacts, setVoiceArtifacts] = useState<string[]>([]);
  const [voiceExplainability, setVoiceExplainability] = useState<string[]>([]);

  // High Risk & Step-Up Verification Flow
  const [showHighRiskWarning, setShowHighRiskWarning] = useState(false);
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const [verificationOutcome, setVerificationOutcome] = useState<'ALLOW' | 'BLOCK' | 'ESCALATE' | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioStreamerRef = useRef<BrowserAudioStreamer | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const activeCallRef = useRef<CallSession | null>(null);
  activeCallRef.current = activeCall;

  // Initialize and Fetch Calls
  useEffect(() => {
    fetchInitialCalls();
    connectWebSocket();

    return () => {
      stopCallTimer();
      stopMicrophone();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, []);

  // Live Call Timer Management
  useEffect(() => {
    if (callState === 'CALL_IN_PROGRESS' || callState === 'ANALYZING' || callState === 'LOW_RISK' || callState === 'SUSPICIOUS' || callState === 'HIGH_RISK') {
      if (!timerIntervalRef.current) {
        timerIntervalRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } else {
      stopCallTimer();
    }
  }, [callState]);

  const stopCallTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Fetch or Seed Backend Call Sessions
  const fetchInitialCalls = async () => {
    try {
      const res = await ApiClient.get<CallSession[]>('/calls');
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        setCalls(res.data);
        const first = res.data[0];
        setActiveCall(first);
        loadCallAssessment(first.id);
      } else {
        // Honest fallback session if backend is empty
        const fallback: CallSession = {
          id: 'c1111111-0000-0000-0000-000000000001',
          callerIdentifier: '+1 (555) 019-2834',
          callerDisplayName: 'Corporate Treasury Wire Ops',
          direction: 'INBOUND',
          status: 'ACTIVE',
          organizationId: '00000000-0000-0000-0000-000000000001',
          claimedSpeakerId: 'speaker-cfo-001',
          createdAt: new Date().toISOString(),
        };
        setCalls([fallback]);
        setActiveCall(fallback);
      }
    } catch {
      const offlineFallback: CallSession = {
        id: 'call-consumer-demo-101',
        callerIdentifier: '+1 (555) 019-2834',
        callerDisplayName: 'Corporate Treasury Pretext',
        direction: 'INBOUND',
        status: 'ACTIVE',
        organizationId: '00000000-0000-0000-0000-000000000001',
        claimedSpeakerId: 'speaker-cfo-001',
        createdAt: new Date().toISOString(),
      };
      setCalls([offlineFallback]);
      setActiveCall(offlineFallback);
    }
  };

  // Fetch Existing Backend Risk for Selected Call
  const loadCallAssessment = async (callId: string) => {
    try {
      const res = await ApiClient.get(`/risk/${callId}`);
      if (res.success && res.data) {
        applyRiskPayload(res.data);
      }
    } catch {
      setRiskLevel('INCONCLUSIVE');
      setVoiceAuthStatus('NOT_AVAILABLE');
    }
  };

  // Apply Real Backend Risk Payload to Consumer State
  const applyRiskPayload = (r: any) => {
    if (!r) return;

    // 1. Overall Risk Score & Level
    if (r.overall_risk_score !== undefined && r.overall_risk_score !== null) {
      setRiskScore(r.overall_risk_score);
    }

    const backendLevel = r.risk_level || 'INCONCLUSIVE';
    setRiskLevel(backendLevel);

    // 2. Map Call State Machine
    if (backendLevel === 'CRITICAL' || backendLevel === 'HIGH') {
      setCallState('HIGH_RISK');
      setShowHighRiskWarning(true);
    } else if (backendLevel === 'ELEVATED' || backendLevel === 'GUARDED' || backendLevel === 'SUSPICIOUS') {
      setCallState('SUSPICIOUS');
      setShowHighRiskWarning(false);
    } else if (backendLevel === 'LOW' || backendLevel === 'SAFE') {
      setCallState('LOW_RISK');
      setShowHighRiskWarning(false);
    } else if (r.status === 'NOT_AVAILABLE' || backendLevel === 'NOT_AVAILABLE') {
      setCallState('AI_NOT_AVAILABLE');
      setShowHighRiskWarning(false);
    } else if (backendLevel === 'INCONCLUSIVE') {
      setCallState('INCONCLUSIVE');
      setShowHighRiskWarning(false);
    }

    // 3. Drivers & Explainability
    if (Array.isArray(r.primary_drivers)) {
      setPrimaryDrivers(r.primary_drivers);
    }
    if (r.dimensions) {
      setDimensions(r.dimensions);
    }
    if (r.threat_classification || r.policy_recommendation?.rule_name) {
      setThreatClassification(r.threat_classification || r.policy_recommendation?.rule_name);
    }
  };

  // Apply Real Audio/Acoustic Telemetry from WebSocket
  const applyTelemetryPayload = (p: any) => {
    if (!p) return;

    // AI Deepfake Status Mapping
    const dfStatus = p.deepfake?.status;
    if (dfStatus === 'DEEPFAKE_CLONE' || dfStatus === 'SYNTHETIC_ARTIFACTS_DETECTED') {
      setVoiceAuthStatus('DETECTED');
    } else if (dfStatus === 'AUTHENTIC') {
      setVoiceAuthStatus('NOT_DETECTED');
    } else if (dfStatus === 'INCONCLUSIVE') {
      setVoiceAuthStatus('INCONCLUSIVE');
    } else if (dfStatus === 'NOT_AVAILABLE') {
      setVoiceAuthStatus('NOT_AVAILABLE');
    }

    if (Array.isArray(p.deepfake?.artifacts_detected)) {
      setVoiceArtifacts(p.deepfake.artifacts_detected);
    }
    if (Array.isArray(p.deepfake?.explainability)) {
      setVoiceExplainability(p.deepfake.explainability);
    }
    if (Array.isArray(p.evidence_summary)) {
      setEvidenceFindings(p.evidence_summary);
    }
  };

  // WebSocket Connection Management
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setWsStatus('LIVE');
      return;
    }

    setWsStatus('CONNECTING');
    setWsError(null);

    try {
      const ws = new WebSocket(WS_BASE);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('LIVE');
        const token = (typeof window !== 'undefined' && localStorage.getItem('voxshield_token')) || 'dev-token-phase1';
        ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));

        const curCall = activeCallRef.current;
        if (curCall) {
          ws.send(
            JSON.stringify({
              type: 'START_STREAM',
              callId: curCall.id,
              streamId: `stream-${Date.now()}`,
            })
          );
        }
      };

      ws.onerror = () => {
        setWsStatus('ERROR');
        setWsError('WebSocket gateway unavailable at localhost:4000');
      };

      ws.onclose = () => {
        setWsStatus('OFFLINE');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Ignore events for other calls
          if (msg.callId && activeCallRef.current && msg.callId !== activeCallRef.current.id) {
            return;
          }

          // 1. Unified Risk Assessment Event
          if (msg.type === 'UNIFIED_RISK_ASSESSMENT' && msg.payload) {
            applyRiskPayload(msg.payload);
          }

          // 2. Audio & NLP Telemetry Event
          if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
            applyTelemetryPayload(msg.payload);
          }

          // 3. Policy Enforcement Alert
          if (msg.type === 'POLICY_ENFORCEMENT_TRIGGER' && msg.payload) {
            setCallState('HIGH_RISK');
            setShowHighRiskWarning(true);
            if (msg.payload.rule_name) {
              setThreatClassification(msg.payload.rule_name);
            }
          }
        } catch {}
      };
    } catch (err: any) {
      setWsStatus('ERROR');
      setWsError(err.message || 'Failed to initialize WebSocket link.');
    }
  }, []);

  // Answer Call Action
  const handleAnswerCall = async () => {
    setIsAnswering(true);
    setCallDuration(0);
    setShowHighRiskWarning(false);
    setShowStepUpModal(false);
    setVerificationOutcome(null);

    // Update call status in backend if active call exists
    if (activeCall && !activeCall.id.startsWith('call-local')) {
      try {
        await ApiClient.patch(`/calls/${activeCall.id}/status`, {
          status: 'ACTIVE',
        });
      } catch {}
    }

    setTimeout(() => {
      setIsAnswering(false);
      setCallState('CALL_IN_PROGRESS');

      // Notify WebSocket server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeCall) {
        wsRef.current.send(
          JSON.stringify({
            type: 'START_STREAM',
            callId: activeCall.id,
            streamId: `stream-${Date.now()}`,
          })
        );
      }
    }, 400);
  };

  // Decline Call Action
  const handleDeclineCall = async () => {
    if (activeCall && !activeCall.id.startsWith('call-local')) {
      try {
        await ApiClient.patch(`/calls/${activeCall.id}/status`, {
          status: 'TERMINATED',
          reason: 'Declined by consumer',
        });
      } catch {}
    }
    setCallState('DISCONNECTED');
    stopMicrophone();
  };

  // End Call Action
  const handleEndCall = async () => {
    stopMicrophone();
    if (activeCall && !activeCall.id.startsWith('call-local')) {
      try {
        await ApiClient.patch(`/calls/${activeCall.id}/status`, {
          status: 'TERMINATED',
          reason: 'Ended by consumer',
        });
      } catch {}
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeCall) {
      wsRef.current.send(
        JSON.stringify({
          type: 'END_STREAM',
          callId: activeCall.id,
        })
      );
    }

    setCallState('COMPLETED');
    setShowHighRiskWarning(false);
    setShowStepUpModal(false);
  };

  // Reset to New Incoming Call Screen
  const handleResetCall = (presetCall?: CallSession) => {
    stopMicrophone();
    setCallDuration(0);
    setShowHighRiskWarning(false);
    setShowStepUpModal(false);
    setVerificationOutcome(null);
    setRiskScore(null);
    setRiskLevel('ANALYZING');
    setVoiceAuthStatus('ANALYZING');
    setPrimaryDrivers([]);
    setEvidenceFindings([]);
    setThreatClassification(null);

    const nextCall = presetCall || calls[0] || {
      id: `call-consumer-${Date.now()}`,
      callerIdentifier: '+1 (555) 019-2834',
      callerDisplayName: 'Incoming Protected Caller',
      direction: 'INBOUND',
      status: 'RINGING',
      organizationId: '00000000-0000-0000-0000-000000000001',
      createdAt: new Date().toISOString(),
    };

    setActiveCall(nextCall);
    setCallState('INCOMING');
    setActiveTab('CALL');
  };

  // Step-Up Verification Completion Handler
  const handleVerificationComplete = (outcome: 'ALLOW' | 'BLOCK' | 'ESCALATE') => {
    setShowStepUpModal(false);
    setVerificationOutcome(outcome);

    if (outcome === 'ALLOW') {
      setCallState('CALL_IN_PROGRESS');
      setShowHighRiskWarning(false);
    } else if (outcome === 'BLOCK') {
      setCallState('BLOCKED');
      setShowHighRiskWarning(false);
      stopMicrophone();
    }
  };

  // Live Browser Microphone Streaming Toggle
  const handleToggleMicrophone = async () => {
    if (micActive) {
      stopMicrophone();
      return;
    }

    try {
      setMicError(null);
      const streamer = new BrowserAudioStreamer({
        sampleRate: 16000,
        bufferSize: 4096,
        onStateChange: (st, err) => {
          setMicState(st);
          if (err) setMicError(err);
          if (st === 'STREAMING') setMicActive(true);
          else if (st === 'STOPPED' || st === 'ERROR') setMicActive(false);
        },
        onChunk: (base64Audio, seq, rmsDb) => {
          setMicRmsDb(rmsDb);

          // Transmit audio chunk to Backend WebSocket
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeCall) {
            wsRef.current.send(
              JSON.stringify({
                type: 'AUDIO_CHUNK',
                callId: activeCall.id,
                sequenceNumber: seq,
                payload: {
                  audio_base64: base64Audio,
                  sample_rate: 16000,
                  channels: 1,
                  claimed_speaker_id: activeCall.claimedSpeakerId || 'speaker-cfo-001',
                },
              })
            );
          }
        },
      });

      audioStreamerRef.current = streamer;
      await streamer.start();
    } catch (err: any) {
      setMicError(err.message || 'Microphone activation failed.');
      setMicActive(false);
    }
  };

  const stopMicrophone = () => {
    if (audioStreamerRef.current) {
      try {
        audioStreamerRef.current.stop();
      } catch {}
      audioStreamerRef.current = null;
    }
    setMicActive(false);
    setMicState('STOPPED');
    setMicRmsDb(-96);
  };

  return (
    <ConsumerCallShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      connectionStatus={wsStatus}
      connectionError={wsError}
      onReconnect={connectWebSocket}
    >
      {/* TAB 1: LIVE CALL PROTECTION */}
      {activeTab === 'CALL' && (
        <div className="space-y-4">
          {/* Quick Scenario Selector Bar for Evaluators & Judges */}
          <div className="p-3 rounded-2xl bg-[#24242B] border border-[#3A3A42] flex items-center justify-between gap-2 select-none shadow-sm">
            <div className="flex items-center gap-1.5 text-xs text-[#A0A4AE] font-mono">
              <FlaskConical className="w-3.5 h-3.5 text-[#7A1F3D]" />
              <span className="font-semibold hidden sm:inline">Scenario Preset:</span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() =>
                  handleResetCall({
                    id: 'c1111111-0000-0000-0000-000000000001',
                    callerIdentifier: '+1 (555) 019-2834',
                    callerDisplayName: 'Treasury Wire Pretext',
                    direction: 'INBOUND',
                    status: 'RINGING',
                    organizationId: '00000000-0000-0000-0000-000000000001',
                    claimedSpeakerId: 'speaker-cfo-001',
                    createdAt: new Date().toISOString(),
                  })
                }
                className="px-3 py-1 rounded-xl bg-[#2E2E36] hover:bg-[#3A3A42] active:scale-95 text-[#F5F5F7] text-[11px] font-mono font-bold whitespace-nowrap transition-all border border-[#3A3A42] shadow-sm"
              >
                1. Voice Cloning
              </button>

              <button
                onClick={() =>
                  handleResetCall({
                    id: 'c1111111-0000-0000-0000-000000000002',
                    callerIdentifier: '+1 (555) 014-9912',
                    callerDisplayName: 'IT Helpdesk Password Reset',
                    direction: 'INBOUND',
                    status: 'RINGING',
                    organizationId: '00000000-0000-0000-0000-000000000001',
                    claimedSpeakerId: 'speaker-admin-002',
                    createdAt: new Date().toISOString(),
                  })
                }
                className="px-3 py-1 rounded-xl bg-[#2E2E36] hover:bg-[#3A3A42] active:scale-95 text-[#F5F5F7] text-[11px] font-mono font-bold whitespace-nowrap transition-all border border-[#3A3A42] shadow-sm"
              >
                2. Urgent Pretext
              </button>
            </div>
          </div>

          {/* Error / Mic Banner if present */}
          {micError && (
            <div className="p-3.5 rounded-xl bg-[#C87524]/15 border border-[#C87524]/40 text-[#C87524] text-xs flex items-center gap-2 shadow-sm font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#C87524]" />
              <span>{micError}</span>
            </div>
          )}

          {/* 1. INCOMING CALL STATE */}
          {callState === 'INCOMING' && (
            <IncomingCall
              call={activeCall}
              onAnswer={handleAnswerCall}
              onDecline={handleDeclineCall}
              isAnswering={isAnswering}
            />
          )}

          {/* 2. ACTIVE CALL & IN-PROGRESS STATES */}
          {callState !== 'INCOMING' &&
            callState !== 'COMPLETED' &&
            callState !== 'DISCONNECTED' && (
              <div className="space-y-4">
                {/* State Badge */}
                <CallStatus state={callState} />

                {/* Step-Up Verification Modal */}
                {showStepUpModal && (
                  <StepUpVerification
                    callId={activeCall?.id}
                    callerIdentifier={activeCall?.callerIdentifier}
                    onVerificationComplete={handleVerificationComplete}
                    onCancel={() => setShowStepUpModal(false)}
                  />
                )}

                {/* Verification Result Card */}
                {verificationOutcome && !showStepUpModal && (
                  <VerificationResult
                    outcome={verificationOutcome}
                    onContinueCall={() => setVerificationOutcome(null)}
                    onEndCall={handleEndCall}
                    onReportIncident={() => setActiveTab('REPORT')}
                  />
                )}

                {/* High-Risk Warning Advisory */}
                {showHighRiskWarning && !showStepUpModal && !verificationOutcome && (
                  <HighRiskWarning
                    riskScore={riskScore}
                    riskLevel={riskLevel}
                    threatClassification={threatClassification}
                    reasons={primaryDrivers}
                    onTriggerVerification={() => setShowStepUpModal(true)}
                    onEndCall={handleEndCall}
                  />
                )}

                {/* Main Active Call Controls & Live Visuals */}
                <CallInProgress
                  call={activeCall}
                  callState={callState}
                  durationSeconds={callDuration}
                  riskScore={riskScore}
                  riskLevel={riskLevel}
                  threatClassification={threatClassification}
                  voiceAuthStatus={voiceAuthStatus}
                  voiceArtifacts={voiceArtifacts}
                  voiceExplainability={voiceExplainability}
                  primaryDrivers={primaryDrivers}
                  evidenceFindings={evidenceFindings}
                  dimensions={dimensions}
                  micActive={micActive}
                  micRmsDb={micRmsDb}
                  onEndCall={handleEndCall}
                  onToggleMic={handleToggleMicrophone}
                />
              </div>
            )}

          {/* 3. CALL COMPLETED SUMMARY */}
          {callState === 'COMPLETED' && (
            <CallSummary
              call={activeCall}
              durationSeconds={callDuration}
              finalRiskScore={riskScore}
              finalRiskLevel={riskLevel}
              threatClassification={threatClassification}
              voiceAuthStatus={voiceAuthStatus}
              primaryDrivers={primaryDrivers}
              onReportIncident={() => setActiveTab('REPORT')}
              onResetCall={() => handleResetCall()}
            />
          )}

          {/* 4. DISCONNECTED STATE */}
          {callState === 'DISCONNECTED' && (
            <div className="p-8 rounded-2xl bg-[#24242B] border border-[#3A3A42] text-center space-y-4 shadow-xl">
              <CallStatus state="DISCONNECTED" />
              <p className="text-xs text-[#A0A4AE]">
                The call was declined or disconnected before connection.
              </p>
              <button
                onClick={() => handleResetCall()}
                className="py-3 px-5 rounded-xl bg-[#7A1F3D] hover:bg-[#8F2749] text-[#F5F5F7] text-xs font-mono font-bold shadow-sm border border-[#7A1F3D]/60 transition-all"
              >
                Reset Call Simulator
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CALL HISTORY */}
      {activeTab === 'HISTORY' && (
        <CallHistory
          onSelectCall={(c) => {
            handleResetCall(c);
            setActiveTab('CALL');
          }}
          onReportCall={(c) => {
            setActiveCall(c);
            setActiveTab('REPORT');
          }}
        />
      )}

      {/* TAB 3: CYBER CELL INCIDENT REPORT */}
      {activeTab === 'REPORT' && (
        <IncidentReport
          call={activeCall}
          riskScore={riskScore}
          threatClassification={threatClassification}
          reasons={primaryDrivers}
          onBackToCall={() => setActiveTab('CALL')}
        />
      )}
    </ConsumerCallShell>
  );
}
