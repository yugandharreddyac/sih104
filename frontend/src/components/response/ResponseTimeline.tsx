'use client';

import React from 'react';
import { History, ShieldAlert, CheckCircle2, Ban, XCircle, FileSearch, User, Clock, AlertTriangle } from 'lucide-react';
import { formatSafeDateTime } from '@/lib/format';

export interface IncidentTimelineEvent {
  type: string;
  actorUserId?: string;
  description: string;
  timestamp: string | Date;
}

interface ResponseTimelineProps {
  events: IncidentTimelineEvent[];
  incidentStatus?: string;
  className?: string;
}

export const ResponseTimeline: React.FC<ResponseTimelineProps> = ({
  events = [],
  incidentStatus,
  className = '',
}) => {
  if (!events || events.length === 0) {
    return (
      <div className={`panel-enterprise p-4 text-center text-xs font-mono text-mutedText ${className}`}>
        NO INCIDENT EVENTS RECORDED
      </div>
    );
  }

  const getEventIcon = (type: string) => {
    if (type.includes('CONTAINED')) return <Ban className="w-3.5 h-3.5 text-danger" />;
    if (type.includes('RESOLVED')) return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
    if (type.includes('FALSE_POSITIVE')) return <XCircle className="w-3.5 h-3.5 text-mutedText" />;
    if (type.includes('INVESTIGATING')) return <FileSearch className="w-3.5 h-3.5 text-primary" />;
    if (type.includes('VERIFICATION')) return <Clock className="w-3.5 h-3.5 text-warning" />;
    return <AlertTriangle className="w-3.5 h-3.5 text-primary" />;
  };

  return (
    <section aria-label="Incident Response Timeline" className="panel-enterprise p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
            CHRONOLOGICAL RESPONSE & AUDIT TRAIL
          </h3>
        </div>
        <span className="text-[10px] font-mono text-mutedText">
          {events.length} Historical Events
        </span>
      </div>

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {events.map((evt, idx) => {
          const isLatest = idx === events.length - 1;

          return (
            <div
              key={idx}
              className={`p-3 rounded border transition-colors flex items-start gap-3 ${
                isLatest
                  ? 'bg-surface-elevated/70 border-primary/40 shadow-subtle'
                  : 'bg-surface-elevated/30 border-border/60 hover:bg-surface-elevated/50'
              }`}
            >
              <div className="p-1.5 rounded bg-surface border border-border mt-0.5 shrink-0">
                {getEventIcon(evt.type)}
              </div>

              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-primaryText truncate">
                    {evt.type.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[10px] text-mutedText">
                    {formatSafeDateTime(evt.timestamp)}
                  </span>
                </div>

                <p className="text-xs text-secondaryText font-sans leading-relaxed">
                  {evt.description}
                </p>

                {evt.actorUserId && (
                  <div className="flex items-center gap-1 text-[10px] font-mono text-mutedText pt-0.5">
                    <User className="w-2.5 h-2.5" />
                    <span>Actor: {evt.actorUserId}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
