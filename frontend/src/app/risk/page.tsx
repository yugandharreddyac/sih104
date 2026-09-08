'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  BarChart3,
  RefreshCw,
  Radio,
  Clock,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { ExplainabilitySummary } from '@/components/explainability/ExplainabilitySummary';
import { WhyThisRisk } from '@/components/explainability/WhyThisRisk';
import { RiskDimensionMatrix, DimensionConfig } from '@/components/explainability/RiskDimensionMatrix';
import { DetectorProvenance } from '@/components/explainability/DetectorProvenance';
import { RiskTimeline, TimelinePoint } from '@/components/explainability/RiskTimeline';
import { SignalEvidenceModal } from '@/components/explainability/SignalEvidenceModal';

export default function RiskPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string>('');
  const [assessment, setAssessment] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Inspector Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDimKey, setSelectedDimKey] = useState<string | null>(null);
  const [selectedDimMeta, setSelectedDimMeta] = useState<DimensionConfig | null>(null);
  const [selectedProv, setSelectedProv] = useState<any | null>(null);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get('/calls');
      if (res.success && res.data && res.data.length > 0) {
        setCalls(res.data);
        if (!selectedCallId) {
          setSelectedCallId(res.data[0].id);
        }
      } else {
        setCalls([]);
        setSelectedCallId('');
        setAssessment(null);
        setTimeline([]);
      }
    } catch {
      setCalls([]);
      setSelectedCallId('');
      setAssessment(null);
      setTimeline([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCallId]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const fetchRiskData = useCallback(async (callId: string) => {
    if (!callId) return;
    setLoading(true);
    setTimelineLoading(true);
    try {
      const [riskRes, timelineRes] = await Promise.all([
        ApiClient.get(`/risk/${callId}`),
        ApiClient.get(`/risk/${callId}/timeline`),
      ]);

      if (riskRes.success && riskRes.data) {
        setAssessment(riskRes.data);
      } else {
        setAssessment(null);
      }

      if (timelineRes.success && Array.isArray(timelineRes.data)) {
        setTimeline(timelineRes.data);
      } else {
        setTimeline([]);
      }
    } catch {
      setAssessment(null);
      setTimeline([]);
    } finally {
      setLoading(false);
      setTimelineLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCallId) {
      fetchRiskData(selectedCallId);
    }
  }, [selectedCallId, fetchRiskData]);

  const rawScore = assessment?.overall_risk_score ?? assessment?.compositeScore;
  const isEvaluated = typeof rawScore === 'number' && Number.isFinite(rawScore);
  const dimensions = assessment?.dimensions || {};
  const dimensionProvenance = assessment?.dimension_provenance || {};

  const currentCall = calls.find((c) => c.id === selectedCallId);

  const handleSelectDimension = (key: string, meta: DimensionConfig, prov: any) => {
    setSelectedDimKey(key);
    setSelectedDimMeta(meta);
    setSelectedProv(prov);
    setModalOpen(true);
  };

  return (
    <div className="flex h-screen bg-background text-primaryText overflow-hidden font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Navbar
          title="AI Explainability & Risk Assessment"
          subtitle="Transparent multi-modal risk reasoning, neural detector provenance, and dynamic recovery tracking"
        />

        <main className="p-4 md:p-6 space-y-5 max-w-[1600px] w-full mx-auto">
          {/* TOP SESSION SELECTION & ACTION TOOLBAR */}
          <header className="panel-enterprise p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-l-4 border-l-primary">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h1 className="text-xs sm:text-sm md:text-base font-bold tracking-tight text-primaryText uppercase font-mono whitespace-nowrap">
                  TARGET CALL ASSESSMENT
                </h1>
              </div>

              {calls.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="risk-call-select" className="text-[11px] sm:text-xs text-mutedText font-mono">
                    SESSION:
                  </label>
                  <select
                    id="risk-call-select"
                    value={selectedCallId}
                    onChange={(e) => setSelectedCallId(e.target.value)}
                    className="select-enterprise py-1 text-xs font-mono max-w-[240px]"
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

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={() => selectedCallId && fetchRiskData(selectedCallId)}
                disabled={loading}
                className="btn-secondary py-1 px-3 text-xs flex items-center gap-1.5 font-sans"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
                <span>Refresh Matrix</span>
              </button>

              <Link
                href="/calls"
                className="btn-primary py-1 px-3 text-xs flex items-center gap-1.5 font-sans"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Live Calls</span>
              </Link>
            </div>
          </header>

          {loading && calls.length === 0 ? (
            <LoadingState
              label="Aggregating Threat Telemetry..."
              description="Connecting to Bayesian multi-modal risk engine and retrieving live session data."
            />
          ) : calls.length === 0 ? (
            <EmptyState
              title="No Monitored Sessions Available"
              description="There are currently no active voice sessions requiring risk evaluation. Initiate a session from Live Calls."
              actionLabel="Go to Live Calls"
              onAction={() => (window.location.href = '/calls')}
            />
          ) : (
            <div className="space-y-5">
              {/* 1. EXPLAINABILITY SUMMARY CARD (5-SECOND VERDICT & CONFIDENCE DECOUPLING) */}
              <ExplainabilitySummary
                assessment={assessment}
                callIdentifier={currentCall?.callerIdentifier}
                isEvaluated={isEvaluated}
              />

              {/* 2. WHY THIS RISK? (7-STEP CAUSAL TRACEABLE CHAIN) */}
              <WhyThisRisk
                assessment={assessment}
                isEvaluated={isEvaluated}
              />

              {/* 3. MULTI-TURN RISK EVOLUTION & RECOVERY TIMELINE */}
              <RiskTimeline
                timeline={timeline}
                isLoading={timelineLoading}
              />

              {/* 4. 10-DIMENSIONAL DECOMPOSITION MATRIX */}
              <RiskDimensionMatrix
                dimensions={dimensions}
                dimensionProvenance={dimensionProvenance}
                onSelectDimension={handleSelectDimension}
              />

              {/* 5. DETECTOR PROVENANCE VIEW (RAW VS NORMALIZED SIGNAL MAPPING) */}
              <DetectorProvenance
                assessment={assessment}
                isEvaluated={isEvaluated}
              />
            </div>
          )}
        </main>
      </div>

      {/* TECHNICAL EVIDENCE INSPECTION MODAL */}
      <SignalEvidenceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        dimensionKey={selectedDimKey}
        dimensionMeta={selectedDimMeta}
        provenance={selectedProv}
        callId={selectedCallId}
      />
    </div>
  );
}
