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

  let colorClass = 'text-mutedText';
  let barBg = 'bg-border';

  if (isCritical) {
    colorClass = 'text-danger';
    barBg = 'bg-danger';
  } else if (isElevated) {
    colorClass = 'text-warning';
    barBg = 'bg-warning';
  } else if (isSafe) {
    colorClass = 'text-success';
    barBg = 'bg-success';
  }

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-2.5',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-base',
    lg: 'text-xl',
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        {showLabel && (
          <span className="font-sans font-medium text-secondaryText text-xs">
            {label}
          </span>
        )}
        <span className={`font-mono font-semibold ${textSizes[size]} ${colorClass}`}>
          {isAvailable ? `${percentage}%` : '—'}
        </span>
      </div>

      <div className={`w-full rounded bg-surface-elevated overflow-hidden ${heightClasses[size]}`}>
        <div
          className={`h-full transition-all duration-300 rounded ${barBg}`}
          style={{ width: isAvailable ? `${percentage}%` : '0%' }}
        />
      </div>
    </div>
  );
};
