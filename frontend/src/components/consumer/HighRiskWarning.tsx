'use client';

import React from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Lock,
  PhoneOff,
  UserCheck,
  ArrowRight,
  ShieldX,
} from 'lucide-react';

interface HighRiskWarningProps {
  riskScore: number | null;
  riskLevel: string;
  threatClassification?: string | null;
  reasons?: string[];
  onTriggerVerification: () => void;
  onEndCall: () => void;
  isVerifying?: boolean;
}

export const HighRiskWarning: React.FC<HighRiskWarningProps> = ({
  riskScore,
  riskLevel,
  threatClassification,
  reasons = [],
  onTriggerVerification,
  onEndCall,
  isVerifying = false,
}) => {
  const displayScore = riskScore !== null && Number.isFinite(riskScore) ? Math.round(riskScore) : null;

  return (
    <div className="p-5 rounded-2xl bg-[#24242B] border border-[#D94A5A]/50 shadow-glass-card space-y-4 animate-in fade-in zoom-in-95 duration-200">
      {/* Warning Header */}
      <div className="flex items-start gap-3.5">
        <div className="w-12 h-12 rounded-2xl bg-[#D94A5A]/20 border border-[#D94A5A]/40 flex items-center justify-center shrink-0 shadow-sm">
          <ShieldAlert className="w-7 h-7 text-[#D94A5A] animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#D94A5A]/20 border border-[#D94A5A]/40 text-[#D94A5A] text-[10px] font-bold font-mono uppercase tracking-wider">
              ACTION REQUIRED
            </span>
            {displayScore !== null && (
              <span className="text-xs font-mono font-bold text-[#D94A5A]">
                Risk Score: {displayScore}/100
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-[#F5F5F7] tracking-wide mt-1">
            HIGH-RISK CALL DETECTED
          </h3>
          <p className="text-xs text-[#A0A4AE] leading-relaxed mt-0.5">
            VOXSHIELD detected high-confidence indicators of voice cloning, impersonation, or social engineering.
          </p>
        </div>
      </div>

      {/* Threat Summary Box */}
      <div className="p-4 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] space-y-2.5 shadow-inner">
        <p className="text-[11px] font-bold font-mono text-[#D94A5A] uppercase tracking-wider">
          Why this call was flagged:
        </p>
        {reasons.length > 0 ? (
          <ul className="space-y-1.5 text-xs text-[#F5F5F7]">
            {reasons.slice(0, 3).map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#D94A5A] font-bold shrink-0">•</span>
                <span className="leading-snug">{r}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#A0A4AE]">
            {threatClassification || 'Elevated anomalous voice patterns or credential harvesting behaviors detected.'}
          </p>
        )}

        <div className="pt-2.5 border-t border-[#3A3A42] mt-2">
          <p className="text-[11px] font-semibold text-[#C87524] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#C87524] shrink-0" />
            <span>Recommended Action: Verify caller identity before sharing sensitive information.</span>
          </p>
        </div>
      </div>

      {/* Action Buttons: Step-Up Verification / End Call */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <button
          onClick={onTriggerVerification}
          disabled={isVerifying}
          className="w-full py-3 px-4 rounded-xl bg-[#7A1F3D] hover:bg-[#8F2749] active:scale-[0.99] text-[#F5F5F7] font-bold font-mono text-xs shadow-sm border border-[#7A1F3D]/60 flex items-center justify-center gap-2 transition-all"
        >
          <UserCheck className="w-4 h-4" />
          <span>{isVerifying ? 'VERIFYING...' : 'VERIFY CALLER IDENTITY'}</span>
        </button>

        <button
          onClick={onEndCall}
          className="w-full py-3 px-4 rounded-xl bg-[#D94A5A] hover:bg-[#E05C6B] active:scale-[0.99] border border-[#D94A5A]/60 text-[#F5F5F7] font-bold font-mono text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          <PhoneOff className="w-4 h-4 text-[#F5F5F7]" />
          <span>END CALL</span>
        </button>
      </div>
    </div>
  );
};
