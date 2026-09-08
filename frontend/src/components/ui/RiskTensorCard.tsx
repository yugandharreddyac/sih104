'use client';

import React from 'react';
import { getRiskSeverity } from '@/lib/format';
import { Info } from 'lucide-react';

interface RiskTensorCardProps {
  name: string;
  score: number | null | undefined;
  description?: string;
  highlight?: boolean;
}

export const RiskTensorCard: React.FC<RiskTensorCardProps> = ({
  name,
  score,
  description,
  highlight = false,
}) => {
  const hasValue = typeof score === 'number' && Number.isFinite(score);
  const numericScore = hasValue ? Math.round(score! > 1 ? score! : score! * 100) : null;
  const severity = getRiskSeverity(numericScore);

  return (
    <div
      className={`group relative p-3 rounded-lg border transition-all duration-200 flex flex-col justify-between ${
        severity.level === 'CRITICAL'
          ? 'bg-rose-950/20 border-rose-500/40 shadow-sm shadow-rose-950/30'
          : severity.level === 'HIGH'
          ? 'bg-orange-950/20 border-orange-500/30'
          : severity.level === 'ELEVATED'
          ? 'bg-amber-950/15 border-amber-500/30'
          : highlight
          ? 'bg-slate-900/90 border-indigo-500/40'
          : 'bg-slate-950/60 border-slate-800/90 hover:border-slate-700/80'
      }`}
      title={`${name}: ${hasValue ? numericScore : 'No measurement'}. Operational decision-support risk score (0-100). Not a probability of guilt.`}
      aria-label={`${name} risk score ${hasValue ? numericScore : 'not available'}`}
    >
      {/* Top Row: Dimension Name & Status Indicator */}
      <div className="flex items-start justify-between gap-1.5 min-h-[28px]">
        <span className="text-[11px] font-semibold text-slate-200 leading-tight font-sans break-words pr-1">
          {name}
        </span>
        <span
          className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 uppercase tracking-wider ${severity.badgeClass}`}
        >
          {severity.level}
        </span>
      </div>

      {/* Middle Row: Numeric Score Value */}
      <div className="flex items-baseline justify-between pt-2 pb-1.5">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          Risk Score
        </span>
        <div className="flex items-baseline gap-1 font-mono">
          <span className={`text-lg font-bold leading-none ${hasValue ? severity.textClass : 'text-slate-500'}`}>
            {hasValue ? numericScore : '—'}
          </span>
          <span className="text-[10px] text-slate-500">/100</span>
        </div>
      </div>

      {/* Bottom Row: Micro-Bar Visual Metric */}
      <div className="w-full bg-slate-800/90 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full ${hasValue ? severity.barColor : 'bg-slate-800'} rounded-full transition-all duration-300`}
          style={{ width: `${hasValue ? Math.min(100, Math.max(0, numericScore!)) : 0}%` }}
        />
      </div>

      {/* Operational Tooltip on Hover */}
      <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 text-[10px] text-slate-300 px-2 py-1 rounded shadow-xl whitespace-nowrap z-30 font-mono flex items-center gap-1">
        <Info className="w-3 h-3 text-cyan-400" />
        <span>Operational risk score (0-100). Not probability of guilt.</span>
      </div>
    </div>
  );
};
