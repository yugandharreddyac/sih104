'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileText,
  ShieldX,
  RotateCcw,
  ChevronRight,
  Info,
} from 'lucide-react';
import { CallSession } from '@/lib/api';
import { VoiceAuthStatus } from './VoiceAuthenticity';

interface CallSummaryProps {
  call: CallSession | null;
  durationSeconds: number;
  finalRiskScore: number | null;
  finalRiskLevel: string;
  threatClassification?: string | null;
  voiceAuthStatus: VoiceAuthStatus;
  primaryDrivers?: string[];
  onReportIncident: () => void;
  onResetCall: () => void;
}

export const CallSummary: React.FC<CallSummaryProps> = ({
  call,
  durationSeconds,
  finalRiskScore,
  finalRiskLevel,
  threatClassification,
  voiceAuthStatus,
  primaryDrivers = [],
  onReportIncident,
  onResetCall,
}) => {
  const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s`;
  };

  const isHighRisk = finalRiskLevel === 'HIGH' || finalRiskLevel === 'CRITICAL' || (finalRiskScore ?? 0) >= 70;
  const callerIdentifier = call?.callerIdentifier || 'Unknown Caller';

  return (
    <div className="p-6 rounded-2xl bg-[#24242B] border border-[#3A3A42] shadow-2xl shadow-black/80 space-y-5 select-none animate-in fade-in zoom-in-95 duration-200">
      {/* Summary Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-[#168F86]/20 border border-[#168F86]/40 flex items-center justify-center mx-auto text-[#168F86] shadow-md shadow-black/40">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-xl font-black text-[#F5F5F7] tracking-wide">
            CALL COMPLETED
          </h3>
          <p className="text-xs text-[#A0A4AE] font-mono mt-0.5">
            VOXSHIELD session protection summary
          </p>
        </div>
      </div>

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Call Duration */}
        <div className="p-4 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] shadow-sm">
          <div className="flex items-center gap-1.5 text-[#A0A4AE] text-[11px] font-mono mb-1 font-semibold">
            <Clock className="w-3.5 h-3.5 text-[#168F86]" />
            <span>DURATION</span>
          </div>
          <p className="text-base font-bold text-[#F5F5F7] font-mono">
            {formatTime(durationSeconds)}
          </p>
        </div>

        {/* Final Risk Level */}
        <div className="p-4 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] shadow-sm">
          <div className="flex items-center gap-1.5 text-[#A0A4AE] text-[11px] font-mono mb-1 font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 text-[#D94A5A]" />
            <span>RISK LEVEL</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-black font-mono ${
                isHighRisk ? 'text-[#D94A5A]' : 'text-[#168F86]'
              }`}
            >
              {finalRiskLevel || 'LOW RISK'}
            </span>
            {finalRiskScore !== null && (
              <span className="text-xs font-mono text-[#A0A4AE]">
                ({Math.round(finalRiskScore)}/100)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Caller Details & Voice Status */}
      <div className="p-4 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[#A0A4AE] font-mono font-medium">Caller Identifier:</span>
          <span className="font-mono text-[#F5F5F7] font-bold">{callerIdentifier}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#A0A4AE] font-mono font-medium">Voice Authenticity:</span>
          <span className="font-mono text-[#F5F5F7] font-semibold">{voiceAuthStatus}</span>
        </div>
        {threatClassification && (
          <div className="flex items-center justify-between">
            <span className="text-[#A0A4AE] font-mono font-medium">Classification:</span>
            <span className="font-semibold font-mono text-[#D94A5A]">{threatClassification}</span>
          </div>
        )}
      </div>

      {/* Recommended Follow-up */}
      <div className="p-4 rounded-xl bg-[#7A1F3D]/15 border border-[#7A1F3D]/30 text-xs text-[#A0A4AE] space-y-1.5 shadow-sm">
        <p className="font-bold text-[#F5F5F7] flex items-center gap-1.5 font-mono text-[11px]">
          <Info className="w-3.5 h-3.5 text-[#F5F5F7]" />
          RECOMMENDED FOLLOW-UP
        </p>
        <p className="text-[11px] text-[#A0A4AE] leading-relaxed">
          {isHighRisk
            ? 'Because this call was flagged as suspicious/high-risk, consider filing a Cyber Cell incident report. Do not call back unverified numbers or share sensitive passwords.'
            : 'No further action is required. Always maintain caution when sharing sensitive credentials.'}
        </p>
      </div>

      {/* Expandable Details Toggle */}
      <div>
        <button
          onClick={() => setShowDetailedBreakdown((prev) => !prev)}
          className="w-full py-2 text-xs font-mono text-[#A0A4AE] hover:text-[#F5F5F7] flex items-center justify-center gap-1.5 transition-colors"
        >
          <span>{showDetailedBreakdown ? 'Hide Security Breakdown' : 'View Security Breakdown'}</span>
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${
              showDetailedBreakdown ? 'rotate-90' : ''
            }`}
          />
        </button>

        {showDetailedBreakdown && (
          <div className="mt-2 p-3.5 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] space-y-2 text-xs text-[#A0A4AE] animate-in fade-in duration-150">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#A0A4AE] font-semibold">
              Analysis Findings:
            </p>
            {primaryDrivers.length > 0 ? (
              <ul className="space-y-1.5">
                {primaryDrivers.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px]">
                    <span className="text-[#168F86] font-bold">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-[#A0A4AE] italic">
                No specific threat drivers recorded for this session.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Primary Actions: Report Incident & New Call */}
      <div className="space-y-2.5 pt-2">
        <button
          onClick={onReportIncident}
          className="w-full py-3.5 px-4 rounded-xl bg-[#D94A5A] hover:bg-[#E25C6B] text-[#F5F5F7] font-bold font-mono text-xs shadow-md shadow-black/40 flex items-center justify-center gap-2 transition-all"
        >
          <ShieldX className="w-4 h-4" />
          <span>REPORT INCIDENT TO CYBER CELL</span>
        </button>

        <button
          onClick={onResetCall}
          className="w-full py-3 px-4 rounded-xl bg-[#2E2E36] hover:bg-[#3A3A42] border border-[#3A3A42] text-[#F5F5F7] font-bold font-mono text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          <RotateCcw className="w-4 h-4" />
          <span>RETURN TO CALL SCREEN</span>
        </button>
      </div>
    </div>
  );
};
