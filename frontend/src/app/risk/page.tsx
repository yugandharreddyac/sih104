'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { DetectionSignalsTable } from '@/components/ui/DetectionSignalsTable';
import {
  BarChart3,
  RefreshCw,
  Cpu,
  UserCheck,
  Repeat,
  MessageSquare,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function RiskPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string>('');
  const [assessment, setAssessment] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

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
    const riskRes = await ApiClient.get(`/risk/${callId}`);
    setLoading(false);

    if (riskRes.success && riskRes.data) {
      setAssessment(riskRes.data);
    } else {
      setAssessment(null);
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
    <div className="flex min-h-screen bg-background text-primaryText">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Threat Assessment Matrix"
          subtitle="Multi-modal threat decomposition across acoustic, biometric, and conversational signals"
        />

        <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto max-w-5xl w-full mx-auto">
          {/* Target Call Selection (Unboxed) */}
          <section aria-label="Session Selection" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-semibold text-primaryText uppercase tracking-wider font-sans">
                  Target Call Assessment
                </h2>
              </div>
              <p className="text-xs text-mutedText font-sans mt-0.5">
                Select an active voice session to inspect multi-modal risk scoring and forensic decomposition.
              </p>
            </div>

            {calls.length > 0 ? (
              <div className="flex items-center gap-2">
                <label htmlFor="risk-call-select" className="text-xs text-mutedText shrink-0 font-medium font-sans">
                  Session:
                </label>
                <select
                  id="risk-call-select"
                  value={selectedCallId}
                  onChange={(e) => setSelectedCallId(e.target.value)}
                  className="select-enterprise text-xs font-mono max-w-xs"
                  aria-label="Select call session for risk analysis"
                >
                  {calls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.callerIdentifier} ({c.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => selectedCallId && fetchRiskData(selectedCallId)}
                  disabled={loading}
                  className="btn-secondary text-xs px-2.5 py-1.5 shrink-0"
                  aria-label="Refresh risk data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            ) : null}
          </section>

          {loading && calls.length === 0 ? (
            <LoadingState
              label="Aggregating Threat Telemetry..."
              description="Connecting to Bayesian multi-modal risk engine and retrieving live session data."
            />
          ) : calls.length === 0 ? (
            <EmptyState
              title="No Call Sessions Available"
              description="There are currently no active voice sessions requiring risk evaluation. Initiate a session from Live Calls."
              actionLabel="Go to Live Calls"
              onAction={() => (window.location.href = '/calls')}
            />
          ) : (
            <div className="space-y-6">
              {/* VOICE SECURITY VERDICT (Clean Section) */}
              <section aria-label="Voice Security Verdict" className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-semibold text-mutedText font-sans tracking-wider">
                        Voice Security Verdict
                      </span>
                      <span className="font-mono text-xs text-secondaryText">
                        • {calls.find((c) => c.id === selectedCallId)?.callerIdentifier}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-base font-bold font-sans tracking-tight ${
                          riskLevel === 'CRITICAL'
                            ? 'text-danger'
                            : riskLevel === 'HIGH'
                            ? 'text-warning'
                            : riskLevel === 'ELEVATED'
                            ? 'text-warning'
                            : 'text-success'
                        }`}
                      >
                        {riskLevel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 font-mono text-xs">
                    <div>
                      <span className="text-[11px] text-mutedText block font-sans">Threat Score</span>
                      <span className="text-base font-semibold text-primaryText">
                        {isEvaluated ? `${Math.round(normalizedOverall! * 100)}%` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-mutedText block font-sans">Confidence</span>
                      <span className="text-base font-semibold text-primaryText">
                        {typeof assessment?.confidence === 'number'
                          ? `${Math.round(assessment.confidence > 1 ? assessment.confidence : assessment.confidence * 100)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-secondaryText font-sans leading-relaxed">
                  {isEvaluated
                    ? `Multi-modal threat score evaluated across acoustic deepfake detection, speaker biometrics, and conversational intent analysis.`
                    : `Telemetry pending live stream evaluation or multi-modal analysis.`}
                </p>
              </section>

              <hr className="border-border" />

              {/* PRIMARY RISK FACTORS (Table Layout) */}
              <section aria-label="Primary Risk Factors" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-primaryText uppercase tracking-wider font-sans">
                      Primary Risk Factors
                    </h3>
                    <p className="text-xs text-mutedText font-sans mt-0.5">
                      Multi-modal indicators contributing to the current assessment
                    </p>
                  </div>
                  <span className="text-[11px] font-sans text-mutedText">
                    Range: 0–100%
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-sans">
                    <thead>
                      <tr className="border-b border-border text-[11px] text-mutedText font-medium">
                        <th className="py-2 pr-4 font-medium">Factor</th>
                        <th className="py-2 px-4 font-medium">Signal Status</th>
                        <th className="py-2 pl-4 font-medium text-right w-24">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-sans">
                      <tr className="hover:bg-surface-hover/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <Cpu className="w-3.5 h-3.5 text-secondaryText" />
                            <span className="font-medium text-primaryText">Acoustic Deepfake</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                getDimensionStatus(dimensions.deepfake_synthetic) === 'HIGH_RISK'
                                  ? 'bg-danger'
                                  : getDimensionStatus(dimensions.deepfake_synthetic) === 'SUSPICIOUS'
                                  ? 'bg-warning'
                                  : 'bg-success'
                              }`}
                            />
                            <span className="text-secondaryText capitalize">
                              {getDimensionStatus(dimensions.deepfake_synthetic).toLowerCase().replace('_', ' ')}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 pl-4 text-right font-mono font-medium text-primaryText">
                          {typeof dimensions.deepfake_synthetic === 'number'
                            ? `${Math.round(dimensions.deepfake_synthetic > 1 ? dimensions.deepfake_synthetic : dimensions.deepfake_synthetic * 100)}%`
                            : '—'}
                        </td>
                      </tr>

                      <tr className="hover:bg-surface-hover/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-3.5 h-3.5 text-secondaryText" />
                            <span className="font-medium text-primaryText">Identity Impersonation</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                getDimensionStatus(dimensions.identity_impersonation) === 'HIGH_RISK'
                                  ? 'bg-danger'
                                  : getDimensionStatus(dimensions.identity_impersonation) === 'SUSPICIOUS'
                                  ? 'bg-warning'
                                  : 'bg-success'
                              }`}
                            />
                            <span className="text-secondaryText capitalize">
                              {getDimensionStatus(dimensions.identity_impersonation).toLowerCase().replace('_', ' ')}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 pl-4 text-right font-mono font-medium text-primaryText">
                          {typeof dimensions.identity_impersonation === 'number'
                            ? `${Math.round(dimensions.identity_impersonation > 1 ? dimensions.identity_impersonation : dimensions.identity_impersonation * 100)}%`
                            : '—'}
                        </td>
                      </tr>

                      <tr className="hover:bg-surface-hover/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <Repeat className="w-3.5 h-3.5 text-secondaryText" />
                            <span className="font-medium text-primaryText">Replay / Injection</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                getDimensionStatus(dimensions.replay_injection) === 'HIGH_RISK'
                                  ? 'bg-danger'
                                  : getDimensionStatus(dimensions.replay_injection) === 'SUSPICIOUS'
                                  ? 'bg-warning'
                                  : 'bg-success'
                              }`}
                            />
                            <span className="text-secondaryText capitalize">
                              {getDimensionStatus(dimensions.replay_injection).toLowerCase().replace('_', ' ')}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 pl-4 text-right font-mono font-medium text-primaryText">
                          {typeof dimensions.replay_injection === 'number'
                            ? `${Math.round(dimensions.replay_injection > 1 ? dimensions.replay_injection : dimensions.replay_injection * 100)}%`
                            : '—'}
                        </td>
                      </tr>

                      <tr className="hover:bg-surface-hover/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-secondaryText" />
                            <span className="font-medium text-primaryText">Social Engineering</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                getDimensionStatus(dimensions.social_engineering) === 'HIGH_RISK'
                                  ? 'bg-danger'
                                  : getDimensionStatus(dimensions.social_engineering) === 'SUSPICIOUS'
                                  ? 'bg-warning'
                                  : 'bg-success'
                              }`}
                            />
                            <span className="text-secondaryText capitalize">
                              {getDimensionStatus(dimensions.social_engineering).toLowerCase().replace('_', ' ')}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 pl-4 text-right font-mono font-medium text-primaryText">
                          {typeof dimensions.social_engineering === 'number'
                            ? `${Math.round(dimensions.social_engineering > 1 ? dimensions.social_engineering : dimensions.social_engineering * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <hr className="border-border" />

              {/* ASSESSMENT SYNTHESIS (Clean List Layout) */}
              <section aria-label="Assessment Synthesis" className="space-y-2.5">
                <h3 className="text-xs font-semibold text-primaryText uppercase tracking-wider font-sans">
                  Assessment Synthesis
                </h3>
                {primaryDrivers && primaryDrivers.length > 0 ? (
                  <ul className="space-y-2 text-xs text-secondaryText leading-relaxed font-sans">
                    {primaryDrivers.map((driver: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span className="text-primaryText font-sans">{driver}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-mutedText italic font-sans">
                    {isEvaluated
                      ? 'All acoustic and conversational security metrics are within normal baseline tolerances.'
                      : 'Awaiting sufficient multi-modal audio telemetry to generate plain-language diagnostic synthesis.'}
                  </p>
                )}
              </section>

              <hr className="border-border" />

              {/* DETECTION SIGNALS TABLE (UNBOXED) */}
              <section aria-label="Detection Signals Table" className="space-y-2.5">
                <DetectionSignalsTable unboxed={true} dimensions={dimensions} />
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
