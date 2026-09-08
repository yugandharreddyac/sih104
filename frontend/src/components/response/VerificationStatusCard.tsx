'use client';

import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, AlertTriangle, CheckCircle2, Clock, XCircle, Send, RefreshCw } from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { formatSafeTime, formatSafeDateTime } from '@/lib/format';

interface VerificationStatusCardProps {
  callId?: string;
  verification?: any;
  onTriggerVerification?: () => void;
  onResolve?: (verificationId: string, status: 'APPROVED' | 'REJECTED' | 'CANCELLED', notes?: string) => Promise<void> | void;
  isActionLoading?: boolean;
  loading?: boolean;
}

export const VerificationStatusCard: React.FC<VerificationStatusCardProps> = ({
  callId,
  verification,
  onTriggerVerification,
  onResolve,
  isActionLoading = false,
  loading: externalLoading = false,
}) => {
  const [verificationRequests, setVerificationRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchVerifications = async () => {
    if (!callId) return;
    setLoading(true);
    try {
      const res = await ApiClient.get('/verification');
      if (res.success && Array.isArray(res.data)) {
        // Filter requests related to this callId
        const matching = res.data.filter((r: any) => r.callId === callId);
        setVerificationRequests(matching);
      }
    } catch {
      setVerificationRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!verification) {
      fetchVerifications();
    }
  }, [callId, verification]);

  const latestRequest = verification || verificationRequests[0];
  const isBusy = loading || isActionLoading || externalLoading || resolvingId !== null;

  const handleResolve = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setResolvingId(id);
    try {
      if (onResolve) {
        await onResolve(id, status);
      } else {
        const res = await ApiClient.patch(`/verification/${id}/resolve`, {
          status,
          notes: `Out-of-band verification ${status.toLowerCase()} by SOC analyst from Incident Response console`,
        });
        if (res.success) {
          fetchVerifications();
        }
      }
    } catch {
      // Handled
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="panel-enterprise p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
            OUT-OF-BAND STEP-UP IDENTITY VERIFICATION
          </h3>
        </div>

        <button
          type="button"
          onClick={fetchVerifications}
          disabled={loading}
          className="text-mutedText hover:text-primary transition-colors p-1"
          aria-label="Refresh verification status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
        </button>
      </div>

      {latestRequest ? (
        <div className="space-y-3">
          <div className="p-3 rounded bg-surface-elevated/70 border border-border space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-mutedText text-[10px] uppercase">STATUS:</span>
              <span
                className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                  latestRequest.status === 'APPROVED'
                    ? 'badge-success'
                    : latestRequest.status === 'REJECTED'
                    ? 'badge-danger'
                    : 'badge-warning animate-pulse'
                }`}
              >
                {latestRequest.status}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-mutedText text-[10px] uppercase">CHALLENGE MECHANISM:</span>
              <span className="text-primaryText font-semibold">
                {latestRequest.mechanism || 'AUTHENTICATOR_PUSH'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-mutedText text-[10px] uppercase">TARGET IDENTITY:</span>
              <span className="text-secondaryText">
                {latestRequest.targetIdentityMasked || 'cfo***al@corp.internal'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40">
              <span className="text-mutedText">REQUESTED:</span>
              <span className="text-secondaryText">
                {formatSafeDateTime(latestRequest.requestedAt)}
              </span>
            </div>
          </div>

          {/* Quick confirmation controls if verification is pending */}
          {latestRequest.status === 'PENDING' && (
            <div className="flex items-center justify-end gap-2 pt-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => handleResolve(latestRequest.id, 'REJECTED')}
                disabled={resolvingId === latestRequest.id}
                className="btn-danger py-1 px-2.5 text-xs flex items-center gap-1"
              >
                <XCircle className="w-3 h-3" />
                <span>Fail Verification</span>
              </button>
              <button
                type="button"
                onClick={() => handleResolve(latestRequest.id, 'APPROVED')}
                disabled={resolvingId === latestRequest.id}
                className="btn-success py-1 px-2.5 text-xs flex items-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Confirm Verified</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 rounded bg-surface-elevated/40 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="text-[11px] font-mono text-mutedText block">
              NO VERIFICATION CHALLENGE DISPATCHED
            </span>
            <p className="text-secondaryText font-sans">
              Caller identity can be verified out-of-band via corporate IdP or push notification.
            </p>
          </div>

          <button
            type="button"
            onClick={onTriggerVerification}
            disabled={isActionLoading || !callId}
            className="btn-primary py-1 px-3 text-xs font-mono font-bold flex items-center gap-1.5 shrink-0"
          >
            <Send className="w-3 h-3" />
            <span>Dispatch Step-Up</span>
          </button>
        </div>
      )}
    </div>
  );
};
