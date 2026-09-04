'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { BarChart3, ShieldAlert, CheckCircle2, Layers, Activity, TrendingUp, RefreshCw, AlertTriangle, FileText } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function RiskPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string>('');
  const [assessment, setAssessment] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCalls = async () => {
    setLoading(true);
    const res = await ApiClient.get('/calls');
    setLoading(false);
    if (res.success && res.data && res.data.length > 0) {
      setCalls(res.data);
      if (!selectedCallId) {
        setSelectedCallId(res.data[0].id);
      }
    } else {
      setCalls([]);
      setSelectedCallId('');
      setAssessment(null);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  const fetchRiskData = async (callId: string) => {
    if (!callId) return;
    setLoading(true);
    const [riskRes, timelineRes, evidenceRes] = await Promise.all([
      ApiClient.get(`/risk/${callId}`),
      ApiClient.get(`/risk/${callId}/timeline`),
      ApiClient.get(`/risk/${callId}/evidence`),
    ]);
    setLoading(false);

    if (riskRes.success && riskRes.data) {
      setAssessment(riskRes.data);
    } else {
      setAssessment(null);
    }
    if (timelineRes.success && timelineRes.data) {
      setTimeline(timelineRes.data);
    }
    if (evidenceRes.success && evidenceRes.data) {
      setEvidence(evidenceRes.data);
    }
  };

  useEffect(() => {
    if (selectedCallId) {
      fetchRiskData(selectedCallId);
    }
  }, [selectedCallId]);

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Explainable Multi-Modal Risk Matrix" subtitle="Unified 10-dimensional threat tensor & policy evaluation" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          {/* Model Status & Axiom Card */}
          <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <span>Multi-Modal Threat Fusion Architecture</span>
              </h2>

              {calls.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-mono text-slate-400">Inspecting Call:</label>
                  <select
                    value={selectedCallId}
                    onChange={(e) => setSelectedCallId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  >
                    {calls.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.callerIdentifier} ({c.id.slice(0, 8)}...)
                      </option>
                    ))}
                  </select>
                  <button onClick={() => fetchRiskData(selectedCallId)} className="p-1 text-slate-400 hover:text-white rounded">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              VOXSHIELD combines acoustic deepfake detection, speaker biometric verification, replay detection, streaming ASR, sensitive data gating, and multi-turn social engineering tactics into a unified multi-dimensional risk assessment governed by deterministic policy rules.
            </p>
          </div>

          {assessment ? (
            <div className="space-y-6">
              {/* Multi-Factor Invariant Banner */}
              {assessment.dimensions && (assessment.dimensions.social_engineering >= 70 || assessment.dimensions.credential_theft >= 70) && assessment.dimensions.deepfake_synthetic < 30 && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs font-mono text-rose-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-white font-bold">
                      MULTI-FACTOR THREAT OVERRIDE ACTIVE
                    </strong>
                    <span>
                      Acoustic neural deepfake score is low ({assessment.dimensions.deepfake_synthetic}%), but conversational social engineering ({assessment.dimensions.social_engineering}%) and credential solicitation ({assessment.dimensions.credential_theft}%) are elevated. Composite risk is evaluated as HIGH/CRITICAL.
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Composite Risk Evaluation */}
                <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Composite Risk Evaluation
                  </h3>

                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-center space-y-2">
                    <span className="text-[11px] font-mono text-slate-400 block">Assessment Level</span>
                    <div
                      className={`text-xl font-bold font-mono ${
                        assessment.risk_level === 'CRITICAL'
                          ? 'text-rose-400'
                          : assessment.risk_level === 'HIGH'
                          ? 'text-orange-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {assessment.risk_level || assessment.severity || 'MONITOR'}
                    </div>
                    <p className="text-xs text-slate-300 font-mono">
                      Overall Threat Score:{' '}
                      <strong className="text-white">
                        {assessment.overall_risk_score !== undefined
                          ? `${Number(assessment.overall_risk_score).toFixed(1)}/100`
                          : (assessment.compositeScore ?? 'N/A')}
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
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Uncertainty Damping:</span>
                      <span className="text-slate-400">
                        {assessment.uncertainty !== undefined && assessment.uncertainty !== null
                          ? `${(assessment.uncertainty * 100).toFixed(0)}%`
                          : 'N/A'}
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

                {/* 10-Dimensional Threat Tensor Breakdown */}
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
                              style={{ width: `${Math.min(100, Math.max(0, Number(val)))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 font-mono">No tensor dimensions available for this assessment.</p>
                  )}
                </div>
              </div>

              {/* Timeline & Evidence */}
              {timeline.length > 0 && (
                <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>Risk Progression Timeline ({timeline.length} turns)</span>
                  </h3>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1 font-mono text-xs">
                    {timeline.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500">Turn #{item.chunkIndex ?? idx}</span>
                          <span className="font-bold text-white">Score: {item.overall_risk_score ?? item.riskScore ?? 'N/A'}</span>
                          <span className="text-indigo-400">[{item.risk_level || 'MONITOR'}]</span>
                        </div>
                        <span className="text-slate-500 text-[10px]">{new Date(item.timestamp || Date.now()).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-16 text-center text-slate-500 font-mono text-xs soc-glass rounded-xl border border-slate-800 space-y-2">
              <BarChart3 className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-300 font-bold">No Risk Assessment Found</p>
              <p className="text-slate-500">
                {calls.length > 0 ? 'Select a call session above or stream audio in Live Calls to compute risk.' : 'No active calls found in the system.'}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

