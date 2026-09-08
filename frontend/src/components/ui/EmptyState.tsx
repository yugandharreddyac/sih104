'use client';

import React from 'react';
import { ShieldCheck, LucideIcon, ArrowRight } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = ShieldCheck,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      role="status"
      className={`p-8 rounded bg-surface border border-border text-center flex flex-col items-center justify-center font-sans ${className}`}
    >
      <div className="w-9 h-9 rounded bg-surface-elevated border border-border flex items-center justify-center mb-2.5 text-mutedText">
        <Icon className="w-4 h-4 text-mutedText" />
      </div>
      <h4 className="text-xs font-semibold text-primaryText">{title}</h4>
      <p className="text-xs text-mutedText mt-1 max-w-sm leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-3.5 btn-primary text-xs"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
