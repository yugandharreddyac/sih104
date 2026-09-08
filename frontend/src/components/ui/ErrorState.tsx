'use client';

import React, { useState } from 'react';
import { AlertCircle, RefreshCw, HelpCircle, ArrowRight } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  remediation?: string;
  onRetry?: () => void;
  technicalDetails?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Service Operation Failed',
  message,
  remediation = 'Verify telemetry gateway connectivity or re-authenticate session.',
  onRetry,
  technicalDetails,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      role="alert"
      className={`p-4 rounded bg-surface border border-red-500/30 text-primaryText space-y-3 font-sans ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-1.5 rounded bg-red-500/10 text-danger mt-0.5 shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-danger">{title}</h4>
            <p className="text-xs text-secondaryText mt-0.5 leading-relaxed">{message}</p>
            {remediation && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-mutedText">
                <ArrowRight className="w-3 h-3 text-primary shrink-0" />
                <span><strong>Recommended Action:</strong> {remediation}</span>
              </div>
            )}
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn-secondary text-xs shrink-0"
            aria-label="Retry failed request"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        )}
      </div>

      {technicalDetails && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-[11px] text-mutedText hover:text-primaryText font-sans flex items-center gap-1.5 transition-colors focus-visible:outline-none"
            aria-expanded={showDetails}
          >
            <HelpCircle className="w-3 h-3" />
            <span>{showDetails ? 'Hide Diagnostics' : 'View Technical Diagnostics'}</span>
          </button>
          {showDetails && (
            <pre className="mt-2 p-2.5 rounded bg-surface-elevated border border-border text-[11px] font-mono text-secondaryText overflow-x-auto whitespace-pre-wrap">
              {technicalDetails}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
