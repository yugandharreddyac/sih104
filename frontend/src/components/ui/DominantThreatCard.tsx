'use client';

import React from 'react';
import { ShieldAlert, TrendingUp } from 'lucide-react';
import { getRiskSeverity, formatPercentage } from '@/lib/format';

interface DominantThreatCardProps {
  overallRiskScore: number | null | undefined;
  riskLevel: string | null | undefined;
  confidence: number | null | undefined;
  velocity: number | null | undefined;
  dimensions: Record<string, number | null | undefined>;
  policyId?: string | null;
  policyExplanation?: string | null;
  unboxed?: boolean;
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
  unboxed = false,
}) => {
  const hasScore = typeof overallRiskScore === 'number' && Number.isFinite(overallRiskScore);
  const scoreVal = hasScore ? Math.round(overallRiskScore! > 1 ? overallRiskScore! : overallRiskScore! * 100) : null;
  const severity = getRiskSeverity(scoreVal);

  // Identify dimensions sorted descending
  const sortedDims = Object.entries(dimensions)
    .filter(([k, v]) => k !== 'overall' && typeof v === 'number' && Number.isFinite(v))
    .map(([k, v]) => ({
      key: k,
      name: DIMENSION_DISPLAY_NAMES[k] || k,
      score: Math.round(v! > 1 ? v! : v! * 100),
    }))
    .sort((a, b) => b.score - a.score);

  const primaryThreat = sortedDims.find((d) => d.score >= 20) || sortedDims[0] || null;
  const contributingSignals = sortedDims.filter((d) => d.score > 0).slice(0, 3);

  return (
    <div className={unboxed ? "space-y-4" : "border border-border rounded bg-surface overflow-hidden"}>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* LEFT: THREAT ASSESSMENT */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-secondaryText" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-secondaryText font-sans">
                Threat Assessment
              </h3>
            </div>
            <span className={`text-[11px] font-sans font-medium px-2 py-0.5 rounded ${severity.badgeClass}`}>
              {riskLevel || severity.level}
            </span>
          </div>

          <div className="space-y-2.5 text-xs font-sans">
            <div>
              <span className="text-[11px] text-mutedText block">Primary Threat</span>
              <span className="text-sm font-semibold text-primaryText block mt-0.5">
                {primaryThreat && primaryThreat.score >= 20 ? primaryThreat.name : 'Nominal / Baseline Operations'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1 border-t border-border/40">
              <div>
                <span className="text-[11px] text-mutedText block">Risk</span>
                <div className="flex items-baseline gap-1 mt-0.5 font-mono">
                  <span className={`text-base font-semibold ${hasScore ? severity.textClass : 'text-mutedText'}`}>
                    {hasScore ? scoreVal : '—'}
                  </span>
                  <span className="text-xs text-mutedText">/ 100</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-mutedText block">Confidence</span>
                <span className="text-base font-semibold font-mono text-primaryText block mt-0.5">
                  {formatPercentage(confidence)}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-mutedText block">Policy</span>
                <span className="text-xs font-mono text-secondaryText block mt-1 truncate">
                  {policyId || 'POL-CRED-001'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: RISK ASSESSMENT */}
        <div className="p-4 space-y-3 bg-surface-elevated/20">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-secondaryText font-sans">
              Risk Assessment
            </h3>
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className={`text-xs font-semibold ${hasScore ? severity.textClass : 'text-mutedText'}`}>
                {hasScore ? `${scoreVal} / 100` : '— / 100'}
              </span>
              <span className={`text-[10px] font-sans font-medium px-1.5 py-0.5 rounded uppercase ${severity.badgeClass}`}>
                {severity.level}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-xs font-sans">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-mutedText">Evaluation Velocity</span>
              <span className="font-mono text-secondaryText flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-mutedText" />
                <span>
                  {typeof velocity === 'number'
                    ? `${velocity >= 0 ? '+' : ''}${velocity.toFixed(2)} / sec`
                    : '0.00 / sec'}
                </span>
              </span>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-border/40">
              <span className="text-[10px] uppercase tracking-wider text-mutedText font-medium block">
                Top Contributing Signals
              </span>
              {contributingSignals.length > 0 ? (
                contributingSignals.map((sig) => (
                  <div key={sig.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-secondaryText truncate">{sig.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-1 bg-surface-elevated rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            sig.score >= 70 ? 'bg-danger' : sig.score >= 45 ? 'bg-warning' : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, sig.score))}%` }}
                        />
                      </div>
                      <span className="font-mono font-medium text-primaryText text-[11px] w-6 text-right">
                        {sig.score}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-xs text-mutedText italic block">
                  All telemetry metrics within standard baseline.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
