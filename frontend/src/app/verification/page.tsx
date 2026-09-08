'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Lock,
  CheckCircle2,
  XCircle,
  Send,
  Clock,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { formatSafeTime, formatSafeDateTime } from '@/lib/format';

export default function VerificationPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mechanism, setMechanism] = useState('AUTHENTICATOR_PUSH');
  const [targetIdentity, setTargetIdentity] = useState('cfo-approvals@corp.internal');
  const [callId, setCallId] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchVerifications = useCallback(async () => {
    setLoading(true);
    const [verRes, callsRes] = await Promise.all([
      ApiClient.get('/verification'),
      ApiClient.get('/calls'),
    ]);
    setLoading(false);

    if (verRes.success && verRes.data) {
      setRequests(verRes.data);
    }
    if (callsRes.success && callsRes.data && callsRes.data.length > 0) {
      setCalls(callsRes.data);
      if (!callId) {
        setCallId(callsRes.data[0].id);
      }
    }
  }, [callId]);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callId) {
      setFeedbackMsg({ type: 'error', text: 'Please select an active target call session.' });
      return;
    }
    setSubmitting(true);
    setFeedbackMsg(null);
    const res = await ApiClient.post('/verification', {
      callId,
      mechanism,
      targetIdentity,
      payload: { channel: 'IDP_CHALLENGE' },
    });
    setSubmitting(false);

    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text: 'Out-of-band step-up verification challenge dispatched to identity provider.',
      });
      fetchVerifications();
    } else {
      setFeedbackMsg({
        type: 'error',
        text: res.message || res.error || 'Failed to dispatch verification challenge.',
      });
    }
  };

  const handleResolve = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const res = await ApiClient.patch(`/verification/${id}/resolve`, {
      status,
      notes: `Resolution confirmed by SOC Analyst via verification console`,
    });
    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text: `Verification marked as ${status === 'APPROVED' ? 'VERIFIED' : 'FAILED / REJECTED'}.`,
      });
      fetchVerifications();
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-primaryText">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Step-Up Identity Verification"
          subtitle="Out-of-band multi-factor challenge dispatch for high-risk voice sessions"
        />

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto max-w-7xl w-full mx-auto font-sans">
          {/* Top Security Advisory (Unboxed Header) */}
          <div className="pb-4 border-b border-border space-y-1">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-semibold text-primaryText uppercase tracking-wider font-sans">
                Out-of-Band Security Decoupling
              </h2>
              <span className="text-[10px] text-mutedText font-mono ml-2">
                [Zero Trust Channel]
              </span>
            </div>
            <p className="text-xs text-secondaryText font-sans leading-relaxed max-w-3xl">
              When an active voice interaction exhibits elevated threat signals (acoustic deepfakes, speaker mismatches, or high-risk transaction requests), the voice channel cannot be trusted. Dispatch an independent secondary identity challenge across an isolated channel.
            </p>
          </div>

          {feedbackMsg && (
            <div
              className={`p-3 rounded border text-xs flex items-center justify-between font-sans ${
                feedbackMsg.type === 'success'
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-danger/10 border-danger/30 text-danger'
              }`}
            >
              <span className="flex items-center gap-2">
                {feedbackMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedbackMsg.text}</span>
              </span>
              <button onClick={() => setFeedbackMsg(null)} className="text-mutedText hover:text-primaryText px-1" aria-label="Dismiss message">
                ✕
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Active Challenges (Data Table / List) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between pb-1.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText font-sans">
                    Active Verification Challenges
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-elevated border border-border text-[11px] font-mono text-mutedText">
                    {requests.length}
                  </span>
                </div>
                <button
                  onClick={fetchVerifications}
                  className="text-xs text-mutedText hover:text-primaryText flex items-center gap-1 font-sans"
                  title="Refresh challenges"
                >
                  <Clock className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {requests.length === 0 && !loading ? (
                <EmptyState
                  title="No Active Verification Challenges"
                  description="When voice risk exceeds policy thresholds, out-of-band challenges dispatched by analysts will appear here."
                />
              ) : (
                <div className="divide-y divide-border/40 border-b border-border">
                  {requests.map((req) => {
                    const isPending = req.status === 'PENDING';
                    const isApproved = req.status === 'APPROVED';
                    const isRejected = req.status === 'REJECTED';

                    return (
                      <div
                        key={req.id}
                        className="py-3 font-sans space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-primaryText">
                              {req.targetIdentity}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isPending
                                    ? 'bg-warning'
                                    : isApproved
                                    ? 'bg-success'
                                    : 'bg-danger'
                                }`}
                              />
                              <span className="text-[11px] capitalize">{req.status?.toLowerCase()}</span>
                            </span>
                          </div>

                          <div className="text-[10px] font-mono text-mutedText sm:text-right">
                            {formatSafeTime(req.createdAt)}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-secondaryText">
                          <span>Method: <strong className="text-primaryText font-normal">{req.mechanism?.replace(/_/g, ' ')}</strong></span>
                          <span className="font-mono text-[11px] text-mutedText">Call: {req.callId?.slice(0, 8)}...</span>
                        </div>

                        {/* Status Result & Action Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                          <div className="text-xs">
                            {isPending && (
                              <span className="text-warning flex items-center gap-1.5 font-sans text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                                <span>Awaiting secondary authentication response...</span>
                              </span>
                            )}
                            {isApproved && (
                              <span className="text-success font-medium flex items-center gap-1.5 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Identity Verified via Out-of-Band Channel</span>
                              </span>
                            )}
                            {isRejected && (
                              <span className="text-danger font-medium flex items-center gap-1.5 text-xs">
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Step-Up Challenge Failed or Rejected</span>
                              </span>
                            )}
                          </div>

                          {isPending && (
                            <div className="flex items-center gap-2 ml-auto">
                              <button
                                onClick={() => handleResolve(req.id, 'APPROVED')}
                                className="btn-success text-xs py-1 px-2.5 flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Confirm</span>
                              </button>
                              <button
                                onClick={() => handleResolve(req.id, 'REJECTED')}
                                className="btn-danger text-xs py-1 px-2.5 flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right 5 Columns: Dispatch Step-Up Challenge Form */}
            <div className="lg:col-span-5 lg:pl-6 lg:border-l lg:border-border">
              <div className="space-y-4">
                <div className="pb-2 border-b border-border">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-secondaryText font-sans flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-primary" />
                    <span>Dispatch Step-Up Challenge</span>
                  </h3>
                  <p className="text-xs text-mutedText font-sans mt-0.5">
                    Initiate an out-of-band verification challenge for an active call session.
                  </p>
                </div>

                <form onSubmit={handleCreateRequest} className="space-y-3.5 text-xs font-sans">
                  {/* Target Call Selection */}
                  <div>
                    <label className="block text-secondaryText font-medium mb-1">
                      Target Voice Call Session
                    </label>
                    <select
                      value={callId}
                      onChange={(e) => setCallId(e.target.value)}
                      className="select-enterprise font-mono w-full"
                    >
                      {calls.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.callerIdentifier} ({c.id.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Claimed Identity */}
                  <div>
                    <label className="block text-secondaryText font-medium mb-1">
                      Claimed Identity / User Principal
                    </label>
                    <input
                      type="text"
                      value={targetIdentity}
                      onChange={(e) => setTargetIdentity(e.target.value)}
                      required
                      placeholder="user@corp.internal or +15550192834"
                      className="input-enterprise font-mono w-full"
                    />
                  </div>

                  {/* Verification Mechanism (Clean Radio List, No Box Wrappers) */}
                  <div>
                    <label className="block text-secondaryText font-medium mb-2">
                      Verification Decoupling Channel
                    </label>
                    <div className="space-y-2.5">
                      {[
                        {
                          id: 'AUTHENTICATOR_PUSH',
                          name: 'Authenticator App Push (FIDO / WebAuthn)',
                          desc: 'Cryptographic push challenge dispatched to enrolled mobile token',
                        },
                        {
                          id: 'FIDO2_HARDWARE_KEY',
                          name: 'Hardware Security Key (FIDO2 / YubiKey)',
                          desc: 'FIDO2 physical presence assertion',
                        },
                        {
                          id: 'OUT_OF_BAND_SMS_VOICE',
                          name: 'Out-of-Band Directory Callback',
                          desc: 'Direct telephone callback to registered internal directory number',
                        },
                      ].map((m) => (
                        <label
                          key={m.id}
                          className="flex items-start gap-2.5 cursor-pointer hover:text-primaryText"
                        >
                          <input
                            type="radio"
                            name="mechanism"
                            value={m.id}
                            checked={mechanism === m.id}
                            onChange={(e) => setMechanism(e.target.value)}
                            className="mt-0.5 cursor-pointer text-primary"
                          />
                          <div>
                            <div className={`text-xs ${mechanism === m.id ? 'font-semibold text-primaryText' : 'text-secondaryText'}`}>
                              {m.name}
                            </div>
                            <div className="text-[11px] text-mutedText mt-0.5">{m.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full py-2 text-xs font-medium mt-2 flex items-center justify-center gap-1.5"
                  >
                    {submitting ? (
                      <span>Dispatching Challenge...</span>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Dispatch Step-Up Challenge</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
