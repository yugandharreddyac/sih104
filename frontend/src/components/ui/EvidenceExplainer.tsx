'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileSearch, CheckCircle2, ShieldAlert, Lock, Info } from 'lucide-react';

interface EvidenceExplainerProps {
  what?: string | null;
  why?: string | null;
  evidence?: string | string[] | null;
  action?: string | null;
  primaryDrivers?: string[];
  policyRule?: string | null;
}

export const EvidenceExplainer: React.FC<EvidenceExplainerProps> = ({
  what,
  why,
  evidence,
  action,
  primaryDrivers = [],
  policyRule,
}) => {
  const [expanded, setExpanded] = useState(false);

  // Auto-expand forensic panel when an active threat or policy rule is detected
  React.useEffect(() => {
    if (what || policyRule) {
      setExpanded(true);
    }
  }, [what, policyRule]);

  const hasContent = Boolean(what || why || evidence || primaryDrivers.length > 0 || policyRule);

  return (
    <div className="rounded border border-border bg-surface overflow-hidden transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-surface-elevated text-secondaryText border border-border">
            <FileSearch className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-semibold text-primaryText font-sans block">
              Forensic Evidence & Decision Explainability
            </span>
            <span className="text-xs text-mutedText font-sans">
              Why did VOXSHIELD flag this voice session?
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
          <span>{expanded ? 'Collapse' : 'Inspect'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="p-3.5 border-t border-border bg-surface-elevated/40 space-y-3 text-xs font-sans">
          {!hasContent ? (
            <div className="p-4 text-center text-mutedText text-xs font-sans">
              Evidence unavailable. Monitoring real-time telemetry stream for actionable events.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* WHAT */}
              <div className="p-3 rounded bg-surface border border-border space-y-1">
                <span className="text-[11px] text-danger font-medium block flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>What Was Detected</span>
                </span>
                <p className="text-primaryText font-normal">
                  {what || 'Elevated multi-modal voice security anomaly detected during active dialogue.'}
                </p>
                {policyRule && (
                  <p className="text-[11px] text-secondaryText mt-1">
                    Governing Policy Rule: <strong className="font-mono text-primaryText">{policyRule}</strong>
                  </p>
                )}
              </div>

              {/* WHY */}
              <div className="p-3 rounded bg-surface border border-border space-y-1">
                <span className="text-[11px] text-warning font-medium block flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  <span>Why It Was Flagged</span>
                </span>
                <p className="text-secondaryText font-normal">
                  {why || 'Conversational analysis and acoustic telemetry crossed deterministic risk thresholds.'}
                </p>
              </div>

              {/* EVIDENCE */}
              <div className="p-3 rounded bg-surface border border-border space-y-1 md:col-span-2">
                <span className="text-[11px] text-info font-medium block flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Recorded Forensic Evidence (Privacy Scrubbed)</span>
                </span>

                {Array.isArray(evidence) ? (
                  <ul className="space-y-1 mt-1 text-secondaryText text-xs">
                    {evidence.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-info shrink-0 mt-0.5" />
                        <span className="font-mono text-[11px]">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : evidence ? (
                  <div className="p-2 rounded bg-surface-elevated border border-border font-mono text-[11px] text-primaryText mt-1">
                    &ldquo;{evidence}&rdquo;
                  </div>
                ) : (
                  <p className="text-mutedText text-xs">
                    Continuous acoustic analysis, synthetic voice indicators, and conversational intent tokens.
                  </p>
                )}

                {primaryDrivers.length > 0 && (
                  <div className="pt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-mutedText">Primary Drivers:</span>
                    {primaryDrivers.map((driver, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-surface-elevated text-[11px] text-secondaryText border border-border font-sans"
                      >
                        {driver}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ACTION */}
              {action && (
                <div className="p-3 rounded bg-surface border border-border space-y-1 md:col-span-2">
                  <span className="text-[11px] text-success font-medium block flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    <span>Recommended Operational Response</span>
                  </span>
                  <p className="text-primaryText font-medium">
                    {action}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
