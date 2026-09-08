'use client';

import React from 'react';
import { Clock, TrendingUp, TrendingDown, Minus, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { formatSafeTime, getRiskSeverity } from '@/lib/format';

export interface TimelinePoint {
  turnIndex: number;
  overallScore: number | null;
  riskLevel: string;
  velocity?: number;
  timestamp: string;
  primaryDrivers?: string[];
  policyId?: string | null;
  recommendedAction?: string | null;
}

interface RiskTimelineProps {
  timeline: TimelinePoint[];
  isLoading?: boolean;
}

export const RiskTimeline: React.FC<RiskTimelineProps> = ({
  timeline = [],
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="panel-enterprise p-4 text-center text-xs font-mono text-mutedText animate-pulse">
        Loading multi-turn risk evolution telemetry...
      </div>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <div className="panel-enterprise p-5 text-center space-y-2">
        <Clock className="w-5 h-5 text-mutedText mx-auto" />
        <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-primaryText">
          NO TIMELINE TELEMETRY RECORDED
        </h3>
        <p className="text-xs text-mutedText max-w-md mx-auto font-sans">
          Risk evolution will dynamically record evaluations as conversational audio chunks and dialogue turns are processed.
        </p>
      </div>
    );
  }

  // Check if recovery occurred across turns (e.g. from elevated >= 50 down to lower)
  const hasRecovery = timeline.some((pt, idx) => {
    if (idx === 0) return false;
    const prevScore = timeline[idx - 1].overallScore ?? 0;
    const currScore = pt.overallScore ?? 0;
    return prevScore >= 50 && currScore < 50;
  });

  return (
    <section aria-label="Multi-Turn Risk Evolution Timeline" className="panel-enterprise p-4 md:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primaryText font-mono">
              MULTI-TURN RISK EVOLUTION & DYNAMIC RECOVERY TIMELINE
            </h2>
            <p className="text-[11px] text-mutedText font-sans">
              Sequential turn-by-turn risk assessments verifying dynamic threat escalation and recovery
            </p>
          </div>
        </div>

        {hasRecovery && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-success/10 border border-success/30 text-success self-start sm:self-center font-bold">
            ✓ THREAT RECOVERY RECORDED (NON-LATCHING)
          </span>
        )}
      </div>

      {/* Trajectory Sparkline Bar Graph */}
      <div className="bg-surface-elevated/40 p-3 rounded border border-border space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-mutedText uppercase tracking-wider">
          <span>Turn-by-Turn Threat Trajectory</span>
          <span>Evaluation Range: 0–100</span>
        </div>

        <div className="flex items-end gap-2 h-20 pt-2 border-b border-border/60">
          {timeline.map((pt, idx) => {
            const score = typeof pt.overallScore === 'number' ? Math.round(pt.overallScore > 1 ? pt.overallScore : pt.overallScore * 100) : 0;
            const heightPct = Math.max(8, Math.min(100, score));
            const isCritical = score >= 70;
            const isHigh = score >= 50;

            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-20 p-2 rounded bg-surface border border-border text-[10px] font-mono whitespace-nowrap shadow-enterprise">
                  <div className="font-bold text-primaryText">Turn {pt.turnIndex}: {score}/100</div>
                  <div className="text-secondaryText">Level: {pt.riskLevel}</div>
                  <div className="text-mutedText">{formatSafeTime(pt.timestamp)}</div>
                </div>

                <div
                  className={`w-full max-w-[28px] rounded-t transition-all ${
                    isCritical
                      ? 'bg-danger'
                      : isHigh
                      ? 'bg-warning'
                      : score > 0
                      ? 'bg-success'
                      : 'bg-border'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
                <span className="text-[9px] font-mono text-mutedText">T{pt.turnIndex}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chronological Event Cards */}
      <div className="space-y-2">
        {timeline.map((pt, idx) => {
          const score = typeof pt.overallScore === 'number' ? Math.round(pt.overallScore > 1 ? pt.overallScore : pt.overallScore * 100) : null;
          const severity = getRiskSeverity(score);
          const isCritical = pt.riskLevel === 'CRITICAL' || (score !== null && score >= 70);
          const isHigh = pt.riskLevel === 'HIGH' || (score !== null && score >= 50);

          // Calculate delta from previous turn
          const prevScore = idx > 0 && typeof timeline[idx - 1].overallScore === 'number'
            ? Math.round(timeline[idx - 1].overallScore! > 1 ? timeline[idx - 1].overallScore! : timeline[idx - 1].overallScore! * 100)
            : null;

          const delta = prevScore !== null && score !== null ? score - prevScore : null;

          return (
            <div
              key={idx}
              className={`p-3 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                isCritical
                  ? 'border-danger/60 bg-danger/10'
                  : isHigh
                  ? 'border-warning/50 bg-warning/5'
                  : 'border-border bg-surface hover:bg-surface-elevated/40'
              }`}
            >
              {/* Left: Turn index & Timestamp */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-surface-elevated border border-border flex flex-col items-center justify-center font-mono shrink-0">
                  <span className="text-[9px] uppercase text-mutedText">TURN</span>
                  <span className="font-bold text-xs text-primaryText leading-none">{pt.turnIndex}</span>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primaryText">
                      {formatSafeTime(pt.timestamp)}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                        isCritical
                          ? 'badge-danger'
                          : isHigh
                          ? 'badge-warning'
                          : score !== null
                          ? 'badge-success'
                          : 'badge-neutral'
                      }`}
                    >
                      {pt.riskLevel}
                    </span>
                  </div>

                  {pt.primaryDrivers && pt.primaryDrivers.length > 0 ? (
                    <p className="text-xs text-secondaryText line-clamp-1 font-sans">
                      {pt.primaryDrivers[0]}
                    </p>
                  ) : (
                    <p className="text-xs text-mutedText italic font-sans">
                      {score !== null && score < 30
                        ? 'Current evaluation returned low risk; baseline nominal.'
                        : 'Evaluation completed.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Score, Delta, and Policy Decision */}
              <div className="flex items-center justify-between sm:justify-end gap-4 font-mono text-xs shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                {delta !== null && (
                  <span
                    className={`flex items-center gap-0.5 text-[11px] font-semibold ${
                      delta > 0 ? 'text-danger' : delta < 0 ? 'text-success' : 'text-mutedText'
                    }`}
                  >
                    {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    <span>{delta > 0 ? `+${delta}` : delta}</span>
                  </span>
                )}

                <div className="text-right">
                  <span className="text-mutedText text-[10px] block uppercase">Score</span>
                  <span className={`font-mono font-bold text-sm ${severity.textClass}`}>
                    {score !== null ? `${score}/100` : '—'}
                  </span>
                </div>

                {pt.policyId && (
                  <div className="text-right hidden sm:block">
                    <span className="text-mutedText text-[10px] block uppercase">Policy</span>
                    <span className="text-primary font-bold text-xs truncate max-w-[120px] block">
                      {pt.policyId}
                    </span>
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
