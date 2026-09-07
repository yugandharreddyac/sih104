'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SecurityStatusBadge } from '@/components/ui/SecurityStatusBadge';
import { ThreatVerdict } from '@/components/ui/ThreatVerdict';
import { RiskScoreGauge } from '@/components/ui/RiskScoreGauge';
import { EvidenceList } from '@/components/ui/EvidenceList';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  BarChart3,
  ShieldAlert,
  ShieldCheck,
  Layers,
  Activity,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Lock,
  Cpu,
  UserCheck,
  Repeat,
  MessageSquare,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { formatSafeTime } from '@/lib/format';

export default function RiskPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string>('');
  const [assessment, setAssessment] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFullTensor, setShowFullTensor] = useState(false);

  const fetchCalls = useCallback(async () => {
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
  }, [selectedCallId]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const fetchRiskData = useCallback(async (callId: string) => {
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
  }, []);

  useEffect(() => {
    if (selectedCallId) {
      fetchRiskData(selectedCallId);
    }
  }, [selectedCallId, fetchRiskData]);

  const rawScore = assessment?.overall_risk_score ?? assessment?.compositeScore;
  const isEvaluated = typeof rawScore === 'number' && Number.isFinite(rawScore);
  const normalizedOverall = isEvaluated ? (rawScore > 1 ? rawScore / 100 : rawScore) : null;
  const riskLevel =
    assessment?.risk_level ||
    assessment?.riskLevel ||
    (normalizedOverall !== null
      ? normalizedOverall >= 0.7
        ? 'CRITICAL'
        : normalizedOverall >= 0.4
        ? 'HIGH'
        : 'LOW'
      : 'INCONCLUSIVE');

  const dimensions = assessment?.dimensions || {};
  const primaryDrivers = assessment?.primary_drivers || assessment?.primaryDrivers || [];

  const getDimensionStatus = (score: number | null | undefined): string => {
    if (typeof score !== 'number' || !Number.isFinite(score)) return 'PENDING';
    const norm = score > 1 ? score / 100 : score;
    if (norm >= 0.7) return 'HIGH_RISK';
    if (norm >= 0.4) return 'SUSPICIOUS';
    return 'SAFE';
  };

  return (
    <div className="flex min-h-screen bg-[#070b14]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Explainable Multi-Modal Threat Matrix"
          subtitle="Unified 10-Dimensional Risk Tensor & Cross-Modal Corroboration"
        />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {/* Call Selection Bar */}
          <div className="p-4 rounded-xl bg-[#0c1222] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Target Call Assessment
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Select an active voice session to inspect multi-modal risk scoring.
                </p>
              </div>
            </div>

            {calls.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-mono text-slate-400 shrink-0">Call Session:</label>
                <select
                  value={selectedCallId}
                  onChange={(e) => setSelectedCallId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                >
                  {calls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.callerIdentifier} ({c.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {calls.length === 0 && !loading ? (
            <EmptyState
              title="No Call Sessions Available"
              description="Initiate a live stream from the Live Calls console to view explainable threat risk metrics."
              actionLabel="Go to Live Calls"
              onAction={() => (window.location.href = '/calls')}
            />
          ) : (
            <div className="space-y-6">
              {/* Level 1 & 2: Primary Threat Assessment Verdict Card */}
              <ThreatVerdict
                verdict={riskLevel}
                riskScore={normalizedOverall}
                confidence={typeof assessment?.confidence === 'number' ? assessment.confidence : null}
                callerIdentifier={calls.find((c) => c.id === selectedCallId)?.callerIdentifier}
                summary={
                  isEvaluated
                    ? `Unified threat tensor synthesized across acoustic deepfake detection, speaker biometrics, and multi-turn conversational intent analysis.`
                    : `Telemetry pending live stream evaluation or multi-modal analysis.`
                }
              />

              {/* Primary Risk Drivers Overview (Level 3 - Why is it a threat?) */}
              <div className="p-5 rounded-xl bg-[#0c1222] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>Primary Risk Drivers</span>
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">
                    Weighted Bayesian Fusion
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <Cpu className="w-4 h-4 text-rose-400" />
                        <span>Acoustic Deepfake</span>
                      </div>
                      <SecurityStatusBadge status={getDimensionStatus(dimensions.deepfake_synthetic)} size="xs" showIcon={false} />
                    </div>
                    <RiskScoreGauge
                      score={dimensions.deepfake_synthetic}
                      size="sm"
                      label="Vocoder Spoof"
                    />
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <UserCheck className="w-4 h-4 text-amber-300" />
                        <span>Identity Impersonation</span>
                      </div>
                      <SecurityStatusBadge status={getDimensionStatus(dimensions.identity_impersonation)} size="xs" showIcon={false} />
                    </div>
                    <RiskScoreGauge
                      score={dimensions.identity_impersonation}
                      size="sm"
                      label="Biometric Variance"
                    />
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <Repeat className="w-4 h-4 text-cyan-400" />
                        <span>Replay / Injection</span>
                      </div>
                      <SecurityStatusBadge status={getDimensionStatus(dimensions.replay_injection)} size="xs" showIcon={false} />
                    </div>
                    <RiskScoreGauge
                      score={dimensions.replay_injection}
                      size="sm"
                      label="Spectral Cutoff"
                    />
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <MessageSquare className="w-4 h-4 text-rose-400" />
                        <span>Social Engineering</span>
                      </div>
                      <SecurityStatusBadge status={getDimensionStatus(dimensions.social_engineering)} size="xs" showIcon={false} />
                    </div>
                    <RiskScoreGauge
                      score={dimensions.social_engineering}
                      size="sm"
                      label="Intent Urgency"
                    />
                  </div>
                </div>

                {/* Plain Language "Why This Score?" Synthesis */}
                <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Plain-Language Assessment Synthesis
                  </span>
                  {primaryDrivers && primaryDrivers.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-slate-300 font-sans leading-relaxed">
                      {primaryDrivers.map((driver: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                          <span>{driver}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      {isEvaluated
                        ? 'All acoustic and conversational security metrics are within normal baseline tolerances.'
                        : 'Awaiting sufficient multi-modal audio telemetry to generate plain-language diagnostic synthesis.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Expandable 10-Dimensional Threat Tensor */}
              <div className="p-5 rounded-xl bg-[#0c1222] border border-slate-800 space-y-4">
                <button
                  onClick={() => setShowFullTensor(!showFullTensor)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-indigo-400">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Full 10-Dimensional Threat Tensor
                      </h3>
                      <p className="text-[11px] text-slate-400 font-sans">
                        Comprehensive multi-layer threat dimension decomposition
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-mono text-cyan-400">
                    <span>{showFullTensor ? 'COLLAPSE' : 'EXPAND ALL 10 DIMENSIONS'}</span>
                    {showFullTensor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {showFullTensor && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80">
                    {[
                      { name: '1. Identity Impersonation', score: dimensions.identity_impersonation, key: 'ID_IMP' },
                      { name: '2. Deepfake / Synthetic Voice', score: dimensions.deepfake_synthetic, key: 'DEEPFAKE' },
                      { name: '3. Replay / Injection Signal', score: dimensions.replay_injection, key: 'REPLAY' },
                      { name: '4. Social Engineering Urgency', score: dimensions.social_engineering, key: 'SOC_ENG' },
                      { name: '5. Credential Theft Solicitation', score: dimensions.credential_theft, key: 'CRED_THEFT' },
                      { name: '6. Financial Fraud / Wire Risk', score: dimensions.financial_fraud, key: 'FIN_FRAUD' },
                      { name: '7. Account Takeover Progression', score: dimensions.account_takeover, key: 'ATO' },
                      { name: '8. Verification Bypass Attempt', score: dimensions.verification_bypass, key: 'BYPASS' },
                      { name: '9. Signal & Channel Inconsistency', score: dimensions.inconsistency, key: 'INCONSISTENCY' },
                      { name: '10. Overall Composite Threat Tensor', score: dimensions.overall ?? (isEvaluated ? rawScore : null), key: 'COMPOSITE' },
                    ].map((dim) => {
                      const hasScore = typeof dim.score === 'number' && Number.isFinite(dim.score);
                      const normVal = hasScore ? (dim.score > 1 ? dim.score : dim.score * 100) : 0;
                      const pct = Math.round(normVal);

                      return (
                        <div
                          key={dim.key}
                          className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs font-sans">
                            <span className="font-semibold text-slate-200">{dim.name}</span>
                            <span className={`font-mono font-bold ${hasScore ? 'text-slate-300' : 'text-slate-500'}`}>
                              {hasScore ? `${pct}%` : '—'}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                !hasScore
                                  ? 'bg-slate-700'
                                  : pct >= 70
                                  ? 'bg-rose-500'
                                  : pct >= 40
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                              }`}
                              style={{ width: hasScore ? `${pct}%` : '0%' }}
                            />
                          </div>
                        </div>
                      );
                    })}
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
