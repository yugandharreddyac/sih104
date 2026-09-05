'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { Lock, ShieldCheck, CheckCircle2, XCircle, RefreshCw, Send } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function VerificationPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mechanism, setMechanism] = useState('AUTHENTICATOR_PUSH');
  const [targetIdentity, setTargetIdentity] = useState('cfo-approvals@corp.internal');
  const [callId, setCallId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const fetchVerifications = React.useCallback(async () => {
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
      setMsg('Please specify or select a target call session.');
      return;
    }
    const res = await ApiClient.post('/verification', {
      callId,
      mechanism,
      targetIdentity,
      payload: { channel: 'IDP_CHALLENGE' },
    });
    if (res.success) {
      setMsg('Step-Up Out-of-Band Verification Dispatched!');
      fetchVerifications();
    } else {
      setMsg(res.message || res.error || 'Failed to dispatch verification challenge');
    }
  };

  const handleResolve = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const res = await ApiClient.patch(`/verification/${id}/resolve`, {
      status,
      notes: `Resolution confirmed via SOC operator interface`,
    });
    if (res.success) {
      fetchVerifications();
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Independent Step-Up Verification Hub" subtitle="Out-of-band authentication decoupling" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          {msg && (
            <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {msg}
              </span>
              <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Verification Requests */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Out-of-Band Verification Requests ({requests.length})</span>
                </h2>
                <button
                  onClick={fetchVerifications}
                  aria-label="Refresh Verifications"
                  className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-3">
                {requests.length === 0 && !loading && (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs soc-glass rounded-xl border border-slate-800">
                    <ShieldCheck className="w-7 h-7 text-emerald-400/50 mx-auto mb-2" />
                    <p className="text-slate-300 font-semibold">No Pending Step-Up Challenges</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Out-of-band challenges dispatched automatically by deterministic policy rules will appear here.
                    </p>
                  </div>
                )}
                {requests.map((req) => (
                  <div key={req.id} className="soc-glass p-4 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-white">{req.mechanism}</span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
                              req.status === 'APPROVED'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : req.status === 'REJECTED'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {req.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-1">
                          Target Identity: <span className="text-cyan-300">{req.targetIdentityMasked || req.targetIdentity}</span>
                        </p>
                      </div>

                      {req.status === 'PENDING' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleResolve(req.id, 'APPROVED')}
                            className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirm</span>
                          </button>
                          <button
                            onClick={() => handleResolve(req.id, 'REJECTED')}
                            className="px-2.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 font-mono">
                      {req.notes || 'Awaiting out-of-band response from user authenticator application.'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Initiate Step-Up Verification Form */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Send className="w-4 h-4 text-cyan-400" />
                <span>Trigger Out-of-Band Challenge</span>
              </h2>
              <p className="text-xs text-slate-400">
                Dispatch an independent challenge completely decoupled from the live voice interaction.
              </p>

              <form onSubmit={handleCreateRequest} className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Target Call Session</label>
                  {calls.length > 0 ? (
                    <select
                      value={callId}
                      onChange={(e) => setCallId(e.target.value)}
                      required
                      className="w-full p-2.5 bg-slate-950/80 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    >
                      {calls.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.callerIdentifier} ({c.id.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={callId}
                      onChange={(e) => setCallId(e.target.value)}
                      placeholder="Enter call UUID"
                      required
                      className="w-full p-2.5 bg-slate-950/80 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Verification Mechanism</label>
                  <select
                    value={mechanism}
                    onChange={(e) => setMechanism(e.target.value)}
                    className="w-full p-2.5 bg-slate-950/80 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="AUTHENTICATOR_PUSH">Authenticator Push (IdP App)</option>
                    <option value="IDP_VERIFIED_APP">Verified Mobile Banking App</option>
                    <option value="CORPORATE_CHANNEL">Known Corporate Channel (Slack/Teams)</option>
                    <option value="INDEPENDENT_CALLBACK">Independent Verified Callback</option>
                    <option value="DUAL_AUTHORIZATION">Two-Person / Dual Control</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Target Claimed Identity</label>
                  <input
                    type="text"
                    value={targetIdentity}
                    onChange={(e) => setTargetIdentity(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-950/80 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    placeholder="cfo@corp.com or +1555..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-lg text-xs font-bold font-mono flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 mt-2 transition-all"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Dispatch Step-Up Challenge</span>
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
