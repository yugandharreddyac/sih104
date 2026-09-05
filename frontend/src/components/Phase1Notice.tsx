'use client';

import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';

export const Phase1Notice: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
        <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span>VOXSHIELD SOC: Real-Time Voice Impersonation & Social Engineering Defense</span>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/70 border border-indigo-500/30 text-slate-200 text-sm mb-6 flex items-start gap-3 shadow-lg">
      <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 mt-0.5 shrink-0">
        <ShieldCheck className="w-5 h-5 text-cyan-400" />
      </div>
      <div className="space-y-1 min-w-0">
        <div className="font-semibold text-white flex flex-wrap items-center gap-2">
          <span>VOXSHIELD Active SOC Protection</span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
            Zero Audio Retention & Privacy Firewall Enforced
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          Real-time pipeline: 256ms acoustic neural deepfake detection, biometric speaker verification, spectral replay analysis, streaming ASR, and multi-turn conversational risk fusion under deterministic policy enforcement.
        </p>
      </div>
    </div>
  );
};
