'use client';

import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface RiskReasonsProps {
  primaryDrivers?: string[];
  evidenceFindings?: string[];
  dimensions?: Record<string, number | null>;
  compact?: boolean;
}

export const RiskReasons: React.FC<RiskReasonsProps> = ({
  primaryDrivers = [],
  evidenceFindings = [],
  dimensions = {},
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  // Convert technical backend strings into clean, consumer-friendly explanations
  const formatReason = (raw: string): string => {
    const text = raw.trim();
    if (!text) return text;

    // Common backend NLP/Acoustic phrases mapped to consumer explanations
    if (text.includes('SECRET_HARVESTING') || text.includes('credential_theft')) {
      return 'Sensitive credential or passcode solicitation detected';
    }
    if (text.includes('DEEPFAKE') || text.includes('synthetic') || text.includes('vocoder')) {
      return 'Synthetic acoustic indicators or AI voice artifacts observed';
    }
    if (text.includes('SPEAKER_MISMATCH') || text.includes('identity_impersonation')) {
      return 'Caller voice acoustic profile does not match enrolled identity';
    }
    if (text.includes('REPLAY') || text.includes('replay_injection')) {
      return 'Pre-recorded audio playback or acoustic replay detected';
    }
    if (text.includes('social_engineering') || text.includes('URGENCY') || text.includes('COERCION')) {
      return 'High-pressure urgency or manipulative conversational tactics detected';
    }
    if (text.includes('verification_bypass')) {
      return 'Attempted out-of-band security verification bypass detected';
    }
    if (text.includes('financial_fraud') || text.includes('wire_transfer')) {
      return 'Unverified fund transfer or financial transaction request detected';
    }

    // Default clean-up if raw string is already plain English or sentence
    return text.replace(/_/g, ' ').replace(/^[A-Z0-9-]+:\s*/, '');
  };

  // Compile unique reasons from drivers and findings
  const rawList = [...primaryDrivers, ...evidenceFindings];
  const uniqueReasons = Array.from(
    new Set(rawList.map(formatReason).filter((r) => r.length > 0))
  );

  // Check dimensions for high risk areas if list is otherwise sparse
  if (dimensions) {
    if ((dimensions.deepfake_synthetic ?? 0) > 50 && !uniqueReasons.some((r) => r.includes('AI voice'))) {
      uniqueReasons.push('AI voice cloning indicators elevated');
    }
    if ((dimensions.credential_theft ?? 0) > 50 && !uniqueReasons.some((r) => r.includes('credential'))) {
      uniqueReasons.push('Caller requested confidential passwords or OTP codes');
    }
    if ((dimensions.social_engineering ?? 0) > 50 && !uniqueReasons.some((r) => r.includes('manipulative'))) {
      uniqueReasons.push('High-pressure conversational manipulation detected');
    }
  }

  const hasReasons = uniqueReasons.length > 0;
  const displayedReasons = expanded ? uniqueReasons : uniqueReasons.slice(0, 3);

  if (compact) {
    return (
      <div className="p-3 rounded-xl bg-[#24242B] border border-[#3A3A42] shadow-sm">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[#A0A4AE] mb-1.5 flex items-center gap-1.5">
          <Info className="w-3 h-3 text-[#A0A4AE]" />
          KEY OBSERVATIONS
        </p>
        {hasReasons ? (
          <ul className="space-y-1 text-xs text-[#F5F5F7]">
            {uniqueReasons.slice(0, 3).map((reason, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-[#C87524] font-bold shrink-0">•</span>
                <span className="truncate">{reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#A0A4AE] italic">
            Reason information is currently unavailable.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-[#24242B] border border-[#3A3A42] space-y-3 shadow-glass-card">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold font-mono tracking-wider uppercase text-[#F5F5F7] flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#C87524]" />
          <span>KEY OBSERVATIONS & RISK DRIVERS</span>
        </h4>
        <span className="text-[10px] text-[#A0A4AE] font-mono">
          {uniqueReasons.length} signal{uniqueReasons.length === 1 ? '' : 's'}
        </span>
      </div>

      {hasReasons ? (
        <div className="space-y-2">
          <ul className="space-y-2">
            {displayedReasons.map((reason, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] text-xs text-[#F5F5F7] shadow-sm"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#C87524] mt-1.5 shrink-0" />
                <span className="leading-relaxed">{reason}</span>
              </li>
            ))}
          </ul>

          {uniqueReasons.length > 3 && (
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="w-full py-1 text-center text-[11px] font-mono text-[#A0A4AE] hover:text-[#F5F5F7] flex items-center justify-center gap-1 transition-colors pt-1"
            >
              <span>{expanded ? 'Show fewer observations' : `View ${uniqueReasons.length - 3} more observations`}</span>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] text-xs text-[#A0A4AE] text-center italic">
          No suspicious behavioral or acoustic anomalies detected.
        </div>
      )}
    </div>
  );
};
