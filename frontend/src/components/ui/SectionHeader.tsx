'use client';

import React from 'react';
import { LucideIcon, RefreshCw } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  count?: number;
  badgeText?: string;
  onRefresh?: () => void;
  loading?: boolean;
  actionButton?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  count,
  badgeText,
  onRefresh,
  loading = false,
  actionButton,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border ${className}`}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="p-1.5 rounded bg-surface-elevated text-secondaryText border border-border shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-primaryText font-sans">
              {title}
            </h2>
            {typeof count === 'number' && (
              <span className="text-[11px] font-mono font-medium px-1.5 py-0.2 rounded bg-surface-elevated text-secondaryText border border-border">
                {count}
              </span>
            )}
            {badgeText && (
              <span className="badge-primary text-[11px] font-sans">
                {badgeText}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-mutedText font-sans mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actionButton}
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh Data"
            className="p-1.5 rounded bg-surface border border-border text-mutedText hover:text-primaryText hover:border-border-hover transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
};
