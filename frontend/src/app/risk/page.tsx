'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { BarChart3, ShieldAlert, CheckCircle2, Layers, Activity, TrendingUp } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function RiskPage() {
  const [assessment, setAssessment] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const callId = 'call-sec-demo-101';

  useEffect(() => {
    async function fetchRisk() {
      setLoading(true);
      const res = await ApiClient.get(`/risk/${callId}`);
      setLoading(false);
      if (res.success && res.data) {
        setAssessment(res.data);
      }
    }
    fetchRisk();
  }, []);

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Explainable Multi-Modal Risk Matrix" subtitle="Unified 10-dimensional threat tensor & policy evaluation" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          {/* Model Status & Axiom Card */}
          <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <span>Phase 5 Multi-Modal Risk Fusion Architecture</span>
              </h2>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                Phase 5 Active
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              VOXSHIELD combines acoustic deepfake detection, speaker biometric verification, replay detection, streaming ASR, sensitive data gating, and multi-turn social engineering tactics into a 10-dimensional risk assessment governed by deterministic policy rules.
            </p>
          </div>

          {assessment && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Overall Assessment Overview */}
              <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Composite Risk Evaluation
                </h3>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-center space-y-2">
                  <span className="text-[11px] font-mono text-slate-400 block">Assessment Status</span>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {assessment.status || 'AVAILABLE'}
                  </div>
                  <p className="text-xs text-slate-300 font-mono">
                    Overall Threat Score:{' '}
                    <strong className="text-white">
                      {assessment.overall_risk_score !== undefined
                        ? `${assessment.overall_risk_score.toFixed(1)}/100`
                        : (assessment.compositeScore ?? 'Baseline Active')}
                    </strong>
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono space-y-2 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Threat Level:</span>
                    <span className="text-cyan-400 font-bold">{assessment.risk_level || assessment.severity || 'SAFE'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Calibrated Confidence:</span>
                    <span className="text-emerald-400 font-bold">
                      {assessment.confidence !== undefined && assessment.confidence !== null
                        ? `${(assessment.confidence * 100).toFixed(0)}%`
                        : '85%'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Uncertainty Damping:</span>
                    <span className="text-slate-400">
                      {assessment.uncertainty !== undefined && assessment.uncertainty !== null
                        ? `${(assessment.uncertainty * 100).toFixed(0)}%`
                        : '15%'}
                    </span>
                  </div>
                  {assessment.risk_velocity !== undefined && (
                    <div className="flex justify-between pt-1 border-t border-slate-800">
                      <span className="text-slate-500">Risk Velocity:</span>
                      <span className="text-rose-400 font-bold">+{assessment.risk_velocity}/s</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 10-Dimensional Risk Decomposition */}
              <div className="lg:col-span-2 soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <span>10-Dimensional Threat Tensor Breakdown</span>
                </h3>

                {assessment.dimensions ? (
                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    {Object.entries(assessment.dimensions).map(([key, val]: [string, any], idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1.5">
                        <div className="flex justify-between text-slate-300">
                          <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                          <strong className="text-white">{Number(val).toFixed(0)}</strong>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${Number(val) > 70 ? 'bg-rose-500' : Number(val) > 40 ? 'bg-amber-500' : 'bg-emerald-500'} rounded-full`}
                            style={{ width: `${Math.min(100, Number(val))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assessment.factors?.map((factor: any, idx: number) => (
                      <div key={idx} className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-1.5 font-mono text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                              {factor.category}
                            </span>
                            <span className="font-bold text-white">{factor.factorName}</span>
                          </div>
                          <span className="text-[10px] text-slate-500">Weight: {factor.weight}</span>
                        </div>
                        <p className="text-slate-400 text-[11px] leading-relaxed">
                          {factor.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
