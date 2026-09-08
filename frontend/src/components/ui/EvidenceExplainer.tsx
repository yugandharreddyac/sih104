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
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden transition-all">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <FileSearch className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-white font-sans uppercase tracking-wider block">
              Forensic Evidence & Decision Explainability
            </span>
            <span className="text-[11px] text-slate-400 font-sans">
              Why did VOXSHIELD flag this voice session?
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-indigo-400">
          <span>{expanded ? 'COLLAPSE' : 'INSPECT'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/70 space-y-4 text-xs font-sans">
          {!hasContent ? (
            <div className="p-4 text-center text-slate-500 font-mono text-xs">
              Evidence unavailable. Monitoring real-time telemetry stream for actionable events.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* WHAT */}
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold block flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>WHAT WAS DETECTED</span>
                </span>
                <p className="text-slate-200 font-medium">
                  {what || 'Elevated multi-modal voice security anomaly detected during active dialogue.'}
                </p>
                {policyRule && (
                  <p className="text-[11px] font-mono text-indigo-300 mt-1">
                    Governing Policy Rule: <strong className="text-white">{policyRule}</strong>
                  </p>
                )}
              </div>

              {/* WHY */}
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  <span>WHY IT WAS FLAGGED</span>
                </span>
                <p className="text-slate-200">
                  {why || 'Conversational analysis and acoustic telemetry crossed deterministic risk thresholds.'}
                </p>
              </div>

              {/* EVIDENCE */}
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1 md:col-span-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold block flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>RECORDED FORENSIC EVIDENCE (PRIVACY SCRUBBED)</span>
                </span>

                {Array.isArray(evidence) ? (
                  <ul className="space-y-1 mt-1 text-slate-300 font-mono text-[11px]">
                    {evidence.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : evidence ? (
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-cyan-300 mt-1">
                    "{evidence}"
                  </div>
                ) : (
                  <p className="text-slate-400 font-mono text-[11px]">
                    Continuous acoustic analysis, synthetic voice indicators, and conversational intent tokens.
                  </p>
                )}

                {primaryDrivers.length > 0 && (
                  <div className="pt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">Primary Drivers:</span>
                    {primaryDrivers.map((driver, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700"
                      >
                        {driver}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ACTION */}
              {action && (
                <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 space-y-1 md:col-span-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-300 font-bold block flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>RECOMMENDED OPERATIONAL RESPONSE</span>
                  </span>
                  <p className="text-slate-100 font-medium">
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
