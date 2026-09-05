'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { FileCheck2, ShieldCheck, Play, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [simContext, setSimContext] = useState('{\n  "requested_information": "OTP",\n  "transaction_type": "HIGH_VALUE",\n  "identity_verified": false\n}');
  const [simResult, setSimResult] = useState<any | null>(null);

  const loadPolicies = async () => {
    setLoading(true);
    const res = await ApiClient.get('/policies');
    setLoading(false);
    if (res.success && res.data) {
      setPolicies(res.data);
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const handleRunSimulation = async () => {
    try {
      const parsed = JSON.parse(simContext);
      const res = await ApiClient.post('/policies/evaluate', { context: parsed });
      if (res.success && res.data) {
        setSimResult(res.data);
      }
    } catch (e: any) {
      setSimResult({ error: 'Invalid JSON format in context simulator' });
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Deterministic Policy Engine" subtitle="Rules & Automated Action Enforcer" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Configured Policies List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-cyan-400" />
                  <span>Active Enterprise Policy Rules ({policies.length})</span>
                </h2>
                <button
                  onClick={loadPolicies}
                  aria-label="Refresh Policies"
                  className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-3">
                {policies.length === 0 && !loading && (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs soc-glass rounded-xl border border-slate-800">
                    <FileCheck2 className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                    <p className="text-slate-300 font-semibold">No Policy Rules Configured</p>
                    <p className="text-[10px] text-slate-500 mt-1">Enterprise rules evaluated during live voice interactions will appear here.</p>
                  </div>
                )}
                {policies.map((policy) => (
                  <div key={policy.id} className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white font-mono">{policy.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{policy.description}</p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                        {policy.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      {policy.rules?.map((rule: any) => (
                        <div key={rule.id} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs font-mono space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200">{rule.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              Action: {rule.action}
                            </span>
                          </div>
                          <p className="text-slate-400 text-[11px]">{rule.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Policy Evaluation Simulator */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                <span>Deterministic Rule Tester</span>
              </h2>
              <p className="text-xs text-slate-400">
                Simulate call context and test real-time deterministic policy trigger logic.
              </p>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Call Context JSON</label>
                <textarea
                  value={simContext}
                  onChange={(e) => setSimContext(e.target.value)}
                  rows={6}
                  className="w-full p-3 bg-slate-950/80 border border-slate-700 rounded-lg text-xs font-mono text-cyan-300 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={handleRunSimulation}
                className="w-full py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-lg text-xs font-bold font-mono flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Evaluate Context</span>
              </button>

              {simResult && (
                <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 text-xs font-mono space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Decision:</span>
                    <span className={`font-bold ${simResult.allowed ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {simResult.allowed ? 'ALLOW TRANSACTION' : 'BLOCK / ENFORCE ACTION'}
                    </span>
                  </div>
                  {simResult.actionsTriggered?.length > 0 && (
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Actions Triggered:</span>
                      {simResult.actionsTriggered.map((act: string, idx: number) => (
                        <div key={idx} className="text-amber-300 font-bold mt-0.5">• {act}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
