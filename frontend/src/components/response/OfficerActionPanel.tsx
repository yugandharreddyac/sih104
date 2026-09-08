'use client';

import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Ban,
  CheckCircle2,
  FileSearch,
  XCircle,
  Lock,
  AlertTriangle,
  Send,
  HelpCircle,
} from 'lucide-react';
import { ResponseActionType } from './ActionConfirmationModal';
export { type ResponseActionType } from './ActionConfirmationModal';

interface OfficerActionPanelProps {
  incidentId: string;
  incidentNumber: string;
  callId?: string;
  status: 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'FALSE_POSITIVE';
  severity: string;
  policyId?: string;
  governingPolicy?: string;
  recommendedAction?: string;
  attackClassification?: string;
  actionsTaken?: string[];
  onRequestAction?: (actionType: ResponseActionType) => void;
  onInitiateAction?: (actionType: ResponseActionType) => void;
  isLoading?: boolean;
  actionLoading?: boolean;
  activeIntervention?: {
    id: string;
    actionType: string;
    status: string;
    level: string;
  } | null;
  onDecideIntervention?: (decision: 'APPROVED' | 'REJECTED' | 'OVERRIDDEN') => void;
  onInterventionDecision?: (decision: 'APPROVED' | 'REJECTED' | 'OVERRIDDEN') => void;
}

export const OfficerActionPanel: React.FC<OfficerActionPanelProps> = ({
  incidentId,
  incidentNumber,
  callId,
  status,
  severity,
  policyId,
  governingPolicy,
  recommendedAction,
  attackClassification,
  actionsTaken,
  onRequestAction,
  onInitiateAction,
  isLoading = false,
  actionLoading = false,
  activeIntervention,
  onDecideIntervention,
  onInterventionDecision,
}) => {
  const triggerAction = onInitiateAction || onRequestAction || (() => {});
  const decideIntervention = onInterventionDecision || onDecideIntervention || (() => {});
  const effectiveLoading = actionLoading || isLoading;
  const effectivePolicy = governingPolicy || policyId || 'POL-CRED-001';

  const isResolved = status === 'RESOLVED' || status === 'FALSE_POSITIVE';
  const isContained = status === 'CONTAINED';
  const isInvestigating = status === 'INVESTIGATING';

  return (
    <section aria-label="Officer Response Workflow Controls" className="panel-enterprise p-4 md:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary shrink-0" />
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primaryText font-mono">
              OFFICER INCIDENT RESPONSE WORKSPACE
            </h2>
            <p className="text-[11px] text-mutedText font-sans">
              Authorized security countermeasures, out-of-band verification, and incident containment
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-elevated border border-border text-secondaryText self-start sm:self-center">
          OFFICER CONTROLS ACTIVE
        </span>
      </div>

      {/* Decision Context Triad: Status, AI Recommendation, Officer Execution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Box 1: Current Status */}
        <div className="p-3 rounded bg-surface-elevated/70 border border-border space-y-1.5 font-mono">
          <span className="text-[10px] uppercase font-bold text-mutedText block">
            1. CURRENT INCIDENT STATUS
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                status === 'CONTAINED'
                  ? 'badge-danger'
                  : status === 'RESOLVED'
                  ? 'badge-success'
                  : status === 'INVESTIGATING'
                  ? 'badge-primary'
                  : status === 'FALSE_POSITIVE'
                  ? 'badge-neutral'
                  : 'badge-warning'
              }`}
            >
              {status.replace(/_/g, ' ')}
            </span>
          </div>
          <span className="text-[10px] text-mutedText block">
            Case ID: <strong className="text-primaryText">{incidentNumber}</strong>
          </span>
        </div>

        {/* Box 2: AI / Policy Recommendation */}
        <div className="p-3 rounded bg-surface-elevated/70 border border-border space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-mutedText block">
              2. AI / POLICY RECOMMENDATION
            </span>
            <span
              title="Automated policy recommendation based on observed threat pattern. Requires officer confirmation."
              className="text-mutedText hover:text-primary cursor-help"
            >
              <HelpCircle className="w-3 h-3" />
            </span>
          </div>
          <span className="text-xs font-bold text-danger block truncate">
            {recommendedAction || 'REQUIRE_STEP_UP_VERIFICATION'}
          </span>
          <span className="text-[10px] text-mutedText block truncate">
            Governing: <strong className="text-secondaryText">{policyId || 'POL-CRED-001'}</strong>
          </span>
        </div>

        {/* Box 3: Officer Execution State */}
        <div className="p-3 rounded bg-surface-elevated/70 border border-border space-y-1.5 font-mono">
          <span className="text-[10px] uppercase font-bold text-mutedText block">
            3. OFFICER RESPONSE STATUS
          </span>
          <span
            className={`text-xs font-bold block ${
              isResolved ? 'text-success' : isContained ? 'text-danger' : 'text-warning'
            }`}
          >
            {isResolved
              ? 'ACTION COMPLETED / CLOSED'
              : isContained
              ? 'CONTAINMENT ENFORCED'
              : isInvestigating
              ? 'ACTIVE INVESTIGATION'
              : 'AWAITING OFFICER DECISION'}
          </span>
          <span className="text-[10px] text-mutedText block">
            Human-in-the-loop authorization required
          </span>
        </div>
      </div>

      {/* Intervention Decision Banner (if active intervention awaiting decision) */}
      {activeIntervention && activeIntervention.status === 'AWAITING_HUMAN' && (
        <div className="p-3 rounded bg-warning/10 border border-warning/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn text-xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-warning font-mono font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>INTERVENTION AWAITING HUMAN DECISION</span>
            </div>
            <p className="text-secondaryText font-sans">
              Action <strong className="text-primaryText font-mono">{activeIntervention.actionType}</strong> recommended under Level <strong className="font-mono">{activeIntervention.level}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-1.5 font-mono self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => decideIntervention('APPROVED')}
              disabled={effectiveLoading}
              className="btn-success py-1 px-2.5 text-xs flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Approve</span>
            </button>
            <button
              type="button"
              onClick={() => decideIntervention('REJECTED')}
              disabled={effectiveLoading}
              className="btn-danger py-1 px-2.5 text-xs flex items-center gap-1"
            >
              <XCircle className="w-3 h-3" />
              <span>Reject</span>
            </button>
          </div>
        </div>
      )}

      {/* Primary Action Button Bar */}
      <div className="space-y-2 pt-1">
        <span className="text-[10px] font-mono uppercase font-bold text-mutedText block">
          OFFICER COUNTERMEASURE CONTROLS:
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Step-Up Verification */}
          <button
            type="button"
            onClick={() => triggerAction('TRIGGER_VERIFICATION')}
            disabled={effectiveLoading || isResolved}
            className="btn-primary py-2 px-3.5 flex items-center gap-1.5 text-xs font-mono font-bold disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Step-Up Verification</span>
          </button>

          {/* 2. Contain Call / Incident */}
          {!isContained && !isResolved && (
            <button
              type="button"
              onClick={() => triggerAction('CONTAINED')}
              disabled={effectiveLoading}
              className="btn-danger py-2 px-3.5 flex items-center gap-1.5 text-xs font-mono font-bold disabled:opacity-50"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Contain Call</span>
            </button>
          )}

          {/* 3. Set Investigating / Acknowledge */}
          {!isInvestigating && !isResolved && (
            <button
              type="button"
              onClick={() => triggerAction('INVESTIGATING')}
              disabled={effectiveLoading}
              className="btn-secondary py-2 px-3.5 flex items-center gap-1.5 text-xs font-mono font-bold disabled:opacity-50"
            >
              <FileSearch className="w-3.5 h-3.5 text-primary" />
              <span>Acknowledge & Investigate</span>
            </button>
          )}

          {/* 4. Mark Resolved */}
          {status !== 'RESOLVED' && (
            <button
              type="button"
              onClick={() => triggerAction('RESOLVED')}
              disabled={effectiveLoading}
              className="btn-success py-2 px-3.5 flex items-center gap-1.5 text-xs font-mono font-bold disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark Resolved</span>
            </button>
          )}

          {/* 5. False Positive */}
          {status !== 'FALSE_POSITIVE' && (
            <button
              type="button"
              onClick={() => triggerAction('FALSE_POSITIVE')}
              disabled={effectiveLoading}
              className="btn-outline py-2 px-3 text-xs font-mono disabled:opacity-50 text-mutedText hover:text-primaryText"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>False Positive</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
