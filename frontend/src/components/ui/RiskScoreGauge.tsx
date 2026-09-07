'use client';

import React from 'react';

interface RiskScoreGaugeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

export const RiskScoreGauge: React.FC<RiskScoreGaugeProps> = ({
  score,
  size = 'md',
  showLabel = true,
  label = 'Threat Score',
  className = '',
}) => {
  const isAvailable = typeof score === 'number' && Number.isFinite(score);
  const normalizedScore = isAvailable ? Math.max(0, Math.min(1, score as number)) : 0;
  const percentage = Math.round(normalizedScore * 100);

  const isCritical = isAvailable && normalizedScore >= 0.7;
  const isElevated = isAvailable && normalizedScore >= 0.4 && normalizedScore < 0.7;
  const isSafe = isAvailable && normalizedScore < 0.4;

  let colorClass = 'text-slate-500';
  let barBg = 'bg-slate-700';

  if (isCritical) {
    colorClass = 'text-rose-400';
    barBg = 'bg-rose-500';
  } else if (isElevated) {
    colorClass = 'text-amber-300';
    barBg = 'bg-amber-400';
  } else if (isSafe) {
    colorClass = 'text-emerald-400';
    barBg = 'bg-emerald-400';
  }

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        {showLabel && (
          <span className="font-sans font-medium text-slate-400 uppercase tracking-wider text-[11px]">
            {label}
          </span>
        )}
        <span className={`font-mono font-bold ${textSizes[size]} ${colorClass}`}>
          {isAvailable ? `${percentage}%` : '—'}
        </span>
      </div>

      <div className={`w-full rounded-full bg-slate-800/80 overflow-hidden ${heightClasses[size]}`}>
        <div
          className={`h-full transition-all duration-500 rounded-full ${barBg}`}
          style={{ width: isAvailable ? `${percentage}%` : '0%' }}
        />
      </div>
    </div>
  );
};
