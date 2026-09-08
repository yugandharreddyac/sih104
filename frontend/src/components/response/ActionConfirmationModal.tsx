'use client';

import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, Ban, XCircle, X, Shield, Lock, FileSearch } from 'lucide-react';

export type ResponseActionType =
  | 'INVESTIGATING'
  | 'CONTAINED'
  | 'RESOLVED'
  | 'FALSE_POSITIVE'
  | 'TRIGGER_VERIFICATION'
  | 'APPROVE_INTERVENTION'
  | 'REJECT_INTERVENTION'
  | 'OVERRIDE_INTERVENTION';

interface ActionConfirmationModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: (notes?: string) => Promise<void> | void;
  actionType: ResponseActionType | null;
  incidentNumber: string;
  severity?: string;
  incidentSeverity?: string;
  currentStatus?: string;
  riskScore?: number | null;
  policyId?: string;
  governingPolicy?: string;
  recommendedAction?: string;
  isSubmitting?: boolean;
  loading?: boolean;
}

const ACTION_METADATA: Record<ResponseActionType, {
  title: string;
  verb: string;
  icon: any;
  colorClass: string;
  btnClass: string;
  consequence: string;
  defaultNote: string;
}> = {
  INVESTIGATING: {
    title: 'Acknowledge & Investigate Incident',
    verb: 'Set Investigating',
    icon: FileSearch,
    colorClass: 'text-primary',
    btnClass: 'btn-primary',
    consequence: 'Transitions case to active investigation status and assigns the current authenticated analyst as primary investigator.',
    defaultNote: 'Incident acknowledged and triage investigation initiated by SOC analyst.',
  },
  CONTAINED: {
    title: 'Enforce Call & Session Containment',
    verb: 'Contain Incident',
    icon: Ban,
    colorClass: 'text-danger',
    btnClass: 'btn-danger',
    consequence: 'Restricts further voice interactions on this session, halts high-value transactions, and flags carrier gateway for call termination.',
    defaultNote: 'Immediate call containment enforced due to confirmed high-risk policy violation.',
  },
  RESOLVED: {
    title: 'Mark Incident Case Resolved',
    verb: 'Confirm Resolution',
    icon: CheckCircle2,
    colorClass: 'text-success',
    btnClass: 'btn-success',
    consequence: 'Closes active triage. The case becomes a historical audit record and remains immutable in forensics.',
    defaultNote: 'Incident case resolved. Verification confirmed and threat eliminated.',
  },
  FALSE_POSITIVE: {
    title: 'Mark Incident as False Positive',
    verb: 'Confirm False Positive',
    icon: XCircle,
    colorClass: 'text-mutedText',
    btnClass: 'btn-outline',
    consequence: 'Classifies the detection as benign caller behavior. Telemetry is routed to model calibration without disrupting the customer.',
    defaultNote: 'Classified as false positive after manual review of multi-modal evidence.',
  },
  TRIGGER_VERIFICATION: {
    title: 'Initiate Out-of-Band Step-Up Verification',
    verb: 'Dispatch Challenge',
    icon: Lock,
    colorClass: 'text-primary',
    btnClass: 'btn-primary',
    consequence: 'Pushes cryptographic push challenge to the enrolled customer identity via independent channel (Mobile App / IDP).',
    defaultNote: 'Secondary out-of-band verification requested for sensitive credential transaction.',
  },
  APPROVE_INTERVENTION: {
    title: 'Authorize AI-Recommended Policy Intervention',
    verb: 'Approve Countermeasure',
    icon: Shield,
    colorClass: 'text-primary',
    btnClass: 'btn-primary',
    consequence: 'Approves the policy countermeasure (e.g. BLOCK_DISCLOSURE / REQUIRE_STEP_UP) to be enforced immediately.',
    defaultNote: 'Analyst authorized automated policy countermeasure based on corroborated risk.',
  },
  REJECT_INTERVENTION: {
    title: 'Reject Recommended Policy Intervention',
    verb: 'Reject Action',
    icon: X,
    colorClass: 'text-danger',
    btnClass: 'btn-danger',
    consequence: 'Rejects enforcement of the countermeasure. Call continues under continuous passive monitoring.',
    defaultNote: 'Analyst rejected automated policy intervention after operator context check.',
  },
  OVERRIDE_INTERVENTION: {
    title: 'Override Policy Intervention Recommendation',
    verb: 'Apply Override',
    icon: AlertTriangle,
    colorClass: 'text-warning',
    btnClass: 'btn-warning',
    consequence: 'Overrides the original policy action with an analyst-specified countermeasure.',
    defaultNote: 'Analyst manual override applied with custom containment parameters.',
  },
};

export const ActionConfirmationModal: React.FC<ActionConfirmationModalProps> = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  actionType,
  incidentNumber,
  severity,
  incidentSeverity,
  currentStatus,
  riskScore,
  policyId,
  governingPolicy,
  recommendedAction,
  isSubmitting = false,
  loading = false,
}) => {
  const [notes, setNotes] = useState('');
  const effectiveSubmitting = isSubmitting || loading;
  const handleClose = onCancel || onClose || (() => {});

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !effectiveSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, effectiveSubmitting, handleClose]);

  if (!isOpen || !actionType) return null;

  const effectiveSeverity = incidentSeverity || severity || 'MEDIUM';
  const effectivePolicy = governingPolicy || policyId || 'POL-CRED-001';

  const meta = ACTION_METADATA[actionType] || {
    title: `Confirm Action: ${actionType}`,
    verb: 'Confirm Action',
    icon: ShieldAlert,
    colorClass: 'text-primary',
    btnClass: 'btn-primary',
    consequence: 'Executes the selected operational security response on this incident case.',
    defaultNote: `Officer performed action: ${actionType}`,
  };
  const Icon = meta.icon;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(notes.trim() || meta.defaultNote);
    setNotes('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
    >
      <div className="bg-surface border border-border rounded-lg max-w-lg w-full shadow-enterprise overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="p-4 bg-surface-elevated border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded bg-surface border border-border ${meta.colorClass}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 id="confirm-action-title" className="text-sm font-bold text-primaryText font-mono uppercase">
                {meta.title}
              </h3>
              <p className="text-[11px] text-mutedText font-mono">
                Security Officer Response Confirmation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={effectiveSubmitting}
            className="p-1 rounded text-mutedText hover:text-primaryText hover:bg-surface transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleConfirm} className="p-4 sm:p-5 space-y-4 text-xs font-sans">
          {/* Incident Dossier Box */}
          <div className="p-3 rounded bg-surface-elevated/70 border border-border space-y-2 font-mono">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-mutedText uppercase">Target Incident:</span>
              <strong className="text-primaryText font-bold">{incidentNumber}</strong>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-mutedText uppercase">Incident Severity:</span>
              <span className={`font-bold ${severity === 'CRITICAL' ? 'text-danger' : severity === 'HIGH' ? 'text-warning' : 'text-primary'}`}>
                {severity} {riskScore !== null && riskScore !== undefined ? `(${Math.round(riskScore)}/100)` : ''}
              </span>
            </div>

            {policyId && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-mutedText uppercase">Governing Policy:</span>
                <span className="text-primaryText">{policyId}</span>
              </div>
            )}

            {recommendedAction && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-mutedText uppercase">AI Recommendation:</span>
                <span className="text-danger font-bold truncate max-w-[200px]">{recommendedAction}</span>
              </div>
            )}
          </div>

          {/* Action Consequence Description */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase font-bold text-mutedText block">
              OPERATIONAL IMPACT & CONSEQUENCE:
            </span>
            <p className="text-secondaryText leading-relaxed bg-surface-elevated/30 p-2.5 rounded border border-border/60">
              {meta.consequence}
            </p>
          </div>

          {/* Officer Justification / Audit Notes */}
          <div className="space-y-1.5">
            <label htmlFor="officer-notes" className="text-[10px] font-mono uppercase font-bold text-mutedText block">
              OFFICER AUDIT JUSTIFICATION & NOTES:
            </label>
            <textarea
              id="officer-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={meta.defaultNote}
              className="input-enterprise w-full p-2.5 text-xs font-sans rounded bg-surface border-border text-primaryText"
            />
            <span className="text-[10px] text-mutedText font-mono block">
              Notes are cryptographically attached to this incident event in the security audit trail.
            </span>
          </div>

          {/* Actions Footer */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2 font-mono">
            <button
              type="button"
              onClick={handleClose}
              disabled={effectiveSubmitting}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={effectiveSubmitting}
              className={`${meta.btnClass} py-1.5 px-4 text-xs font-bold flex items-center gap-1.5`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{effectiveSubmitting ? 'Executing Response...' : meta.verb}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
