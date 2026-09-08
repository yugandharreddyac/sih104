'use client';

import React from 'react';
import { Lock, ShieldAlert, CheckCircle2, ArrowRight } from 'lucide-react';

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
      className={`p-4 rounded border bg-surface ${
        isContainOrBlock
          ? 'border-red-500/40'
          : isStepUp
          ? 'border-blue-500/40'
          : 'border-border'
      } space-y-3.5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded shrink-0 ${
              isContainOrBlock
                ? 'bg-red-500/10 text-red-400'
                : isStepUp
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-green-500/10 text-green-400'
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
            <span className="text-[11px] text-mutedText font-sans block">
              Recommended Security Response
            </span>
            <h4 className="text-sm font-semibold text-primaryText font-sans mt-0.5">{actionTitle}</h4>
            <p className="text-xs text-secondaryText mt-1 font-sans leading-relaxed">{reason}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {onPrimaryAction && (
          <button
            onClick={onPrimaryAction}
            disabled={primaryActionLoading}
            className={isContainOrBlock ? 'btn-danger' : 'btn-primary'}
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
            className="btn-secondary"
          >
            {secondaryActionLabel}
          </button>
        )}

        {onDangerAction && dangerActionLabel && (
          <button
            onClick={onDangerAction}
            className="btn-danger ml-auto"
          >
            {dangerActionLabel}
          </button>
        )}
      </div>
    </div>
  );
};
