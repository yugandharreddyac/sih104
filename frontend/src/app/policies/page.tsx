'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  Play,
  RefreshCw,
  ArrowRight,
  Sliders,
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
    <div className="flex min-h-screen bg-background text-primaryText">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Security Policy Engine"
          subtitle="Automated real-time security rules and deterministic mitigation guardrails"
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl w-full mx-auto font-sans">
          {/* Top Pipeline Flow (Open Canvas, No Outer Box) */}
          <div className="pb-4 border-b border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-mutedText mb-2">
              Evaluation Flow
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
              <span className="text-secondaryText font-medium">1. Ingest Telemetry</span>
              <ArrowRight className="w-3 h-3 text-mutedText" />
              <span className="text-secondaryText font-medium">2. Assess Threat Risk</span>
              <ArrowRight className="w-3 h-3 text-mutedText" />
              <span className="text-primary font-semibold">3. Deterministic Match</span>
              <ArrowRight className="w-3 h-3 text-mutedText" />
              <span className="text-danger font-medium">4. Autonomous Action</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-6">
            {/* Left 7 Columns: Active Enterprise Policies */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText">
                    Configured Security Policies
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-elevated border border-border text-[11px] font-mono text-mutedText">
                    {policies.length} Active
                  </span>
                </div>
                <button
                  onClick={loadPolicies}
                  className="text-xs text-mutedText hover:text-primaryText flex items-center gap-1"
                  title="Reload policies"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {loading && policies.length === 0 ? (
                <LoadingState
                  label="Loading Enterprise Policies..."
                  description="Querying deterministic security rules and evaluation thresholds from backend."
                />
              ) : policies.length === 0 ? (
                <EmptyState
                  title="No Configured Policies"
                  description="Enterprise security policies will appear here once loaded from the backend."
                  actionLabel="Reload Policies"
                  onAction={loadPolicies}
                />
              ) : (
                <div className="divide-y divide-border border-b border-border">
                  {policies.map((policy) => (
                    <div key={policy.id} className="py-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-semibold text-primaryText">
                              {policy.name}
                            </h3>
                            <span className="inline-flex items-center gap-1 text-[11px] text-mutedText">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  policy.isActive ? 'bg-success' : 'bg-mutedText'
                                }`}
                              />
                              <span className="capitalize">{policy.isActive ? 'active' : 'inactive'}</span>
                            </span>
                          </div>
                          <p className="text-xs text-mutedText mt-0.5">
                            {policy.description}
                          </p>
                        </div>
                      </div>

                      {/* Rule Specifics as clean high-density rows */}
                      {policy.rules && policy.rules.length > 0 && (
                        <div className="pt-2">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-wider text-mutedText border-b border-border/50">
                                <th className="py-1.5 pr-3 font-medium">Rule</th>
                                <th className="py-1.5 px-3 font-medium">Condition</th>
                                <th className="py-1.5 pl-3 font-medium text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30 text-[11px]">
                              {policy.rules.map((rule: any) => {
                                const isBlock = rule.action?.includes('BLOCK');
                                const isStepUp = rule.action?.includes('STEP_UP');

                                return (
                                  <tr key={rule.id} className="hover:bg-surface-hover/20">
                                    <td className="py-2 pr-3 font-medium text-primaryText">
                                      {rule.name}
                                    </td>
                                    <td className="py-2 px-3 text-secondaryText">
                                      {rule.description}
                                    </td>
                                    <td className="py-2 pl-3 text-right font-mono text-[10px] whitespace-nowrap">
                                      <span
                                        className={
                                          isBlock
                                            ? 'text-danger font-semibold'
                                            : isStepUp
                                            ? 'text-primary font-semibold'
                                            : 'text-secondaryText font-medium'
                                        }
                                      >
                                        {rule.action}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right 5 Columns: Interactive Policy Simulator */}
            <div className="lg:col-span-5 lg:pl-6 lg:border-l lg:border-border">
              <div className="space-y-4">
                <div className="pb-2 border-b border-border">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-secondaryText flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-primary" />
                    <span>Policy Evaluation Simulator</span>
                  </h3>
                  <p className="text-xs text-mutedText mt-0.5">
                    Evaluate deterministic policy guardrails against sample call telemetry.
                  </p>
                </div>

                <div className="space-y-1.5 text-xs">
                  <label htmlFor="sim-context" className="block font-medium text-secondaryText">
                    Context Payload (JSON)
                  </label>
                  <textarea
                    id="sim-context"
                    value={simContext}
                    onChange={(e) => setSimContext(e.target.value)}
                    rows={6}
                    className="w-full p-2.5 bg-surface-elevated border border-border rounded text-xs font-mono text-primaryText focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    aria-label="Simulation JSON context payload"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRunSimulation}
                  disabled={simulating}
                  className="w-full btn-primary py-2 text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  {simulating ? (
                    <span>Evaluating Rules...</span>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Evaluate Policy Rules</span>
                    </>
                  )}
                </button>

                {simResult && (
                  <div className="pt-3 border-t border-border text-xs font-sans space-y-2">
                    <div className="text-[10px] text-mutedText uppercase tracking-wider font-semibold">
                      Enforcement Decision Result
                    </div>
                    {simResult.error ? (
                      <p className="text-danger text-xs">{simResult.error}</p>
                    ) : (
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-mutedText">Triggered Action:</span>
                          <span className="font-bold text-danger font-mono">
                            {simResult.action || simResult.triggered_action || 'NO_ACTION_TRIGGERED'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-mutedText">Policy Triggered:</span>
                          <span className="text-primaryText font-mono">
                            {simResult.policy_name || simResult.policyId || 'NONE'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-mutedText">Evaluation Status:</span>
                          <span className="text-success font-semibold">
                            {simResult.status || (simResult.action ? 'POLICY_TRIGGERED' : 'EVALUATED_SAFE')}
                          </span>
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
