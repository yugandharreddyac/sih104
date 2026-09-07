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
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800 ${className}`}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="p-1.5 rounded-lg bg-slate-800/80 text-cyan-400 border border-slate-700/60 shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-100 font-sans tracking-wide">
              {title}
            </h2>
            {typeof count === 'number' && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {count}
              </span>
            )}
            {badgeText && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold">
                {badgeText}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-400 font-sans mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actionButton}
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh Data"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
};
