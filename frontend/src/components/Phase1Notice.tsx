'use client';

import React from 'react';
import { ShieldAlert, Info } from 'lucide-react';

export const Phase1Notice: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
        <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>PHASE 1 FOUNDATION: Architectural boundaries active. Zero fake AI scores generated.</span>
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
          <span>VOXSHIELD Phase 1 Foundation Active</span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-mono">
            Zero Mock Scores Rule Enforced
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The core security layer, deterministic policy engine, privacy firewall, RBAC, independent verification channels, and AI pipeline interfaces are live. 
          Detection engine statuses explicitly report <code className="text-amber-400 font-mono">NOT_AVAILABLE</code> until neural acoustic models and fine-tuned classifiers are attached in Phase 2.
        </p>
      </div>
    </div>
  );
};
