'use client';

import React from 'react';
import { Lock, ShieldAlert, CheckCircle2, XCircle, ArrowRight, Eye } from 'lucide-react';

interface RecommendedActionProps {
  actionTitle: string;
  actionType: 'STEP_UP_VERIFICATION' | 'CONTAIN' | 'BLOCK' | 'MONITOR' | 'RESOLVE' | 'CUSTOM' | string;
  reason: string;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  primaryActionLoading?: boolean;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  onDangerAction?: () => void;
  dangerActionLabel?: string;
  className?: string;
}

export const RecommendedAction: React.FC<RecommendedActionProps> = ({
  actionTitle,
  actionType,
  reason,
  onPrimaryAction,
  primaryActionLabel = 'Execute Response',
  primaryActionLoading = false,
  onSecondaryAction,
  secondaryActionLabel,
  onDangerAction,
  dangerActionLabel,
  className = '',
}) => {
  const isStepUp = actionType.includes('STEP_UP') || actionType.includes('VERIF');
  const isContainOrBlock = actionType.includes('CONTAIN') || actionType.includes('BLOCK');

  return (
    <div
      className={`p-5 rounded-xl border bg-[#0c1222] ${
        isContainOrBlock
          ? 'border-rose-500/30'
          : isStepUp
          ? 'border-indigo-500/30'
          : 'border-slate-800'
      } space-y-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-lg shrink-0 ${
              isContainOrBlock
                ? 'bg-rose-500/10 text-rose-400'
                : isStepUp
                ? 'bg-indigo-500/10 text-indigo-400'
                : 'bg-cyan-500/10 text-cyan-400'
            }`}
          >
            {isContainOrBlock ? (
              <ShieldAlert className="w-5 h-5" />
            ) : isStepUp ? (
              <Lock className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
              Recommended Security Response
            </span>
            <h4 className="text-sm font-bold text-white font-sans mt-0.5">{actionTitle}</h4>
            <p className="text-xs text-slate-300 mt-1 font-sans leading-relaxed">{reason}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {onPrimaryAction && (
          <button
            onClick={onPrimaryAction}
            disabled={primaryActionLoading}
            className={`px-4 py-2 rounded-lg text-xs font-semibold font-sans flex items-center gap-2 transition-all shadow-md ${
              isContainOrBlock
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
            }`}
          >
            {primaryActionLoading ? (
              <span>Executing...</span>
            ) : (
              <>
                <span>{primaryActionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}

        {onSecondaryAction && secondaryActionLabel && (
          <button
            onClick={onSecondaryAction}
            className="px-3.5 py-2 rounded-lg text-xs font-medium font-sans text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition-colors"
          >
            {secondaryActionLabel}
          </button>
        )}

        {onDangerAction && dangerActionLabel && (
          <button
            onClick={onDangerAction}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold font-sans text-rose-300 hover:text-rose-200 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-500/30 transition-colors ml-auto"
          >
            {dangerActionLabel}
          </button>
        )}
      </div>
    </div>
  );
};
