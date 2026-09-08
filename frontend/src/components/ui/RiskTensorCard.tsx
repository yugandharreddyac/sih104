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
      className={`group relative p-2.5 rounded border transition-colors flex flex-col justify-between ${
        severity.level === 'CRITICAL'
          ? 'bg-red-500/5 border-red-500/30'
          : severity.level === 'HIGH'
          ? 'bg-orange-500/5 border-orange-500/30'
          : severity.level === 'ELEVATED'
          ? 'bg-amber-500/5 border-amber-500/30'
          : highlight
          ? 'bg-surface-elevated border-primary/40'
          : 'bg-surface border-border hover:border-border-hover'
      }`}
      title={`${name}: ${hasValue ? numericScore : 'No measurement'}. Operational decision-support risk score (0-100). Not a probability of guilt.`}
      aria-label={`${name} risk score ${hasValue ? numericScore : 'not available'}`}
    >
      {/* Top Row: Dimension Name & Status Indicator */}
      <div className="flex items-start justify-between gap-1.5 min-h-[26px]">
        <span className="text-xs font-medium text-primaryText leading-tight font-sans break-words pr-1">
          {name}
        </span>
        <span
          className={`text-[10px] font-sans font-medium px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide ${severity.badgeClass}`}
        >
          {severity.level}
        </span>
      </div>

      {/* Middle Row: Numeric Score Value */}
      <div className="flex items-baseline justify-between pt-2 pb-1.5">
        <span className="text-[11px] text-mutedText font-sans">
          Score
        </span>
        <div className="flex items-baseline gap-0.5 font-mono">
          <span className={`text-base font-semibold leading-none ${hasValue ? severity.textClass : 'text-mutedText'}`}>
            {hasValue ? numericScore : '—'}
          </span>
          <span className="text-[11px] text-mutedText">/100</span>
        </div>
      </div>

      {/* Bottom Row: Micro-Bar Visual Metric */}
      <div className="w-full bg-surface-elevated h-1 rounded overflow-hidden">
        <div
          className={`h-full ${hasValue ? severity.barColor : 'bg-border'} rounded transition-all duration-300`}
          style={{ width: `${hasValue ? Math.min(100, Math.max(0, numericScore!)) : 0}%` }}
        />
      </div>

      {/* Operational Tooltip on Hover */}
      <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-elevated border border-border text-[11px] text-secondaryText px-2 py-1 rounded shadow-elevated whitespace-nowrap z-30 font-sans flex items-center gap-1.5">
        <Info className="w-3 h-3 text-info" />
        <span>Operational risk score (0–100). Not probability of guilt.</span>
      </div>
    </div>
  );
};
