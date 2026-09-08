'use client';

import React from 'react';
import { ShieldAlert, Cpu, UserCheck, Repeat, MessageSquare, AlertTriangle } from 'lucide-react';

export interface SecurityEvidenceItem {
  category: 'ACOUSTIC' | 'BIOMETRIC' | 'REPLAY' | 'CONVERSATION' | 'POLICY' | 'GENERAL';
  title: string;
  detail: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  score?: number | null;
  timestamp?: string;
}

interface EvidenceListProps {
  items: (SecurityEvidenceItem | string)[];
  title?: string;
  emptyMessage?: string;
  className?: string;
}

export const EvidenceList: React.FC<EvidenceListProps> = ({
  items,
  title = 'Why is this a threat? (Evidence Trail)',
  emptyMessage = 'No specific threat indicators recorded.',
  className = '',
}) => {
  const getIcon = (category?: string) => {
    switch (category) {
      case 'ACOUSTIC':
        return <Cpu className="w-4 h-4 text-info" />;
      case 'BIOMETRIC':
        return <UserCheck className="w-4 h-4 text-primary" />;
      case 'REPLAY':
        return <Repeat className="w-4 h-4 text-warning" />;
      case 'CONVERSATION':
        return <MessageSquare className="w-4 h-4 text-danger" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-warning" />;
    }
  };

  const getSeverityBadge = (sev?: string) => {
    const s = (sev || 'MEDIUM').toUpperCase();
    if (s === 'CRITICAL' || s === 'HIGH') {
      return 'bg-red-500/10 text-red-400 border-red-500/25';
    }
    if (s === 'MEDIUM') {
      return 'bg-amber-500/10 text-amber-300 border-amber-500/25';
    }
    if (s === 'LOW' || s === 'INFO') {
      return 'bg-sky-500/10 text-sky-400 border-sky-500/25';
    }
    return 'bg-surface-elevated text-secondaryText border-border';
  };

  return (
    <div className={`p-4 rounded bg-surface border border-border space-y-3 ${className}`}>
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h4 className="text-xs font-semibold text-primaryText font-sans flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-warning" />
          <span>{title}</span>
        </h4>
        <span className="text-[11px] font-mono text-mutedText">
          {items.length} Signal{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-xs text-mutedText font-sans">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => {
            if (typeof item === 'string') {
              return (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-surface-elevated border border-border flex items-start gap-2.5 text-xs text-secondaryText font-sans leading-relaxed"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-info mt-1.5 shrink-0" />
                  <span>{item}</span>
                </div>
              );
            }

            return (
              <div
                key={idx}
                className="p-2.5 rounded bg-surface-elevated border border-border flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="p-1 rounded bg-surface mt-0.5 shrink-0">
                    {getIcon(item.category)}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-primaryText font-sans truncate">
                        {item.title}
                      </span>
                      <span
                        className={`text-[10px] font-sans px-1.5 py-0.2 rounded border font-medium ${getSeverityBadge(
                          item.severity
                        )}`}
                      >
                        {item.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-secondaryText font-sans leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                </div>

                {typeof item.score === 'number' && Number.isFinite(item.score) && (
                  <div className="text-right shrink-0 font-mono">
                    <span className="text-xs font-semibold text-primaryText">
                      {(item.score * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
