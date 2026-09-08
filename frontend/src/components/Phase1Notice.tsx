'use client';

import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';

export const Phase1Notice: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface border border-border text-secondaryText text-xs font-sans">
        <Info className="w-3.5 h-3.5 text-info shrink-0" />
        <span>VOXSHIELD SOC: Real-Time Voice Impersonation & Social Engineering Defense</span>
      </div>
    );
  }

  return (
    <div className="p-3 rounded bg-surface border border-border text-secondaryText text-xs mb-4 flex items-start gap-3">
      <div className="p-1.5 rounded bg-surface-elevated text-primary mt-0.5 shrink-0">
        <ShieldCheck className="w-4 h-4" />
      </div>
      <div className="space-y-0.5 min-w-0">
        <div className="font-medium text-primaryText flex flex-wrap items-center gap-2">
          <span>Voice Session Monitoring</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-elevated text-secondaryText border border-border font-sans">
            Privacy Firewall Enforced
          </span>
        </div>
        <p className="text-xs text-mutedText leading-relaxed font-sans">
          Real-time voice stream protection: acoustic deepfake detection, speaker biometrics, and deterministic policy enforcement.
        </p>
      </div>
    </div>
  );
};
