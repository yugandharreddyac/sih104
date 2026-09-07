'use client';

import React from 'react';
import { AlertCircle, RefreshCw, HelpCircle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  technicalDetails?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Service Unavailable',
  message,
  onRetry,
  technicalDetails,
  className = '',
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div
      className={`p-5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-slate-200 space-y-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 mt-0.5 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-rose-300 font-sans">{title}</h4>
            <p className="text-xs text-slate-300 font-sans mt-0.5 leading-relaxed">{message}</p>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs font-mono text-slate-200 flex items-center gap-1.5 transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>RETRY</span>
          </button>
        )}
      </div>

      {technicalDetails && (
        <div className="pt-2 border-t border-rose-500/20">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-[11px] font-mono text-rose-400 hover:text-rose-300 flex items-center gap-1"
          >
            <HelpCircle className="w-3 h-3" />
            <span>{showDetails ? 'Hide Diagnostics' : 'View Technical Diagnostics'}</span>
          </button>
          {showDetails && (
            <pre className="mt-2 p-2.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap">
              {technicalDetails}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
