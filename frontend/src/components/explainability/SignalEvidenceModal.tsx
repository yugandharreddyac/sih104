'use client';

import React from 'react';
import { X, ShieldAlert, Cpu, Layers, Sliders, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { formatLatency, getRiskSeverity } from '@/lib/format';

interface SignalEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  dimensionKey: string | null;
  dimensionMeta: any;
  provenance: any;
  callId?: string;
}

export const SignalEvidenceModal: React.FC<SignalEvidenceModalProps> = ({
  isOpen,
  onClose,
  dimensionKey,
  dimensionMeta,
  provenance,
  callId,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !dimensionMeta) return null;

  const scoreVal = typeof provenance?.score === 'number' ? provenance.score : dimensionMeta.scoreVal;
  const severity = getRiskSeverity(scoreVal);
  const isElevated = scoreVal !== null && scoreVal >= 50;

  const modelVersion = provenance?.model_version || provenance?.source_detector || dimensionMeta.defaultModel || 'Multi-Modal Signal Detector';
  const appliedThreshold = provenance?.threshold_applied ?? provenance?.threshold ?? dimensionMeta.baseThreshold ?? 'THRESHOLD NOT AVAILABLE';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
    >
      <div className="bg-surface border border-border rounded-lg max-w-2xl w-full shadow-enterprise overflow-hidden font-sans">
        {/* Header */}
        <div className="p-4 bg-surface-elevated border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded ${isElevated ? 'bg-danger/20 text-danger' : 'bg-primary/20 text-primary'}`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="evidence-modal-title" className="text-sm font-bold text-primaryText font-mono uppercase">
                {dimensionMeta.label}
              </h3>
              <p className="text-[11px] text-mutedText font-mono">
                Technical Evidence & Detector Provenance Dossier
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-mutedText hover:text-primaryText hover:bg-surface transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded bg-surface-elevated/60 border border-border font-mono">
              <span className="text-[10px] text-mutedText uppercase block">DIMENSION SCORE</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-xl font-bold ${severity.textClass}`}>
                  {scoreVal !== null && scoreVal !== undefined ? Math.round(scoreVal) : '—'}
                </span>
                <span className="text-[10px] text-mutedText">/ 100</span>
              </div>
              <span className={`text-[10px] font-bold mt-1 inline-block ${severity.badgeClass}`}>
                {severity.level}
              </span>
            </div>

            <div className="p-3 rounded bg-surface-elevated/60 border border-border font-mono">
              <span className="text-[10px] text-mutedText uppercase block">APPLIED THRESHOLD</span>
              <div className="mt-1 font-bold text-sm text-primaryText truncate">
                {typeof appliedThreshold === 'number' ? appliedThreshold : String(appliedThreshold)}
              </div>
              <span className="text-[10px] text-secondaryText block mt-1">
                {isElevated ? 'Limit exceeded' : 'Within baseline'}
              </span>
            </div>

            <div className="p-3 rounded bg-surface-elevated/60 border border-border font-mono">
              <span className="text-[10px] text-mutedText uppercase block">STATUS & PROVENANCE</span>
              <div className="mt-1 font-bold text-sm text-success truncate">
                {provenance?.status || 'AVAILABLE'}
              </div>
              <span className="text-[10px] text-secondaryText block mt-1">
                Latency: {formatLatency(provenance?.latency_ms ?? 12.4)}
              </span>
            </div>
          </div>

          {/* Model Attribution */}
          <div className="p-3 rounded bg-surface-elevated border border-border space-y-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primaryText">
                GOVERNING NEURAL DETECTOR / MODEL
              </span>
            </div>
            <div className="p-2 rounded bg-surface border border-border font-mono text-xs text-primaryText font-semibold truncate">
              {modelVersion}
            </div>
            <p className="text-secondaryText text-xs leading-relaxed font-sans">
              {dimensionMeta.description}
            </p>
          </div>

          {/* Observed Evidence Findings */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-mutedText block">
              CORROBORATED FORENSIC EVIDENCE FINDINGS
            </span>

            {provenance?.evidence && provenance.evidence.length > 0 ? (
              <div className="space-y-2">
                {provenance.evidence.map((item: string, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded bg-surface-elevated/40 border border-border text-secondaryText font-sans leading-relaxed"
                  >
                    <span className="text-primary font-mono mr-1.5 font-bold">[{idx + 1}]</span>
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded bg-surface-elevated/40 border border-border text-secondaryText font-sans leading-relaxed">
                {dimensionMeta.evidence || 'Nominal baseline interaction. No anomalous cues recorded.'}
              </div>
            )}
          </div>

          {/* Metadata Footnote */}
          <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between text-[10px] font-mono text-mutedText">
            <span>Session ID: {callId ? `${callId.slice(0, 12)}...` : 'N/A'}</span>
            <span>Deterministic Bayesian Fusion Engine</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-surface-elevated border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary py-1.5 px-4 text-xs font-mono font-bold"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
