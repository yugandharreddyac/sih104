'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SecurityStatusBadge } from '@/components/ui/SecurityStatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  FileCheck2,
  ShieldCheck,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  Ban,
  ArrowRight,
  Sliders,
  Cpu,
  Layers,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [simContext, setSimContext] = useState(
    '{\n  "requested_information": "OTP",\n  "transaction_type": "HIGH_VALUE_WIRE",\n  "identity_verified": false,\n  "deepfake_score": 0.89\n}'
  );
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simulating, setSimulating] = useState(false);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    const res = await ApiClient.get('/policies');
    setLoading(false);
    if (res.success && res.data) {
      setPolicies(res.data);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const handleRunSimulation = async () => {
    setSimulating(true);
    try {
      const parsed = JSON.parse(simContext);
      const res = await ApiClient.post('/policies/evaluate', { context: parsed });
      setSimulating(false);
      if (res.success && res.data) {
        setSimResult(res.data);
      } else {
        setSimResult({ error: res.message || 'Policy evaluation failed' });
      }
    } catch (e: any) {
      setSimulating(false);
      setSimResult({ error: 'Invalid JSON format in context simulator' });
    }
  };

  return (
    <div className="flex min-h-screen bg-[#070b14]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Deterministic Policy Engine"
          subtitle="Automated Security Rules Converting Intelligence into Concrete Protection Actions"
        />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {/* Visual Architecture Flow Ribbon */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-[#0c1222] to-purple-950/40 border border-slate-800 space-y-3 shadow-lg">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
              Zero Trust Policy Architecture Pipeline
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs font-mono text-center">
              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-semibold text-slate-200">1. AI SIGNALS</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center gap-2">
                <Layers className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="font-semibold text-slate-200">2. RISK FUSION</span>
              </div>
              <div className="p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center gap-2 text-indigo-300">
                <FileCheck2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="font-bold text-white">3. POLICY ENGINE</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center gap-2 text-rose-300">
                <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="font-semibold text-slate-200">4. STEP-UP / BLOCK</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Active Configured Policies */}
            <div className="lg:col-span-7 space-y-3">
              <SectionHeader
                title="Active Enterprise Security Policies"
                subtitle="Deterministic rules evaluated in real-time on live voice streams"
                icon={FileCheck2}
                count={policies.length}
                onRefresh={loadPolicies}
                loading={loading}
              />

              <div className="space-y-3">
                {policies.length === 0 && !loading ? (
                  <EmptyState
                    title="No Configured Policies"
                    description="Enterprise security policies will appear here once loaded from the backend."
                  />
                ) : (
                  policies.map((policy) => (
                    <div
                      key={policy.id}
                      className="p-5 rounded-xl bg-[#0c1222] border border-slate-800 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-white font-mono">
                            {policy.name}
                          </h3>
                          <p className="text-xs text-slate-400 font-sans mt-0.5">
                            {policy.description}
                          </p>
                        </div>
                        <SecurityStatusBadge
                          status={policy.isActive ? 'ACTIVE' : 'INACTIVE'}
                          size="xs"
                        />
                      </div>

                      {/* Rule Specifics */}
                      <div className="space-y-2 pt-2 border-t border-slate-800/80">
                        {policy.rules?.map((rule: any) => (
                          <div
                            key={rule.id}
                            className="p-3 rounded-lg bg-slate-900/70 border border-slate-800/80 text-xs font-sans space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-200 font-mono">
                                {rule.name}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
                                  rule.action?.includes('BLOCK')
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    : rule.action?.includes('STEP_UP')
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                                }`}
                              >
                                ACTION: {rule.action}
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px] leading-relaxed">
                              {rule.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right 5 Columns: Interactive Policy Simulator */}
            <div className="lg:col-span-5">
              <div className="p-5 rounded-xl bg-[#0c1222] border border-slate-800 space-y-4 sticky top-20">
                <div className="pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <span>Policy Evaluation Simulator</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-sans mt-0.5">
                    Test live policy decision responses against simulated security contexts.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300 font-sans">
                    Context Payload (JSON)
                  </label>
                  <textarea
                    value={simContext}
                    onChange={(e) => setSimContext(e.target.value)}
                    rows={6}
                    className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-cyan-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  onClick={handleRunSimulation}
                  disabled={simulating}
                  className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20"
                >
                  {simulating ? (
                    <span>Evaluating Rules...</span>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>EVALUATE DETERMINISTIC POLICIES</span>
                    </>
                  )}
                </button>

                {simResult && (
                  <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono space-y-2">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      Enforcement Decision Result
                    </span>
                    {simResult.error ? (
                      <p className="text-rose-400 text-xs">{simResult.error}</p>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Triggered Action:</span>
                          <span className="font-bold text-rose-400">
                            {simResult.action || simResult.triggered_action || 'REQUIRE_STEP_UP_VERIFICATION'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Policy Name:</span>
                          <span className="text-slate-200">{simResult.policy_name || 'POL-AUTH-PROTECT-01'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Status:</span>
                          <span className="text-emerald-400 font-bold">DETERMINISTIC_ENFORCED</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
