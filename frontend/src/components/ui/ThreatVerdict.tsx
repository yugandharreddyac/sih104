'use client';

import React from 'react';
import { SecurityStatusBadge } from './SecurityStatusBadge';
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

  let borderStyle = 'border-slate-800 bg-[#0c1222]';
  let titleColor = 'text-slate-100';

  if (isHighRisk) {
    borderStyle = 'border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-[#0c1222] to-[#0c1222]';
    titleColor = 'text-rose-400';
  } else if (isSuspicious) {
    borderStyle = 'border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-[#0c1222] to-[#0c1222]';
    titleColor = 'text-amber-300';
  } else if (isSafe) {
    borderStyle = 'border-emerald-500/40 bg-gradient-to-r from-emerald-950/30 via-[#0c1222] to-[#0c1222]';
    titleColor = 'text-emerald-400';
  }

  return (
    <div className={`p-5 rounded-xl border ${borderStyle} ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
            {isHighRisk ? (
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            ) : isSuspicious ? (
              <AlertTriangle className="w-5 h-5 text-amber-300" />
            ) : isSafe ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            ) : (
              <Activity className="w-5 h-5 text-cyan-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-sans">
                Voice Security Verdict
              </span>
              {callerIdentifier && (
                <span className="text-xs font-mono text-cyan-400 font-semibold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                  {callerIdentifier}
                </span>
              )}
            </div>
            <h3 className={`text-base font-bold font-sans mt-0.5 ${titleColor}`}>
              {norm.replace(/_/g, ' ')}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">Threat Score</div>
            {typeof riskScore === 'number' && Number.isFinite(riskScore) ? (
              <div className={`text-xl font-bold font-mono ${isHighRisk ? 'text-rose-400' : isSuspicious ? 'text-amber-300' : 'text-emerald-400'}`}>
                {Math.round(riskScore > 1 ? riskScore : riskScore * 100)}%
              </div>
            ) : (
              <div className="text-sm font-bold font-mono text-slate-500">
                —
              </div>
            )}
          </div>
          <div className="text-right pl-3 border-l border-slate-800">
            <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">Confidence</div>
            {typeof confidence === 'number' && Number.isFinite(confidence) ? (
              <div className="text-sm font-semibold font-mono text-slate-300">
                {Math.round(confidence > 1 ? confidence : confidence * 100)}%
              </div>
            ) : (
              <div className="text-sm font-bold font-mono text-slate-500">
                —
              </div>
            )}
          </div>
        </div>
      </div>

      {summary && (
        <p className="text-xs text-slate-300 mt-3 leading-relaxed font-sans">
          {summary}
        </p>
      )}
    </div>
  );
};
