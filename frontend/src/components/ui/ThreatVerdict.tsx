'use client';

import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Activity } from 'lucide-react';

interface ThreatVerdictProps {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK' | 'CRITICAL' | 'ANALYZING' | 'READY' | 'AI_UNAVAILABLE' | string;
  riskScore?: number | null;
  confidence?: number | null;
  summary?: string;
  callerIdentifier?: string;
  className?: string;
}

export const ThreatVerdict: React.FC<ThreatVerdictProps> = ({
  verdict,
  riskScore,
  confidence,
  summary,
  callerIdentifier,
  className = '',
}) => {
  const norm = verdict.toUpperCase();
  const isHighRisk = ['HIGH_RISK', 'HIGH', 'CRITICAL', 'DETECTED', 'SPOOF', 'THREAT_DETECTED'].includes(norm);
  const isSuspicious = ['SUSPICIOUS', 'INCONCLUSIVE', 'PENDING', 'REVIEW_REQUIRED'].includes(norm);
  const isSafe = ['SAFE', 'AUTHENTIC', 'NOT_DETECTED'].includes(norm);

  let borderStyle = 'border-border bg-surface';
  let titleColor = 'text-primaryText';

  if (isHighRisk) {
    borderStyle = 'border-red-500/40 bg-surface';
    titleColor = 'text-danger';
  } else if (isSuspicious) {
    borderStyle = 'border-amber-500/40 bg-surface';
    titleColor = 'text-warning';
  } else if (isSafe) {
    borderStyle = 'border-green-500/40 bg-surface';
    titleColor = 'text-success';
  }

  return (
    <div className={`p-4 rounded border ${borderStyle} ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-surface-elevated border border-border">
            {isHighRisk ? (
              <ShieldAlert className="w-5 h-5 text-danger" />
            ) : isSuspicious ? (
              <AlertTriangle className="w-5 h-5 text-warning" />
            ) : isSafe ? (
              <ShieldCheck className="w-5 h-5 text-success" />
            ) : (
              <Activity className="w-5 h-5 text-info" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-mutedText font-sans">
                Voice Security Verdict
              </span>
              {callerIdentifier && (
                <span className="text-xs font-mono text-primary font-medium px-1.5 py-0.2 rounded bg-surface-elevated border border-border">
                  {callerIdentifier}
                </span>
              )}
            </div>
            <h3 className={`text-sm font-semibold font-sans mt-0.5 ${titleColor}`}>
              {norm.replace(/_/g, ' ')}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] text-mutedText font-sans">Threat Score</div>
            {typeof riskScore === 'number' && Number.isFinite(riskScore) ? (
              <div className={`text-xl font-semibold font-mono ${isHighRisk ? 'text-danger' : isSuspicious ? 'text-warning' : 'text-success'}`}>
                {Math.round(riskScore > 1 ? riskScore : riskScore * 100)}%
              </div>
            ) : (
              <div className="text-sm font-medium font-mono text-mutedText">
                —
              </div>
            )}
          </div>
          <div className="text-right pl-3 border-l border-border">
            <div className="text-[11px] text-mutedText font-sans">Confidence</div>
            {typeof confidence === 'number' && Number.isFinite(confidence) ? (
              <div className="text-sm font-semibold font-mono text-secondaryText">
                {Math.round(confidence > 1 ? confidence : confidence * 100)}%
              </div>
            ) : (
              <div className="text-sm font-medium font-mono text-mutedText">
                —
              </div>
            )}
          </div>
        </div>
      </div>

      {summary && (
        <p className="text-xs text-secondaryText mt-2.5 leading-relaxed font-sans">
          {summary}
        </p>
      )}
    </div>
  );
};
