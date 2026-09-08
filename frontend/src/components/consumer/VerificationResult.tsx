'use client';

import React from 'react';
import {
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  ArrowRight,
  PhoneCall,
  PhoneOff,
} from 'lucide-react';

interface VerificationResultProps {
  outcome: 'ALLOW' | 'BLOCK' | 'ESCALATE';
  reason?: string;
  onContinueCall?: () => void;
  onEndCall?: () => void;
  onReportIncident?: () => void;
}

export const VerificationResult: React.FC<VerificationResultProps> = ({
  outcome,
  reason,
  onContinueCall,
  onEndCall,
  onReportIncident,
}) => {
  const getOutcomeConfig = () => {
    switch (outcome) {
      case 'ALLOW':
        return {
          title: 'CALL VERIFIED',
          subtitle: 'The caller identity was successfully verified via independent out-of-band challenge.',
          badge: 'VERIFIED & SAFE',
          bgColor: 'bg-[#168F86]/15',
          borderColor: 'border-[#168F86]/40',
          textColor: 'text-[#168F86]',
          icon: ShieldCheck,
          buttonText: 'Resume Call',
          buttonAction: onContinueCall,
        };
      case 'BLOCK':
        return {
          title: 'CALL BLOCKED',
          subtitle: 'VOXSHIELD blocked this high-risk interaction to prevent voice fraud or account compromise.',
          badge: 'FRAUD THREAT BLOCKED',
          bgColor: 'bg-[#D94A5A]/15',
          borderColor: 'border-[#D94A5A]/40',
          textColor: 'text-[#D94A5A]',
          icon: ShieldX,
          buttonText: 'Report Incident',
          buttonAction: onReportIncident,
        };
      case 'ESCALATE':
      default:
        return {
          title: 'INCIDENT ESCALATED',
          subtitle: 'The incident has been escalated to the Security Operations Center for forensic review.',
          badge: 'ESCALATED TO SOC',
          bgColor: 'bg-[#C87524]/15',
          borderColor: 'border-[#C87524]/40',
          textColor: 'text-[#C87524]',
          icon: AlertTriangle,
          buttonText: 'View Incident Report',
          buttonAction: onReportIncident,
        };
    }
  };

  const config = getOutcomeConfig();
  const Icon = config.icon;

  return (
    <div
      className={`p-6 rounded-2xl border text-center space-y-4 select-none ${config.bgColor} ${config.borderColor} shadow-2xl shadow-black/70 animate-in fade-in zoom-in-95 duration-200`}
    >
      <div className="w-16 h-16 rounded-2xl bg-[#24242B] border border-[#3A3A42] flex items-center justify-center mx-auto shadow-xl">
        <Icon className={`w-9 h-9 ${config.textColor}`} />
      </div>

      <div className="space-y-1.5">
        <span
          className={`inline-block px-3 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider border ${config.bgColor} ${config.borderColor} ${config.textColor} shadow-sm`}
        >
          {config.badge}
        </span>
        <h3 className="text-xl font-black text-[#F5F5F7] tracking-wide">
          {config.title}
        </h3>
        <p className="text-xs text-[#A0A4AE] max-w-sm mx-auto leading-relaxed">
          {reason || config.subtitle}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5 pt-2 max-w-xs mx-auto">
        {outcome === 'ALLOW' ? (
          <button
            onClick={onContinueCall}
            className="w-full py-3 px-4 rounded-xl bg-[#168F86] hover:bg-[#19A096] text-[#F5F5F7] text-xs font-bold font-mono shadow-md shadow-black/40 flex items-center justify-center gap-2 transition-all"
          >
            <PhoneCall className="w-4 h-4" />
            <span>CONTINUE CALL</span>
          </button>
        ) : (
          <>
            {onReportIncident && (
              <button
                onClick={onReportIncident}
                className="w-full py-3 px-4 rounded-xl bg-[#D94A5A] hover:bg-[#E25C6B] text-[#F5F5F7] text-xs font-bold font-mono shadow-md shadow-black/40 flex items-center justify-center gap-2 transition-all"
              >
                <ShieldX className="w-4 h-4" />
                <span>REPORT INCIDENT</span>
              </button>
            )}
            {onEndCall && (
              <button
                onClick={onEndCall}
                className="w-full py-3 px-4 rounded-xl bg-[#2E2E36] hover:bg-[#3A3A42] border border-[#3A3A42] text-[#F5F5F7] text-xs font-bold font-mono flex items-center justify-center gap-2 transition-all"
              >
                <PhoneOff className="w-4 h-4" />
                <span>CLOSE CALL</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
