'use client';

import React from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert, Cpu, UserCheck, Repeat, MessageSquare } from 'lucide-react';

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
        return <Cpu className="w-4 h-4 text-cyan-400" />;
      case 'BIOMETRIC':
        return <UserCheck className="w-4 h-4 text-indigo-400" />;
      case 'REPLAY':
        return <Repeat className="w-4 h-4 text-amber-300" />;
      case 'CONVERSATION':
        return <MessageSquare className="w-4 h-4 text-rose-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    }
  };

  const getSeverityBadge = (sev?: string) => {
    const s = (sev || 'MEDIUM').toUpperCase();
    if (s === 'CRITICAL' || s === 'HIGH') {
      return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    }
    if (s === 'MEDIUM') {
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    }
    if (s === 'LOW' || s === 'INFO') {
      return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
    }
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className={`p-4 rounded-xl bg-[#0c1222] border border-slate-800 space-y-3 ${className}`}>
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>{title}</span>
        </h4>
        <span className="text-[10px] font-mono text-slate-500">
          {items.length} Signal{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 font-sans">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => {
            if (typeof item === 'string') {
              return (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-300 font-sans leading-relaxed"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  <span>{item}</span>
                </div>
              );
            }

            return (
              <div
                key={idx}
                className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="p-1.5 rounded bg-slate-800/80 mt-0.5 shrink-0">
                    {getIcon(item.category)}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200 font-sans truncate">
                        {item.title}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold ${getSeverityBadge(
                          item.severity
                        )}`}
                      >
                        {item.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                </div>

                {typeof item.score === 'number' && Number.isFinite(item.score) && (
                  <div className="text-right shrink-0 font-mono">
                    <span className="text-xs font-bold text-slate-200">
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
