'use client';

import React from 'react';
import { ShieldAlert, AlertTriangle, TrendingUp, HelpCircle, Activity } from 'lucide-react';
import { getRiskSeverity, formatPercentage } from '@/lib/format';

interface DominantThreatCardProps {
  overallRiskScore: number | null | undefined;
  riskLevel: string | null | undefined;
  confidence: number | null | undefined;
  velocity: number | null | undefined;
  dimensions: Record<string, number | null | undefined>;
  policyId?: string | null;
  policyExplanation?: string | null;
}

const DIMENSION_DISPLAY_NAMES: Record<string, string> = {
  credential_theft: 'Credential Theft',
  social_engineering: 'Social Engineering',
  verification_bypass: 'Verification Bypass',
  financial_fraud: 'Financial Fraud',
  identity_impersonation: 'Identity Impersonation',
  account_takeover: 'Account Takeover',
  deepfake_synthetic: 'Deepfake / Synthetic',
  replay_injection: 'Replay / Injection',
  inconsistency: 'Signal Inconsistency',
  overall: 'Overall Composite',
};

export const DominantThreatCard: React.FC<DominantThreatCardProps> = ({
  overallRiskScore,
  riskLevel,
  confidence,
  velocity,
  dimensions,
  policyId,
  policyExplanation,
}) => {
  const hasScore = typeof overallRiskScore === 'number' && Number.isFinite(overallRiskScore);
  const scoreVal = hasScore ? Math.round(overallRiskScore! > 1 ? overallRiskScore! : overallRiskScore! * 100) : null;
  const severity = getRiskSeverity(scoreVal);

  // Identify elevated dimensions sorted descending
  const elevatedDims = Object.entries(dimensions)
    .filter(([k, v]) => k !== 'overall' && typeof v === 'number' && Number.isFinite(v) && (v! > 1 ? v! : v! * 100) >= 30)
    .map(([k, v]) => ({
      key: k,
      name: DIMENSION_DISPLAY_NAMES[k] || k,
      score: Math.round(v! > 1 ? v! : v! * 100),
    }))
    .sort((a, b) => b.score - a.score);

  const primaryThreat = elevatedDims[0] || null;
  const contributingSignals = elevatedDims.slice(1);

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        severity.level === 'CRITICAL'
          ? 'bg-gradient-to-r from-rose-950/40 via-slate-900/90 to-slate-900/90 border-rose-500/40 shadow-lg shadow-rose-950/20'
          : severity.level === 'HIGH'
          ? 'bg-gradient-to-r from-orange-950/30 via-slate-900/90 to-slate-900/90 border-orange-500/40'
          : severity.level === 'ELEVATED'
          ? 'bg-gradient-to-r from-amber-950/25 via-slate-900/90 to-slate-900/90 border-amber-500/30'
          : 'bg-slate-900/80 border-slate-800'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg shrink-0 ${
              severity.level === 'CRITICAL'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                : severity.level === 'HIGH'
                ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
            }`}
          >
            <ShieldAlert className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded ${severity.badgeClass}`}>
                {riskLevel || severity.level} THREAT LEVEL
              </span>
              {policyId && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 font-semibold">
                  RULE: {policyId}
                </span>
              )}
            </div>

            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Primary Vector:</span>
              <h3 className="text-sm font-bold text-white font-sans">
                {primaryThreat ? primaryThreat.name : 'No Elevated Threat Dimension'}
              </h3>
            </div>
          </div>
        </div>

        {/* Core Metrics: Composite Score, Confidence, Velocity */}
        <div className="flex items-center gap-4 self-end sm:self-center">
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Composite Risk
            </span>
            <div className="flex items-baseline gap-0.5 font-mono">
              <span className={`text-2xl font-bold leading-none ${severity.textClass}`}>
                {scoreVal !== null ? scoreVal : '—'}
              </span>
              <span className="text-xs text-slate-500">/100</span>
            </div>
          </div>

          <div className="text-right pl-3 border-l border-slate-800">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Confidence
            </span>
            <span className="text-sm font-bold font-mono text-emerald-400 block">
              {formatPercentage(confidence)}
            </span>
          </div>

          {typeof velocity === 'number' && (
            <div className="text-right pl-3 border-l border-slate-800 hidden md:block">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Velocity
              </span>
              <span className="text-sm font-semibold font-mono text-rose-400 flex items-center justify-end gap-0.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{velocity > 0 ? `+${velocity.toFixed(2)}` : velocity.toFixed(2)}/s</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Contributing Signals & Explainability Footnote */}
      <div className="pt-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold shrink-0">
            Contributing Signals:
          </span>
          {contributingSignals.length > 0 ? (
            contributingSignals.map((sig) => (
              <span
                key={sig.key}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-300"
              >
                <span>{sig.name}</span>
                <span className="font-bold text-amber-300">{sig.score}</span>
              </span>
            ))
          ) : (
            <span className="text-slate-400 text-[11px] font-mono italic">
              None currently exceeding baseline threshold
            </span>
          )}
        </div>

        <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1 shrink-0">
          <HelpCircle className="w-3 h-3 text-slate-400 shrink-0" />
          <span>Risk Score is an operational decision metric, not probability of guilt.</span>
        </div>
      </div>
    </div>
  );
};
