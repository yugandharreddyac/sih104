'use client';

import React from 'react';
import { getRiskSeverity } from '@/lib/format';
import { ShieldCheck, Info } from 'lucide-react';

interface DetectionSignalsTableProps {
  dimensions: Record<string, number | null | undefined>;
  className?: string;
  unboxed?: boolean;
}

const SIGNAL_METADATA: Record<string, { label: string; weight: string; description: string }> = {
  credential_theft: {
    label: 'Credential Theft',
    weight: 'High Weight',
    description: 'Solicitation of MFA, OTP, or password credentials',
  },
  social_engineering: {
    label: 'Social Engineering',
    weight: 'High Weight',
    description: 'Urgency manipulation, authority exploitation, or coercion',
  },
  identity_impersonation: {
    label: 'Identity Impersonation',
    weight: 'Critical Weight',
    description: 'Voiceprint discrepancy against enrolled biometric profile',
  },
  deepfake_synthetic: {
    label: 'Deepfake / Synthetic Voice',
    weight: 'Critical Weight',
    description: 'Vocoder phase jitter and synthetic acoustic artifacts',
  },
  financial_fraud: {
    label: 'Financial Fraud Solicitation',
    weight: 'Critical Weight',
    description: 'High-value wire, treasury, or beneficiary diversion',
  },
  account_takeover: {
    label: 'Account Takeover / Remote Access',
    weight: 'High Weight',
    description: 'Remote desktop installation (AnyDesk, TeamViewer) requests',
  },
  verification_bypass: {
    label: 'Verification Bypass Coercion',
    weight: 'High Weight',
    description: 'Attempt to bypass out-of-band security controls',
  },
  replay_injection: {
    label: 'Replay / Loudspeaker Injection',
    weight: 'Medium Weight',
    description: 'Acoustic roll-off from physical loudspeaker playback',
  },
  inconsistency: {
    label: 'Dialogue Claim Inconsistency',
    weight: 'Medium Weight',
    description: 'Contradictory caller identities or factual assertions',
  },
  overall: {
    label: 'Composite Threat Score',
    weight: 'Weighted Aggregate',
    description: 'Multi-modal weighted composite score across all factors',
  },
};

export const DetectionSignalsTable: React.FC<DetectionSignalsTableProps> = ({
  dimensions,
  className = '',
  unboxed = false,
}) => {
  // Sort signals: Composite first or by score descending
  const rows = Object.entries(dimensions)
    .filter(([key]) => key in SIGNAL_METADATA)
    .map(([key, rawVal]) => {
      const hasScore = typeof rawVal === 'number' && Number.isFinite(rawVal);
      const score = hasScore ? Math.round(rawVal! > 1 ? rawVal! : rawVal! * 100) : 0;
      const meta = SIGNAL_METADATA[key];
      const severity = getRiskSeverity(score);

      return {
        key,
        label: meta.label,
        weight: meta.weight,
        description: meta.description,
        score,
        hasScore,
        severity,
        isOverall: key === 'overall',
      };
    })
    .sort((a, b) => {
      if (a.isOverall) return -1;
      if (b.isOverall) return 1;
      return b.score - a.score;
    });

  if (unboxed) {
    return (
      <div className={`space-y-2.5 ${className}`}>
        <div className="flex items-center justify-between pb-1.5 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText font-sans">
              Detection Signals
            </span>
            <span className="text-[11px] text-mutedText font-sans">
              (Analytical Breakdown)
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-mutedText font-sans">
            <Info className="w-3.5 h-3.5" />
            <span>Operational risk scores (0–100)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-sans">
            <thead>
              <tr className="border-b border-border text-[11px] text-mutedText font-medium">
                <th className="py-2 pr-3.5 font-medium">Signal</th>
                <th className="py-2 px-3.5 font-medium w-36">Magnitude</th>
                <th className="py-2 px-3.5 font-medium text-right w-20">Score</th>
                <th className="py-2 pl-3.5 font-medium text-right w-24">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={`hover:bg-surface-hover/40 transition-colors ${
                    row.isOverall ? 'font-semibold bg-surface-elevated/20' : ''
                  }`}
                >
                  <td className="py-2 pr-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-primaryText">{row.label}</span>
                      <span className="text-[10px] text-mutedText font-sans font-normal">
                        ({row.weight})
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3.5">
                    <div className="w-full bg-surface-elevated h-1.5 rounded-full overflow-hidden border border-border/30">
                      <div
                        className={`h-full transition-all duration-300 ${
                          row.score >= 70
                            ? 'bg-danger'
                            : row.score >= 50
                            ? 'bg-warning'
                            : row.score >= 20
                            ? 'bg-primary'
                            : 'bg-mutedText/40'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2 px-3.5 text-right font-mono">
                    <span className={row.score >= 50 ? 'font-semibold text-primaryText' : 'text-secondaryText'}>
                      {row.hasScore ? `${row.score}/100` : '—'}
                    </span>
                  </td>
                  <td className="py-2 pl-3.5 text-right">
                    <span className={`text-[10px] font-sans font-medium px-2 py-0.5 rounded ${row.severity.badgeClass}`}>
                      {row.severity.level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden border border-border rounded bg-surface ${className}`}>
      <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between bg-surface-elevated/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText font-sans">
            Detection Signals
          </span>
          <span className="text-[11px] text-mutedText font-sans">
            (Analytical Breakdown)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-mutedText font-sans">
          <Info className="w-3.5 h-3.5" />
          <span>Operational risk scores (0–100)</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-sans">
          <thead>
            <tr className="border-b border-border text-[11px] text-mutedText font-medium bg-surface-elevated/20">
              <th className="py-2 px-3.5 font-medium">Signal</th>
              <th className="py-2 px-3.5 font-medium w-36">Magnitude</th>
              <th className="py-2 px-3.5 font-medium text-right w-20">Score</th>
              <th className="py-2 px-3.5 font-medium text-right w-24">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row) => (
              <tr
                key={row.key}
                className={`transition-colors hover:bg-surface-hover/40 ${
                  row.isOverall ? 'bg-surface-elevated/30 font-medium' : ''
                }`}
              >
                <td className="py-2 px-3.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${row.isOverall ? 'font-semibold text-primaryText' : 'text-primaryText'}`}>
                      {row.label}
                    </span>
                    <span className="text-[10px] text-mutedText font-mono hidden sm:inline">
                      ({row.weight})
                    </span>
                  </div>
                </td>

                <td className="py-2 px-3.5">
                  <div className="w-full bg-surface-elevated h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        row.score >= 70
                          ? 'bg-danger'
                          : row.score >= 45
                          ? 'bg-warning'
                          : row.score >= 20
                          ? 'bg-primary'
                          : 'bg-border-hover'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, row.score))}%` }}
                    />
                  </div>
                </td>

                <td className="py-2 px-3.5 text-right font-mono font-medium">
                  <span className={row.hasScore && row.score > 0 ? 'text-primaryText' : 'text-mutedText'}>
                    {row.hasScore ? row.score : '—'}
                  </span>
                  <span className="text-[10px] text-mutedText ml-0.5">/100</span>
                </td>

                <td className="py-2 px-3.5 text-right">
                  {row.score === 0 ? (
                    <span className="text-[10px] font-sans text-mutedText font-medium">
                      Nominal
                    </span>
                  ) : (
                    <span className={`text-[10px] font-sans font-medium px-1.5 py-0.5 rounded ${row.severity.badgeClass}`}>
                      {row.severity.level}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
