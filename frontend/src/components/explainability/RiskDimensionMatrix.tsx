'use client';

import React, { useState, useMemo } from 'react';
import {
  Activity,
  Filter,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  ExternalLink,
  ChevronRight,
  Sliders,
} from 'lucide-react';
import { getRiskSeverity } from '@/lib/format';

export interface DimensionConfig {
  key: string;
  label: string;
  category: 'Acoustic' | 'Biometric' | 'Semantic' | 'Contextual';
  defaultModel: string;
  fusionWeight: string;
  baseThreshold?: number | string;
  description: string;
}

export const DIMENSIONS_CONFIG: DimensionConfig[] = [
  {
    key: 'credential_theft',
    label: 'Credential Theft',
    category: 'Semantic',
    defaultModel: 'SensitiveDataDetector v4',
    fusionWeight: 'High (0.28)',
    baseThreshold: 'Rule-Based Pattern Match',
    description: 'Solicitation of MFA codes, OTPs, PINs, or confidential password credentials',
  },
  {
    key: 'financial_fraud',
    label: 'Financial Fraud',
    category: 'Semantic',
    defaultModel: 'RequestedActionExtractor v4',
    fusionWeight: 'High (0.25)',
    baseThreshold: 'Transaction Policy Trigger',
    description: 'Unauthorized wire transfers, beneficiary alteration, or high-value funds diversion',
  },
  {
    key: 'identity_impersonation',
    label: 'Identity Impersonation',
    category: 'Biometric',
    defaultModel: 'SpeakerVerifier (ECAPA-TDNN)',
    fusionWeight: 'High (0.20)',
    baseThreshold: 0.72,
    description: 'Speaker voiceprint contradicts enrolled biometric profile (Cosine similarity < threshold)',
  },
  {
    key: 'deepfake_synthetic',
    label: 'Synthetic Voice / Deepfake',
    category: 'Acoustic',
    defaultModel: 'Robust MiniAcousticCNN + AASIST',
    fusionWeight: 'High (0.20)',
    baseThreshold: 0.525,
    description: 'Synthetic vocoder artifacts, unnatural spectral consistency, or neural acoustic spoofing',
  },
  {
    key: 'account_takeover',
    label: 'Account Takeover',
    category: 'Semantic',
    defaultModel: 'ActionExtractor v4',
    fusionWeight: 'Medium (0.15)',
    baseThreshold: 'Adversarial Action Rule',
    description: 'Requests for remote desktop software installation (AnyDesk, TeamViewer) or privilege change',
  },
  {
    key: 'verification_bypass',
    label: 'Verification Bypass',
    category: 'Semantic',
    defaultModel: 'SocialEngineeringDetector v4',
    fusionWeight: 'Medium (0.15)',
    baseThreshold: 'Manipulation Classifier',
    description: 'Coercive tactics or pressure exerted on operator to bypass mandatory secondary verification',
  },
  {
    key: 'social_engineering',
    label: 'Social Engineering',
    category: 'Semantic',
    defaultModel: 'SocialEng Multi-Turn v4',
    fusionWeight: 'Medium (0.12)',
    baseThreshold: 'Urgency / Coercion Index',
    description: 'Psychological manipulation, false urgency, or artificial authority cues in dialogue',
  },
  {
    key: 'replay_injection',
    label: 'Replay / Loudspeaker',
    category: 'Acoustic',
    defaultModel: 'ReplaySpectralDecay v3',
    fusionWeight: 'Low (0.10)',
    baseThreshold: 'Impulse Decay Analysis',
    description: 'Physical loudspeaker frequency roll-off and secondary room reverberation acoustics',
  },
  {
    key: 'inconsistency',
    label: 'Dialogue Inconsistency',
    category: 'Contextual',
    defaultModel: 'InconsistencyVerifier v4',
    fusionWeight: 'Low (0.08)',
    baseThreshold: 'Claim Contradiction Graph',
    description: 'Contradictory caller identities, claims, or factual assertions across dialogue turns',
  },
  {
    key: 'channel_anomaly',
    label: 'Channel Anomaly',
    category: 'Acoustic',
    defaultModel: 'ChannelArtifactClassifier v2',
    fusionWeight: 'Low (0.07)',
    baseThreshold: 'Bandwidth Artifact Rate',
    description: 'Unusual PSTN / VoIP codec transcoding artifacts or atypical spectral cutoff',
  },
];

interface RiskDimensionMatrixProps {
  dimensions: Record<string, number | null>;
  dimensionProvenance: Record<string, any>;
  onSelectDimension?: (dimKey: string, meta: DimensionConfig, prov: any) => void;
}

export const RiskDimensionMatrix: React.FC<RiskDimensionMatrixProps> = ({
  dimensions,
  dimensionProvenance,
  onSelectDimension,
}) => {
  const [filterMode, setFilterMode] = useState<'ALL' | 'ACTIVE' | 'NOMINAL'>('ALL');

  const processedRows = useMemo(() => {
    return DIMENSIONS_CONFIG.map((cfg) => {
      const prov = dimensionProvenance[cfg.key];
      const rawScore =
        typeof prov?.score === 'number'
          ? prov.score
          : typeof dimensions[cfg.key] === 'number'
          ? (dimensions[cfg.key] as number)
          : null;

      const hasScore = rawScore !== null && Number.isFinite(rawScore);
      const scoreVal = hasScore ? Math.round(rawScore > 1 ? rawScore : rawScore * 100) : null;
      const severity = getRiskSeverity(scoreVal);
      const isElevated = scoreVal !== null && scoreVal >= 30;
      const isCritical = scoreVal !== null && scoreVal >= 70;

      const modelName = prov?.model_version || prov?.source_detector || cfg.defaultModel;
      const evidence = prov?.evidence?.[0] || cfg.description;
      const status = prov?.status || (hasScore ? 'AVAILABLE' : 'NOT_EVALUATED');

      // Actual threshold handling: display real applied threshold if provided by detector, else config/not available
      const appliedThreshold = prov?.threshold_applied ?? prov?.threshold ?? cfg.baseThreshold;

      return {
        ...cfg,
        scoreVal,
        hasScore,
        severity,
        isElevated,
        isCritical,
        modelName,
        evidence,
        status,
        appliedThreshold,
        prov,
      };
    });
  }, [dimensions, dimensionProvenance]);

  const filteredRows = useMemo(() => {
    if (filterMode === 'ACTIVE') {
      return processedRows.filter((r) => r.isElevated);
    }
    if (filterMode === 'NOMINAL') {
      return processedRows.filter((r) => !r.isElevated);
    }
    return processedRows;
  }, [processedRows, filterMode]);

  const activeCount = processedRows.filter((r) => r.isElevated).length;
  const nominalCount = processedRows.filter((r) => !r.isElevated).length;

  return (
    <section aria-label="10D Risk Dimension Matrix" className="panel-enterprise overflow-hidden">
      {/* Header with Filter Controls */}
      <div className="p-3 sm:p-4 bg-surface-elevated/70 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary shrink-0" />
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primaryText font-mono">
              10-DIMENSIONAL RISK MATRIX & DETECTOR DECOMPOSITION
            </h2>
            <p className="text-[11px] text-mutedText font-sans">
              Factor contribution, neural model provenance, observed evidence, and threshold exceedance
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 self-start sm:self-center font-mono text-xs">
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            className={`px-2.5 py-1 rounded border transition-colors ${
              filterMode === 'ALL'
                ? 'bg-primary text-white border-primary font-bold'
                : 'bg-surface border-border text-secondaryText hover:text-primaryText'
            }`}
          >
            ALL (10)
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('ACTIVE')}
            className={`px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
              filterMode === 'ACTIVE'
                ? 'bg-danger/20 text-danger border-danger font-bold'
                : 'bg-surface border-border text-secondaryText hover:text-primaryText'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-danger" />
            <span>ACTIVE ({activeCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('NOMINAL')}
            className={`px-2.5 py-1 rounded border transition-colors ${
              filterMode === 'NOMINAL'
                ? 'bg-success/20 text-success border-success font-bold'
                : 'bg-surface border-border text-secondaryText hover:text-primaryText'
            }`}
          >
            NOMINAL ({nominalCount})
          </button>
        </div>
      </div>

      {/* Table Structure */}
      <div className="p-2 sm:p-4 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-border text-[10px] font-mono text-mutedText uppercase tracking-wider">
              <th className="pb-2 px-2 font-semibold">Risk Dimension</th>
              <th className="pb-2 px-2 font-semibold">Detector Model</th>
              <th className="pb-2 px-2 font-semibold">Observed Evidence / Finding</th>
              <th className="pb-2 px-2 font-semibold">Applied Threshold</th>
              <th className="pb-2 px-2 font-semibold text-right">Fusion Weight</th>
              <th className="pb-2 px-2 font-semibold text-right">Score / Level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 text-xs font-sans">
            {filteredRows.map((row) => (
              <tr
                key={row.key}
                onClick={() => onSelectDimension && onSelectDimension(row.key, row, row.prov)}
                className={`transition-colors cursor-pointer group ${
                  row.isCritical
                    ? 'bg-danger/10 hover:bg-danger/15'
                    : row.isElevated
                    ? 'bg-warning/5 hover:bg-warning/10'
                    : 'hover:bg-surface-elevated/40'
                }`}
              >
                {/* Dimension Name & Category */}
                <td className="py-2.5 px-2 min-w-[160px]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        row.isCritical ? 'bg-danger' : row.isElevated ? 'bg-warning' : 'bg-success'
                      }`}
                    />
                    <span className="font-mono font-bold text-primaryText group-hover:text-primary transition-colors">
                      {row.label}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-mutedText block pl-3">
                    Category: {row.category}
                  </span>
                </td>

                {/* Detector Model Provenance */}
                <td className="py-2.5 px-2 min-w-[150px]">
                  <span className="font-mono text-xs text-primaryText block truncate">
                    {row.modelName}
                  </span>
                  <span className="text-[10px] font-mono text-mutedText block">
                    Status: <strong className="text-secondaryText">{row.status}</strong>
                  </span>
                </td>

                {/* Evidence Cues */}
                <td className="py-2.5 px-2 min-w-[220px] max-w-[320px]">
                  <p className="text-xs text-secondaryText line-clamp-2 leading-relaxed">
                    {row.evidence}
                  </p>
                </td>

                {/* Applied Threshold */}
                <td className="py-2.5 px-2 min-w-[120px] font-mono text-xs">
                  {typeof row.appliedThreshold === 'number' ? (
                    <div className="space-y-0.5">
                      <span className="text-primaryText block">
                        Limit: {row.appliedThreshold}
                      </span>
                      <span
                        className={`text-[10px] block ${
                          row.isElevated ? 'text-danger font-bold' : 'text-mutedText'
                        }`}
                      >
                        {row.isElevated ? 'THRESHOLD EXCEEDED' : 'WITHIN BOUNDS'}
                      </span>
                    </div>
                  ) : row.appliedThreshold ? (
                    <span className="text-[11px] text-secondaryText block">
                      {row.appliedThreshold}
                    </span>
                  ) : (
                    <span className="text-[11px] text-mutedText block italic">
                      THRESHOLD NOT AVAILABLE
                    </span>
                  )}
                </td>

                {/* Fusion Weight */}
                <td className="py-2.5 px-2 text-right font-mono text-xs text-mutedText whitespace-nowrap">
                  {row.fusionWeight}
                </td>

                {/* Score & Severity Badge */}
                <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <span className={`font-extrabold text-xs ${row.severity.textClass}`}>
                      {row.hasScore ? row.scoreVal : '—'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        row.isCritical
                          ? 'badge-danger'
                          : row.isElevated
                          ? 'badge-warning'
                          : row.hasScore
                          ? 'badge-success'
                          : 'badge-neutral'
                      }`}
                    >
                      {row.severity.level}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
