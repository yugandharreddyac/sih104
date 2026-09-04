'use client';

import React from 'react';
import { ShieldAlert, Info } from 'lucide-react';

export const Phase1Notice: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
        <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>VOXSHIELD SOC: Real-Time Multi-Modal Voice & Social Engineering Defense</span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/70 border border-indigo-500/30 text-slate-200 text-sm mb-6 flex items-start gap-3 shadow-lg">
      <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 mt-0.5">
        <ShieldAlert className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <div className="font-semibold text-white flex items-center gap-2">
          <span>VOXSHIELD Active SOC Protection</span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-mono">
            Zero Audio Retention & Pre-Persistence Privacy Firewall Enforced
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The unified security pipeline continuously correlates 256ms acoustic neural deepfake detection, biometric speaker verification, spectral replay checks, asynchronous streaming ASR, and multi-turn conversational intent classification under deterministic policy enforcement.
        </p>
      </div>
    </div>
  );
};

