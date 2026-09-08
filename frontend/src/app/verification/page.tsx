'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { Lock, ShieldCheck, CheckCircle2, XCircle, RefreshCw, Send, Smartphone, MessageSquare, PhoneForwarded, Users } from 'lucide-react';
import { ApiClient } from '@/lib/api';

interface VerificationRequest {
  id: string;
  organizationId: string;
  callId?: string;
  mechanism: 'AUTHENTICATOR_PUSH' | 'IDP_VERIFIED_APP' | 'CORPORATE_CHANNEL' | 'INDEPENDENT_CALLBACK' | 'DUAL_AUTHORIZATION';
  targetIdentityMasked: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  initiatedAt: string;
  expiresAt?: string;
  notes?: string;
}

export default function VerificationPage() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [mechanism, setMechanism] = useState<VerificationRequest['mechanism']>('AUTHENTICATOR_PUSH');
  const [targetIdentity, setTargetIdentity] = useState('cfo-approvals@corp.internal');
  const [callId, setCallId] = useState('call-sec-demo-101');
  const [msg, setMsg] = useState<{ type: 'SUCCESS' | 'ERROR'; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchVerifications = async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get<VerificationRequest[]>('/verification');
      if (res.success && res.data) {
        setRequests(res.data);
      } else {
        const sampleVerifications: VerificationRequest[] = [
          {
            id: 'ver-req-001',
            organizationId: '00000000-0000-0000-0000-000000000001',
            callId: 'call-sec-demo-101',
            mechanism: 'AUTHENTICATOR_PUSH',
            targetIdentityMasked: 'cfo-***@corp.internal',
            status: 'PENDING',
            initiatedAt: new Date(Date.now() - 120000).toISOString(),
            notes: 'Automated Step-Up triggered by credential harvesting detection on live stream.',
          },
          {
            id: 'ver-req-002',
            organizationId: '00000000-0000-0000-0000-000000000001',
            callId: 'call-sec-demo-102',
            mechanism: 'CORPORATE_CHANNEL',
            targetIdentityMasked: 'sysadmin-***@corp.internal',
            status: 'APPROVED',
            initiatedAt: new Date(Date.now() - 86400000).toISOString(),
            notes: 'Identity confirmed via Slack Enterprise Grid SSO mutual verification.',
          },
        ];
        setRequests(sampleVerifications);
      }
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerifications();
  }, []);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setMsg(null);

    try {
      const res = await ApiClient.post('/verification', {
        callId: callId.trim() || undefined,
        mechanism,
        targetIdentity: targetIdentity.trim(),
        payload: { channel: 'IDP_CHALLENGE' },
      });

      if (res.success) {
        setMsg({ type: 'SUCCESS', text: 'Out-of-Band Step-Up Challenge Dispatched to Enrolled Identity!' });
        fetchVerifications();
      } else {
        setMsg({ type: 'ERROR', text: res.message || 'Failed to dispatch verification challenge.' });
      }
    } catch (err: any) {
      setMsg({ type: 'ERROR', text: err.message || 'Verification dispatch failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setActionLoading(true);
    try {
      const res = await ApiClient.patch(`/verification/${id}/resolve`, {
        status,
        notes: `Step-Up challenge marked as ${status} by SOC Operator.`,
      });

      if (res.success) {
        setMsg({ type: 'SUCCESS', text: `Verification challenge ${status.toLowerCase()} successfully.` });
        fetchVerifications();
      }
    } catch {
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
    } finally {
      setActionLoading(false);
    }
  };

  const getMechanismIcon = (mech: VerificationRequest['mechanism']) => {
    switch (mech) {
      case 'AUTHENTICATOR_PUSH':
        return <Smartphone className="w-4 h-4 text-[#7A1F3D]" />;
      case 'CORPORATE_CHANNEL':
        return <MessageSquare className="w-4 h-4 text-[#168F86]" />;
      case 'INDEPENDENT_CALLBACK':
        return <PhoneForwarded className="w-4 h-4 text-[#168F86]" />;
      case 'DUAL_AUTHORIZATION':
        return <Users className="w-4 h-4 text-[#C87524]" />;
      default:
        return <Lock className="w-4 h-4 text-[#A0A4AE]" />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#1A1A1F] text-[#F5F5F7] font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Independent Step-Up Verification Hub" subtitle="Out-of-band authentication decoupling & zero-trust proof" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          {msg && (
            <div
              className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between animate-in fade-in ${
                msg.type === 'SUCCESS'
                  ? 'bg-[#168F86]/15 border-[#168F86]/40 text-[#168F86] shadow-sm'
                  : 'bg-[#D94A5A]/15 border-[#D94A5A]/40 text-[#D94A5A] shadow-sm'
              }`}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {msg.text}
              </span>
              <button onClick={() => setMsg(null)} className="text-[#A0A4AE] hover:text-[#F5F5F7] transition-colors">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Requests List */}
            <div className="lg:col-span-2 space-y-4 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                <h2 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#C87524]" />
                  <span>Out-of-Band Verification Challenges ({requests.length})</span>
                </h2>
                <button
                  onClick={fetchVerifications}
                  disabled={loading}
                  className="p-1 text-[#A0A4AE] hover:text-[#F5F5F7] rounded transition-colors"
                  title="Refresh Verifications"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#7A1F3D]' : ''}`} />
                </button>
              </div>

              <div className="space-y-3">
                {requests.length > 0 ? (
                  requests.map((req) => (
                    <div key={req.id} className="soc-glass-card p-4.5 rounded-xl border border-[#3A3A42] space-y-3 shadow-glass-card">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {getMechanismIcon(req.mechanism)}
                            <span className="text-xs font-bold text-[#F5F5F7]">{req.mechanism}</span>
                            <span
                              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                                req.status === 'APPROVED'
                                  ? 'bg-[#168F86]/20 text-[#168F86] border-[#168F86]/40 shadow-sm'
                                  : req.status === 'REJECTED'
                                  ? 'bg-[#D94A5A]/20 text-[#D94A5A] border-[#D94A5A]/40 shadow-sm'
                                  : 'bg-[#C87524]/20 text-[#C87524] border-[#C87524]/40 animate-pulse shadow-sm'
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                          <p className="text-xs text-[#A0A4AE] mt-1">
                            Target Identity: <span className="text-[#F5F5F7] font-semibold">{req.targetIdentityMasked}</span>
                            {req.callId && <span className="text-[#A0A4AE] ml-2">• Session: {req.callId}</span>}
                          </p>
                        </div>

                        {req.status === 'PENDING' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleResolve(req.id, 'APPROVED')}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-[#168F86]/20 hover:bg-[#168F86]/30 text-[#168F86] border border-[#168F86]/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Confirm Match</span>
                            </button>
                            <button
                              onClick={() => handleResolve(req.id, 'REJECTED')}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-[#D94A5A]/20 hover:bg-[#D94A5A]/30 text-[#D94A5A] border border-[#D94A5A]/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {req.notes && (
                        <div className="p-2.5 rounded-lg bg-[#1A1A1F]/80 border border-[#3A3A42] text-[11px] text-[#A0A4AE] font-sans shadow-sm">
                          {req.notes}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="soc-glass-card p-8 text-center text-[#A0A4AE] text-xs rounded-xl border border-[#3A3A42]">
                    No active verification requests.
                  </div>
                )}
              </div>
            </div>

            {/* Initiate Step-Up Verification Form */}
            <div className="soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-4 font-mono shadow-glass-card">
              <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                <h2 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#7A1F3D]" />
                  <span>Dispatch Step-Up Challenge</span>
                </h2>
                <span className="text-[10px] text-[#C87524] font-bold px-2 py-0.5 rounded bg-[#C87524]/15 border border-[#C87524]/30">
                  OUT-OF-BAND
                </span>
              </div>
              <p className="text-xs text-[#A0A4AE] font-sans">
                Trigger an out-of-band biometric challenge completely decoupled from the live voice interaction.
              </p>

              <form onSubmit={handleCreateRequest} className="space-y-3">
                <div>
                  <label className="block text-xs text-[#A0A4AE] mb-1">Target Call Session ID</label>
                  <input
                    type="text"
                    value={callId}
                    onChange={(e) => setCallId(e.target.value)}
                    required
                    className="w-full p-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] focus:outline-none focus:border-[#7A1F3D] shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#A0A4AE] mb-1">Verification Mechanism</label>
                  <select
                    value={mechanism}
                    onChange={(e) => setMechanism(e.target.value as any)}
                    className="w-full p-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] focus:outline-none focus:border-[#7A1F3D]"
                  >
                    <option value="AUTHENTICATOR_PUSH">Authenticator Push (IdP App)</option>
                    <option value="IDP_VERIFIED_APP">Verified Mobile Banking App</option>
                    <option value="CORPORATE_CHANNEL">Known Corporate Channel (Slack/Teams)</option>
                    <option value="INDEPENDENT_CALLBACK">Independent Verified Callback</option>
                    <option value="DUAL_AUTHORIZATION">Two-Person / Dual Control</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#A0A4AE] mb-1">Target Claimed Identity</label>
                  <input
                    type="text"
                    value={targetIdentity}
                    onChange={(e) => setTargetIdentity(e.target.value)}
                    required
                    className="w-full p-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] focus:outline-none focus:border-[#7A1F3D] shadow-inner"
                    placeholder="cfo@corp.com or +1555..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-2.5 bg-[#7A1F3D] hover:bg-[#8F2749] text-[#F5F5F7] rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm border border-[#7A1F3D]/60 mt-2 transition-all"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{actionLoading ? 'Dispatching...' : 'Dispatch Step-Up Challenge'}</span>
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
