'use client';

import React, { useState } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldAlert,
  Clock,
  User,
  Radio,
  Sparkles,
  Lock,
} from 'lucide-react';
import { CallSession } from '@/lib/api';
import { CallStatus, ConsumerCallState } from './CallStatus';
import { RiskResult, ConsumerRiskLevel } from './RiskResult';
import { VoiceAuthenticity, VoiceAuthStatus } from './VoiceAuthenticity';
import { RiskReasons } from './RiskReasons';

interface CallInProgressProps {
  call: CallSession | null;
  callState: ConsumerCallState;
  durationSeconds: number;
  riskScore: number | null;
  riskLevel: ConsumerRiskLevel;
  threatClassification?: string | null;
  voiceAuthStatus: VoiceAuthStatus;
  voiceArtifacts?: string[];
  voiceExplainability?: string[];
  primaryDrivers?: string[];
  evidenceFindings?: string[];
  dimensions?: Record<string, number | null>;
  micActive?: boolean;
  micRmsDb?: number;
  onEndCall: () => void;
  onToggleMic?: () => void;
}

export const CallInProgress: React.FC<CallInProgressProps> = ({
  call,
  callState,
  durationSeconds,
  riskScore,
  riskLevel,
  threatClassification,
  voiceAuthStatus,
  voiceArtifacts = [],
  voiceExplainability = [],
  primaryDrivers = [],
  evidenceFindings = [],
  dimensions = {},
  micActive = false,
  micRmsDb = -96,
  onEndCall,
  onToggleMic,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  // Format MM:SS timer
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const callerNumber = call?.callerIdentifier || 'Unknown Caller';
  const callerName = call?.callerDisplayName || (call?.callerIdentifier ? 'Active Caller' : 'Unknown Caller');

  // Compute live waveform bar heights based on micRmsDb or simulated ambient jitter
  const getBarHeight = (index: number) => {
    if (micActive) {
      const normalizedRms = Math.max(0, Math.min(1, (micRmsDb + 60) / 60));
      const jitter = Math.sin(index * 1.5 + Date.now() / 200) * 0.3;
      const height = Math.max(15, Math.min(100, (normalizedRms + jitter) * 100));
      return `${height}%`;
    }
    // Ambient pulsating waveform when call is active
    const wave = Math.abs(Math.sin((Date.now() / 400) + index * 0.8));
    return `${Math.max(20, wave * 75)}%`;
  };

  return (
    <div className="space-y-4 select-none">
      {/* Active Call Header Card */}
      <div className="p-5 rounded-2xl bg-[#24242B] border border-[#3A3A42] text-center relative overflow-hidden shadow-glass-card">
        {/* Live Call Duration & Protection Pill */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A1A1F] border border-[#3A3A42] text-[#F5F5F7] text-xs font-mono shadow-sm">
            <Clock className="w-3.5 h-3.5 text-[#A0A4AE]" />
            <span className="font-semibold tracking-wider">{formatTime(durationSeconds)}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#168F86]/20 border border-[#168F86]/40 text-[#168F86] text-xs font-mono shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#168F86] animate-pulse" />
            <span className="font-bold tracking-wider">VOXSHIELD SECURED</span>
          </div>
        </div>

        {/* Caller Avatar & Name */}
        <div className="my-3">
          <div className="relative w-16 h-16 mx-auto mb-2.5">
            <div className="w-16 h-16 rounded-full bg-[#2E2E36] border border-[#3A3A42] flex items-center justify-center shadow-lg">
              <User className="w-8 h-8 text-[#F5F5F7]" />
            </div>
            <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#168F86] border-2 border-[#24242B] flex items-center justify-center shadow">
              <Radio className="w-2.5 h-2.5 text-white animate-pulse" />
            </span>
          </div>

          <h3 className="text-lg font-bold text-[#F5F5F7] tracking-tight">
            {callerName}
          </h3>
          <p className="text-xs font-mono text-[#A0A4AE] font-medium mt-0.5 tracking-wider">
            {callerNumber}
          </p>
        </div>

        {/* Live Audio Ingest Waveform Visualizer */}
        <div className="mt-4 pt-3.5 border-t border-[#3A3A42] flex flex-col items-center">
          <div className="flex items-center gap-1.5 mb-2">
            <Radio className="w-3 h-3 text-[#7A1F3D] animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#A0A4AE] font-semibold">
              Live Ingest Stream Visualizer
            </span>
          </div>
          <div className="h-10 flex items-end justify-center gap-1.5 w-full max-w-xs px-4">
            {[...Array(18)].map((_, i) => (
              <div
                key={i}
                className="w-1.5 bg-[#7A1F3D] rounded-full transition-all duration-75 shadow-sm"
                style={{ height: getBarHeight(i) }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Primary Protection Indicators: Voice Authenticity & Fraud Risk */}
      <div className="grid grid-cols-1 gap-3.5">
        {/* AI Voice Authenticity */}
        <VoiceAuthenticity
          status={voiceAuthStatus}
          artifacts={voiceArtifacts}
          explainability={voiceExplainability}
        />

        {/* Fraud Risk Score */}
        <RiskResult
          score={riskScore}
          riskLevel={riskLevel}
          threatClassification={threatClassification}
        />

        {/* Human-readable Explainability */}
        <RiskReasons
          primaryDrivers={primaryDrivers}
          evidenceFindings={evidenceFindings}
          dimensions={dimensions}
        />
      </div>

      {/* Call In-Progress Quick Action Controls */}
      <div className="p-4 rounded-2xl bg-[#24242B] border border-[#3A3A42] shadow-glass-card space-y-3">
        <div className="grid grid-cols-3 gap-2.5">
          {/* Mute Button */}
          <button
            onClick={() => setIsMuted((prev) => !prev)}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium font-mono ${
              isMuted
                ? 'bg-[#C87524]/20 border-[#C87524]/40 text-[#C87524] shadow-sm'
                : 'bg-[#1A1A1F] hover:bg-[#2E2E36] border-[#3A3A42] text-[#A0A4AE]'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4 text-[#C87524]" /> : <Mic className="w-4 h-4 text-[#A0A4AE]" />}
            <span className="text-[11px] font-semibold">{isMuted ? 'Muted' : 'Mute'}</span>
          </button>

          {/* Speaker Button */}
          <button
            onClick={() => setIsSpeakerOn((prev) => !prev)}
            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium font-mono ${
              isSpeakerOn
                ? 'bg-[#2E2E36] border-[#3A3A42] text-[#F5F5F7] shadow-sm'
                : 'bg-[#1A1A1F] hover:bg-[#2E2E36] border-[#3A3A42] text-[#A0A4AE]'
            }`}
          >
            {isSpeakerOn ? <Volume2 className="w-4 h-4 text-[#F5F5F7]" /> : <VolumeX className="w-4 h-4 text-[#A0A4AE]" />}
            <span className="text-[11px] font-semibold">{isSpeakerOn ? 'Speaker' : 'Earpiece'}</span>
          </button>

          {/* Live Mic Streaming Toggle for Testing */}
          {onToggleMic && (
            <button
              onClick={onToggleMic}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium font-mono ${
                micActive
                  ? 'bg-[#7A1F3D]/25 border-[#7A1F3D]/60 text-[#F5F5F7] shadow-sm'
                  : 'bg-[#1A1A1F] hover:bg-[#2E2E36] border-[#3A3A42] text-[#A0A4AE]'
              }`}
            >
              <Radio className={`w-4 h-4 ${micActive ? 'animate-pulse text-[#7A1F3D]' : 'text-[#A0A4AE]'}`} />
              <span className="text-[11px] font-semibold">{micActive ? 'Mic Ingest' : 'Start Mic'}</span>
            </button>
          )}
        </div>

        {/* Primary END CALL Button */}
        <button
          onClick={onEndCall}
          className="w-full py-3.5 px-4 rounded-xl bg-[#D94A5A] hover:bg-[#E05C6B] active:scale-[0.99] text-[#F5F5F7] font-bold font-mono tracking-widest text-xs shadow-sm border border-[#D94A5A]/60 flex items-center justify-center gap-2 transition-all"
        >
          <PhoneOff className="w-4 h-4" />
          <span>END CALL</span>
        </button>
      </div>
    </div>
  );
};
