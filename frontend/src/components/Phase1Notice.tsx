'use client';

import React from 'react';
import { ShieldCheck, Info, Sparkles } from 'lucide-react';

export const Phase1Notice: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#24242B] border border-[#3A3A42] text-[#A0A4AE] text-xs font-mono shadow-sm">
        <ShieldCheck className="w-3.5 h-3.5 text-[#168F86] shrink-0" />
        <span className="truncate">PHASE 1 FOUNDATION: Architectural Boundaries Active • Deterministic Policy Verified</span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-[#24242B] border border-[#3A3A42] text-[#A0A4AE] text-sm mb-6 flex items-start gap-3.5 shadow-sm">
      <div className="p-2 rounded-lg bg-[#7A1F3D]/20 border border-[#7A1F3D]/40 text-[#168F86] mt-0.5 shrink-0 shadow-sm">
        <ShieldCheck className="w-5 h-5 text-[#168F86]" />
      </div>
      <div className="space-y-1.5 min-w-0">
        <div className="font-semibold text-[#F5F5F7] flex flex-wrap items-center gap-2">
          <span className="text-sm tracking-tight font-bold text-[#F5F5F7]">VOXSHIELD Phase 1 Foundation Active</span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#7A1F3D]/20 text-[#F5F5F7] font-mono border border-[#7A1F3D]/40 shadow-sm">
            Zero Mock Scores Enforced
          </span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#168F86]/15 text-[#168F86] font-mono border border-[#168F86]/40 flex items-center gap-1 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#168F86] animate-pulse"></span>
            Fail-Closed Policy Ready
          </span>
        </div>
        <p className="text-xs text-[#A0A4AE] leading-relaxed">
          The core security layer, deterministic policy engine, privacy firewall, RBAC, independent verification channels, and AI pipeline interfaces are live. 
          Detection engine statuses explicitly report <code className="text-[#C87524] font-mono bg-[#C87524]/12 px-1.5 py-0.5 rounded border border-[#C87524]/30">NOT_AVAILABLE</code> until neural acoustic models and fine-tuned classifiers are attached in Phase 2.
        </p>
      </div>
    </div>
  );
};
