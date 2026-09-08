'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SecurityStatusBadge } from '@/components/ui/SecurityStatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Lock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  PhoneCall,
  Smartphone,
  KeyRound,
  PhoneForwarded,
  ArrowRight,
  ShieldAlert,
  Clock,
  UserCheck,
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
    <div className="flex min-h-screen bg-[#05070d]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Independent Step-Up Verification Hub"
          subtitle="Out-of-Band Authentication Decoupling for High-Risk Voice Interactions"
        />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {/* Top Security Advisory Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-[#0c1222] to-slate-900 border border-indigo-500/30 flex items-start gap-3 shadow-lg">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0 mt-0.5">
              <Lock className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <span>Out-of-Band Security Decoupling</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Zero Trust Voice Channel
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                When an active voice interaction exhibits elevated threat signals (acoustic deepfakes, speaker mismatches, or high-risk transaction requests), the voice channel cannot be trusted. Dispatch an independent secondary identity challenge across an isolated channel.
              </p>
            </div>
          </div>

          {feedbackMsg && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between font-sans ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/30 text-rose-300'
              }`}
            >
              <span className="flex items-center gap-2">
                {feedbackMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
                {feedbackMsg.text}
              </span>
              <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Active Challenges & Results Table */}
            <div className="lg:col-span-7 space-y-3">
              <SectionHeader
                title="Active Verification Challenges"
                subtitle="Live identity verification challenges dispatched across out-of-band channels"
                icon={ShieldCheck}
                count={requests.length}
                onRefresh={fetchVerifications}
                loading={loading}
              />

              <div className="space-y-3">
                {requests.length === 0 && !loading ? (
                  <EmptyState
                    title="No Active Verification Challenges"
                    description="When voice risk exceeds policy thresholds, out-of-band challenges dispatched by analysts will appear here."
                  />
                ) : (
                  requests.map((req) => {
                    const isPending = req.status === 'PENDING';
                    const isApproved = req.status === 'APPROVED';
                    const isRejected = req.status === 'REJECTED';

                    return (
                      <div
                        key={req.id}
                        className="p-4 rounded-xl bg-[#0c1222] border border-slate-800 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                              {req.mechanism === 'AUTHENTICATOR_PUSH' ? (
                                <Smartphone className="w-4 h-4 text-indigo-400" />
                              ) : req.mechanism === 'FIDO2_HARDWARE_KEY' ? (
                                <KeyRound className="w-4 h-4 text-cyan-400" />
                              ) : (
                                <PhoneForwarded className="w-4 h-4 text-amber-300" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-white">
                                  {req.targetIdentity}
                                </span>
                                <SecurityStatusBadge status={req.status} size="xs" />
                              </div>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                Method: {req.mechanism?.replace(/_/g, ' ')} • Call: {req.callId?.slice(0, 8)}...
                              </p>
                            </div>
                          </div>

                          <div className="text-[10px] font-mono text-slate-500 sm:text-right">
                            {formatSafeTime(req.createdAt)}
                          </div>
                        </div>

                        {/* Status Result & Action Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                          <div className="text-[11px] font-sans text-slate-300">
                            {isPending && (
                              <span className="text-amber-300 flex items-center gap-1.5 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                Awaiting user secondary device response...
                              </span>
                            )}
                            {isApproved && (
                              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                ✓ Identity Verified via Out-of-Band Channel
                              </span>
                            )}
                            {isRejected && (
                              <span className="text-rose-400 font-semibold flex items-center gap-1.5">
                                <XCircle className="w-3.5 h-3.5" />
                                ✕ Step-Up Challenge Failed / Rejected
                              </span>
                            )}
                          </div>

                          {isPending && (
                            <div className="flex items-center gap-2 ml-auto">
                              <button
                                onClick={() => handleResolve(req.id, 'APPROVED')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>CONFIRM</span>
                              </button>
                              <button
                                onClick={() => handleResolve(req.id, 'REJECTED')}
                                className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>REJECT</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right 5 Columns: Dispatch Step-Up Challenge Form */}
            <div className="lg:col-span-5">
              <div className="p-5 rounded-xl bg-[#0c1222] border border-slate-800 space-y-4 sticky top-20">
                <div className="pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                    <Send className="w-4 h-4 text-indigo-400" />
                    <span>Dispatch Step-Up Challenge</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-sans mt-0.5">
                    Initiate an out-of-band verification challenge for an active call session.
                  </p>
                </div>

                <form onSubmit={handleCreateRequest} className="space-y-4 text-xs font-sans">
                  {/* Target Call Selection */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1.5">
                      Target Voice Call Session
                    </label>
                    <select
                      value={callId}
                      onChange={(e) => setCallId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
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
                    <label className="block text-slate-300 font-medium mb-1.5">
                      Claimed Identity / User Principal
                    </label>
                    <input
                      type="text"
                      value={targetIdentity}
                      onChange={(e) => setTargetIdentity(e.target.value)}
                      required
                      placeholder="user@corp.internal or +15550192834"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Verification Mechanism */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1.5">
                      Verification Decoupling Channel
                    </label>
                    <div className="space-y-2">
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
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            mechanism === m.id
                              ? 'bg-indigo-950/40 border-indigo-500 text-slate-200'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name="mechanism"
                            value={m.id}
                            checked={mechanism === m.id}
                            onChange={(e) => setMechanism(e.target.value)}
                            className="mt-1"
                          />
                          <div>
                            <div className="font-semibold text-slate-200 text-xs">{m.name}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{m.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-md shadow-indigo-600/20"
                  >
                    {submitting ? (
                      <span>Dispatching Challenge...</span>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>DISPATCH STEP-UP CHALLENGE</span>
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
