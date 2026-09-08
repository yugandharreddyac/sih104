'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  label?: string;
  description?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading operational telemetry...',
  description = 'System is responsive. Synchronizing with security gateway.',
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-8 rounded bg-surface border border-border text-center flex flex-col items-center justify-center space-y-2.5 ${className}`}
    >
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
      <span className="text-xs font-semibold text-primaryText font-sans">{label}</span>
      <p className="text-[11px] text-mutedText font-sans max-w-sm leading-relaxed">{description}</p>
    </div>
  );
};
