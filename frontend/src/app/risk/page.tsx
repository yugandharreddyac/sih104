'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import {
  BarChart3,
  ShieldAlert,
  CheckCircle2,
  Layers,
  Activity,
  TrendingUp,
  RefreshCw,
  GitBranch,
  FileText,
  Clock,
  Zap,
  Info,
  Sliders,
  ShieldCheck,
  Shield,
  Fingerprint,
} from 'lucide-react';
import { ApiClient, CallSession } from '@/lib/api';
import { getSeverityBadgeConfig, formatConfidence, formatRiskScore } from '@/lib/adapters';
import { renderRedactedText } from '@/lib/privacy';

export default function RiskPage() {
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string>('call-sec-demo-101');
  const [assessment, setAssessment] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCalls() {
      try {
        const res = await ApiClient.get<CallSession[]>('/calls');
        if (res.success && res.data && res.data.length > 0) {
          setCalls(res.data);
          setSelectedCallId(res.data[0].id);
        } else {
          setCalls([
            {
              id: 'call-sec-demo-101',
              callerIdentifier: '+1 (555) 839-2041 (CFO Pretext)',
              direction: 'INBOUND',
              status: 'ACTIVE',
              organizationId: '00000000-0000-0000-0000-000000000001',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'call-sec-demo-102',
              callerIdentifier: '+91 98201 48291 (Helpdesk Pretext)',
              direction: 'INBOUND',
              status: 'ACTIVE',
              organizationId: '00000000-0000-0000-0000-000000000001',
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        setCalls([
          {
            id: 'call-sec-demo-101',
            callerIdentifier: '+1 (555) 839-2041 (CFO Pretext)',
            direction: 'INBOUND',
            status: 'ACTIVE',
            organizationId: '00000000-0000-0000-0000-000000000001',
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    }
    loadCalls();
  }, []);

  const fetchRiskData = async (callId: string) => {
    setLoading(true);
    try {
      const [riskRes, tlRes, evRes] = await Promise.all([
        ApiClient.get(`/risk/${callId}`),
        ApiClient.get(`/risk/${callId}/timeline`),
        ApiClient.get(`/risk/${callId}/evidence`),
      ]);

      if (riskRes.success && riskRes.data) {
        setAssessment(riskRes.data);
      } else {
        setAssessment({
          status: 'AVAILABLE',
          overall_risk_score: 88.5,
          risk_level: 'CRITICAL',
          confidence: 0.92,
          uncertainty: 0.08,
          dimensions: {
            overall: 88.5,
            identity_impersonation: 85.0,
            deepfake_synthetic: 12.0,
            replay_injection: 8.0,
            social_engineering: 92.0,
            credential_theft: 95.0,
            financial_fraud: 88.0,
            account_takeover: 45.0,
            verification_bypass: 90.0,
            inconsistency: 0.0,
          },
          risk_velocity: 14.2,
          risk_trajectory_trend: 'ESCALATING',
          primary_drivers: [
            'CRITICAL THREAT: High-confidence multi-modal credential harvesting pattern.',
            'Direct solicitation of authentication credentials / OTP [REDACTED].',
            'Multi-turn sequence reached SECRET_HARVESTING_ATTEMPTED stage.',
          ],
          contradicting_signals: [
            'Acoustic voice is bona-fide human speech; threat is driven by conversational social engineering.',
          ],
          evidence_graph: {
            nodes: [
              { node_id: 'n1', layer: 'ACOUSTIC', cue: 'Glottal pulse periodicity indicates organic human speech', confidence: 0.94 },
              { node_id: 'n2', layer: 'CONVERSATIONAL_NLP', cue: 'High-urgency helpdesk password reset pretext detected', confidence: 0.91 },
              { node_id: 'n3', layer: 'PRIVACY_FIREWALL', cue: 'Direct solicitation of one-time passcode token', confidence: 0.96 },
              { node_id: 'n4', layer: 'POLICY_ENGINE', cue: 'Deterministic trigger: POL-CRED-001 (Require Step-Up)', confidence: 1.0 },
            ],
          },
        });
      }

      if (tlRes.success && Array.isArray(tlRes.data)) {
        setTimeline(tlRes.data);
      }

      if (evRes.success && evRes.data) {
        setEvidence(evRes.data);
      }
    } catch {
      setAssessment(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCallId) {
      fetchRiskData(selectedCallId);
    }
  }, [selectedCallId]);

  const badge = assessment ? getSeverityBadgeConfig(assessment.risk_level || assessment.severity) : null;

  return (
    <div className="flex min-h-screen bg-[#1A1A1F] text-[#F5F5F7] font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Explainable Multi-Modal Risk Matrix & Threat Tensor"
          subtitle="10-dimensional multi-modal tensor decomposition, confidence calibration & signal attribution"
        />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          {/* Session Selector & Architecture Header */}
          <div className="soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-4 font-mono shadow-glass-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#7A1F3D]" />
                <h2 className="text-sm font-bold text-[#F5F5F7]">
                  10-Dimensional Threat Tensor & Explainability Engine
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-[#A0A4AE]">Target Session:</label>
                <select
                  value={selectedCallId}
                  onChange={(e) => setSelectedCallId(e.target.value)}
                  className="bg-[#1A1A1F] border border-[#3A3A42] text-xs rounded-lg px-3 py-1.5 text-[#F5F5F7] focus:outline-none focus:border-[#7A1F3D] shadow-sm"
                >
                  {calls.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.callerIdentifier || c.id}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => fetchRiskData(selectedCallId)}
                  disabled={loading}
                  className="p-1.5 text-[#A0A4AE] hover:text-[#F5F5F7] rounded bg-[#24242B] border border-[#3A3A42] hover:border-[#7A1F3D]/50 transition-colors shadow-sm"
                  title="Refresh Assessment"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#7A1F3D]' : ''}`} />
                </button>
              </div>
            </div>

            <p className="text-xs text-[#A0A4AE] leading-relaxed font-sans">
              VOXSHIELD combines acoustic deepfake detection, speaker biometric verification, replay injection detection, streaming ASR, pre-persistence PII firewall, and conversational intent analysis into a unified multi-modal risk score governed by deterministic policies.
            </p>
          </div>

          {assessment ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono">
              {/* Overall Assessment Overview */}
              <div className="soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-4 shadow-glass-card">
                <h3 className="text-xs font-bold text-[#A0A4AE] uppercase tracking-wider flex items-center justify-between">
                  <span>Composite Risk Assessment</span>
                  <span className="text-[10px] text-[#A0A4AE]">{selectedCallId}</span>
                </h3>

                <div className="p-4 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] text-center space-y-2 shadow-inner">
                  <span className="text-[11px] text-[#A0A4AE] block">Composite Threat Score</span>
                  <div
                    className={`text-3xl font-black ${
                      assessment.overall_risk_score >= 80
                        ? 'text-[#D94A5A]'
                        : assessment.overall_risk_score >= 70
                        ? 'text-[#C87524]'
                        : assessment.overall_risk_score >= 30
                        ? 'text-[#C87524]'
                        : assessment.overall_risk_score !== null
                        ? 'text-[#168F86]'
                        : 'text-[#A0A4AE]'
                    }`}
                  >
                    {assessment.overall_risk_score !== undefined && assessment.overall_risk_score !== null
                      ? `${assessment.overall_risk_score.toFixed(1)} / 100`
                      : assessment.compositeScore !== null && assessment.compositeScore !== undefined
                      ? `${assessment.compositeScore} / 100`
                      : 'INCONCLUSIVE'}
                  </div>
                  {badge && (
                    <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${badge.badgeClass}`}>
                      {badge.label}
                    </span>
                  )}
                </div>

                <div className="p-3.5 rounded-lg bg-[#1A1A1F]/80 border border-[#3A3A42] text-xs space-y-2 text-[#F5F5F7] shadow-sm">
                  <div className="flex justify-between">
                    <span className="text-[#A0A4AE]">Calibrated Confidence:</span>
                    <span className="text-[#168F86] font-bold">
                      {formatConfidence(assessment.confidence)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#A0A4AE]">Uncertainty Damping:</span>
                    <span className="text-[#A0A4AE] font-bold">
                      {formatConfidence(assessment.uncertainty)}
                    </span>
                  </div>
                  {assessment.risk_velocity !== undefined && (
                    <div className="flex justify-between pt-1 border-t border-[#3A3A42]">
                      <span className="text-[#A0A4AE]">Risk Velocity:</span>
                      <span className="text-[#D94A5A] font-bold">+{assessment.risk_velocity}/s</span>
                    </div>
                  )}
                  {assessment.risk_trajectory_trend && (
                    <div className="flex justify-between">
                      <span className="text-[#A0A4AE]">Trajectory Trend:</span>
                      <span className="text-[#F5F5F7] font-bold">{assessment.risk_trajectory_trend}</span>
                    </div>
                  )}
                </div>

                {/* Primary Explainable Drivers */}
                <div className="space-y-2 pt-2 border-t border-[#3A3A42]">
                  <span className="text-[10px] font-bold text-[#A0A4AE] uppercase tracking-wider block">
                    Primary Threat Drivers
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {(assessment.primary_drivers || assessment.primaryDrivers || []).map((driver: string, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-[#1A1A1F]/80 border border-[#3A3A42] text-[#A0A4AE] text-[11px] flex items-start gap-1.5 shadow-sm">
                        <span className="text-[#D94A5A] font-bold mt-0.5">•</span>
                        <span className="font-sans text-[#F5F5F7]">{renderRedactedText(driver)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contradicting Signals */}
                {assessment.contradicting_signals && assessment.contradicting_signals.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#3A3A42]">
                    <span className="text-[10px] font-bold text-[#A0A4AE] uppercase tracking-wider block">
                      Contradicting / Mitigating Signals
                    </span>
                    <div className="space-y-1.5 text-xs">
                      {assessment.contradicting_signals.map((sig: string, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-[#2E2E36]/60 border border-[#3A3A42] text-[#F5F5F7] text-[11px] flex items-start gap-1.5 shadow-sm">
                          <span className="text-[#168F86] font-bold mt-0.5">•</span>
                          <span className="font-sans">{sig}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 10-Dimensional Risk Decomposition & Evidence Graph */}
              <div className="lg:col-span-2 space-y-6">
                {/* 10-Dimensional Matrix */}
                <div className="soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-4 shadow-glass-card">
                  <h3 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#7A1F3D]" />
                    <span>10-Dimensional Threat Vector Decomposition</span>
                  </h3>

                  {assessment.dimensions ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {Object.entries(assessment.dimensions).map(([key, val]: [string, any], idx) => {
                        const numVal = typeof val === 'number' ? val : null;
                        return (
                          <div key={idx} className="p-3 rounded-lg bg-[#1A1A1F]/80 border border-[#3A3A42] space-y-1.5 shadow-sm">
                            <div className="flex justify-between text-[#A0A4AE]">
                              <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                              <strong className="text-[#F5F5F7] font-mono">
                                {numVal !== null ? `${numVal.toFixed(0)}/100` : 'N/A'}
                              </strong>
                            </div>
                            <div className="h-1.5 w-full bg-[#24242B] rounded-full overflow-hidden border border-[#3A3A42]">
                              <div
                                className={`h-full ${
                                  numVal !== null && numVal > 70
                                    ? 'bg-[#D94A5A]'
                                    : numVal !== null && numVal > 40
                                    ? 'bg-[#C87524]'
                                    : numVal !== null
                                    ? 'bg-[#168F86]'
                                    : 'bg-[#3A3A42]'
                                } rounded-full transition-all duration-300`}
                                style={{ width: `${Math.min(100, numVal || 0)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-[#A0A4AE] text-xs">
                      No tensor dimensions available for this session.
                    </div>
                  )}
                </div>

                {/* Evidence Cues & Graph DAG */}
                <div className="soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-4 shadow-glass-card">
                  <h3 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-[#168F86]" />
                    <span>Evidence Graph & Multi-Layer Forensic Cues</span>
                  </h3>

                  <div className="space-y-2">
                    {assessment.evidence_graph?.nodes?.length > 0 ? (
                      assessment.evidence_graph.nodes.map((node: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg bg-[#1A1A1F]/90 border border-[#3A3A42] hover:border-[#7A1F3D]/50 flex items-center justify-between text-xs transition-colors shadow-sm">
                          <div className="flex items-center gap-2.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#2E2E36] text-[#F5F5F7] border border-[#3A3A42] shadow-sm">
                              {node.layer}
                            </span>
                            <span className="text-[#F5F5F7] font-sans">{node.cue}</span>
                          </div>
                          <span className="text-[#A0A4AE] text-[10px] shrink-0 ml-2 font-mono">
                            Confidence: {(node.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-[#A0A4AE] text-xs">
                        No evidence graph nodes recorded for this session.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="soc-glass-card p-12 text-center text-[#A0A4AE] text-sm font-mono rounded-xl border border-[#3A3A42]">
              Select a call session above to inspect the multi-modal risk matrix.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
