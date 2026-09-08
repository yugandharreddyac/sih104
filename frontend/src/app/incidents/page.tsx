'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ApiClient } from '@/lib/api';
import { formatSafeTime, formatSafeDateTime, formatPercentage, getRiskSeverity } from '@/lib/format';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Search,
  ArrowRight,
  Clock,
  Ban,
  FileSearch,
  Cpu,
  UserCheck,
  Repeat,
  MessageSquare,
  AlertTriangle,
  History,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Activity,
  Layers,
  PhoneCall,
  User,
  Info,
  X,
  Radio,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { OfficerActionPanel, ResponseActionType } from '@/components/response/OfficerActionPanel';
import { ActionConfirmationModal } from '@/components/response/ActionConfirmationModal';
import { VerificationStatusCard } from '@/components/response/VerificationStatusCard';
import { ResponseTimeline } from '@/components/response/ResponseTimeline';

interface IncidentEvent {
  type: string;
  actorUserId?: string;
  description: string;
  timestamp: string | Date;
}

interface EvidenceReference {
  id: string;
  type: string;
  description: string;
  hash: string;
}

interface IncidentRecord {
  id: string;
  incidentNumber: string;
  callId?: string;
  organizationId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  attackClassification: string;
  status: 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'FALSE_POSITIVE';
  detectedAt: string;
  resolvedAt?: string;
  summary: string;
  assignedToUserId?: string;
  triggeredPolicies: string[];
  actionsTaken: string[];
  evidenceReferences: EvidenceReference[];
  events: IncidentEvent[];
  metadata?: Record<string, any>;
}

interface CallDetails {
  id: string;
  callerIdentifier: string;
  callerDisplayName?: string;
  direction?: string;
  status: string;
  durationSeconds?: number;
  startedAt?: string;
  createdAt?: string;
}

interface DimensionProvenance {
  dimension: string;
  score: number;
  confidence: number;
  status: string;
  source_detector: string;
  model_version: string;
  evidence: string[];
  timestamp: string;
}

interface RiskAssessmentData {
  status: string;
  call_id: string;
  overall_risk_score: number | null;
  risk_level: string | null;
  confidence: number | null;
  uncertainty: number | null;
  dimensions: Record<string, number | null>;
  dimension_provenance?: Record<string, DimensionProvenance>;
  primary_drivers: string[];
  evidence_graph?: {
    nodes: Array<{ node_id: string; layer: string; cue: string; confidence: number; is_adversarial: boolean; timestamp_ms?: number }>;
    primary_findings: string[];
  };
  policy_recommendation?: {
    policy_id: string;
    action: string;
    explanation: string;
    is_triggered: boolean;
  } | null;
  human_workflow_state?: string;
  fusion_latency_ms?: number;
}

const DIMENSION_METADATA: Record<string, { label: string; model: string; weight: string; desc: string }> = {
  credential_theft: { label: 'Credential Theft', model: 'SensitiveDataDetector v4', weight: 'High (0.28)', desc: 'Solicitation of authentication credentials, OTP, or passwords' },
  financial_fraud: { label: 'Financial Fraud', model: 'RequestedActionExtractor v4', weight: 'High (0.25)', desc: 'Unauthorized wire, beneficiary diversion, or high-value funds transfer' },
  identity_impersonation: { label: 'Identity Impersonation', model: 'SpeakerVerifier (ECAPA-TDNN)', weight: 'High (0.20)', desc: 'Voiceprint contradicts enrolled biometric profile' },
  deepfake_synthetic: { label: 'Synthetic Voice / Deepfake', model: 'Robust MiniAcousticCNN + AASIST', weight: 'High (0.20)', desc: 'Vocoder phase jitter, unnatural spectral consistency, or synthesized vocoder cues' },
  account_takeover: { label: 'Account Takeover', model: 'ActionExtractor v4', weight: 'Medium (0.15)', desc: 'Remote desktop tool installation (AnyDesk, TeamViewer) requests' },
  verification_bypass: { label: 'Verification Bypass', model: 'SocialEngineeringDetector v4', weight: 'Medium (0.15)', desc: 'Adversary pressures operator to bypass secondary verification' },
  social_engineering: { label: 'Social Engineering', model: 'SocialEng Multi-Turn v4', weight: 'Medium (0.12)', desc: 'Urgency manipulation, authority exploitation, or psychological coercion' },
  replay_injection: { label: 'Replay / Loudspeaker', model: 'ReplaySpectralDecay v3', weight: 'Low (0.10)', desc: 'Physical loudspeaker acoustic roll-off and secondary room reverberation' },
  inconsistency: { label: 'Dialogue Inconsistency', model: 'InconsistencyVerifier v4', weight: 'Low (0.08)', desc: 'Contradictory caller identities or factual assertions across dialogue turns' },
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(null);

  // Associated case correlation data
  const [associatedCall, setAssociatedCall] = useState<CallDetails | null>(null);
  const [associatedRisk, setAssociatedRisk] = useState<RiskAssessmentData | null>(null);
  const [riskTimeline, setRiskTimeline] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [correlationLoading, setCorrelationLoading] = useState(false);

  // Filters & Search
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Response Actions & Feedback
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Consequential Confirmation Modal State
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingActionType, setPendingActionType] = useState<ResponseActionType | null>(null);
  const [pendingInterventionDecision, setPendingInterventionDecision] = useState<'APPROVED' | 'REJECTED' | 'OVERRIDDEN' | null>(null);

  // Evidence Detail Modal
  const [selectedEvidenceDetail, setSelectedEvidenceDetail] = useState<{
    id: string;
    title: string;
    category: string;
    source: string;
    modelVersion?: string;
    confidence?: number;
    details: string | string[];
    hash?: string;
    timestamp?: string;
  } | null>(null);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get('/incidents');
      if (res.success && res.data) {
        setIncidents(res.data);
        if (res.data.length > 0 && !selectedIncident) {
          setSelectedIncident(res.data[0]);
        }
      } else {
        setIncidents([]);
      }
    } catch {
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedIncident]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Correlate associated call, risk, verification and intervention telemetry
  useEffect(() => {
    if (!selectedIncident) {
      setAssociatedCall(null);
      setAssociatedRisk(null);
      setRiskTimeline([]);
      setVerifications([]);
      setInterventions([]);
      return;
    }

    let isMounted = true;
    const callId = selectedIncident.callId;
    setCorrelationLoading(true);

    const promises: Promise<any>[] = [
      ApiClient.get('/verification'),
      ApiClient.get('/interventions'),
    ];

    if (callId) {
      promises.push(
        ApiClient.get(`/calls/${callId}`),
        ApiClient.get(`/risk/${callId}`),
        ApiClient.get(`/risk/${callId}/timeline`)
      );
    }

    Promise.allSettled(promises).then(([verifRes, intervRes, callRes, riskRes, timelineRes]) => {
      if (!isMounted) return;
      setCorrelationLoading(false);

      if (verifRes.status === 'fulfilled' && verifRes.value?.success && Array.isArray(verifRes.value?.data)) {
        const matching = verifRes.value.data.filter(
          (v: any) => (callId && v.callId === callId) || v.payload?.incidentId === selectedIncident.id
        );
        setVerifications(matching.length > 0 ? matching : (callId ? [] : verifRes.value.data.slice(0, 2)));
      } else {
        setVerifications([]);
      }

      if (intervRes.status === 'fulfilled' && intervRes.value?.success && Array.isArray(intervRes.value?.data)) {
        const matching = callId ? intervRes.value.data.filter((i: any) => i.callId === callId) : intervRes.value.data;
        setInterventions(matching);
      } else {
        setInterventions([]);
      }

      if (callRes && callRes.status === 'fulfilled' && callRes.value?.success && callRes.value?.data) {
        setAssociatedCall(callRes.value.data);
      } else {
        setAssociatedCall(null);
      }

      if (riskRes && riskRes.status === 'fulfilled' && riskRes.value?.success && riskRes.value?.data) {
        setAssociatedRisk(riskRes.value.data);
      } else {
        setAssociatedRisk(null);
      }

      if (timelineRes && timelineRes.status === 'fulfilled' && timelineRes.value?.success && Array.isArray(timelineRes.value?.data)) {
        setRiskTimeline(timelineRes.value.data);
      } else {
        setRiskTimeline([]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedIncident]);

  const handleInitiateAction = (actionType: ResponseActionType) => {
    setPendingActionType(actionType);
    setConfirmModalOpen(true);
  };

  const handleInterventionDecision = (decision: 'APPROVED' | 'REJECTED' | 'OVERRIDDEN') => {
    setPendingInterventionDecision(decision);
    const actionType: ResponseActionType =
      decision === 'APPROVED' ? 'APPROVE_INTERVENTION' : decision === 'REJECTED' ? 'REJECT_INTERVENTION' : 'OVERRIDE_INTERVENTION';
    setPendingActionType(actionType);
    setConfirmModalOpen(true);
  };

  const handleExecuteConfirmedAction = async (actionType: ResponseActionType, notes?: string) => {
    if (!selectedIncident) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      if (
        actionType === 'INVESTIGATING' ||
        actionType === 'CONTAINED' ||
        actionType === 'RESOLVED' ||
        actionType === 'FALSE_POSITIVE'
      ) {
        const targetStatus: IncidentRecord['status'] = actionType;
        const res = await ApiClient.patch(`/incidents/${selectedIncident.id}/status`, {
          status: targetStatus,
          notes: notes || `Case transitioned to ${targetStatus} by SOC Officer`,
        });
        if (res.success) {
          setActionFeedback(`Incident ${selectedIncident.incidentNumber} transitioned to ${targetStatus.replace(/_/g, ' ')}.`);
          await fetchIncidents();
          setSelectedIncident((prev) =>
            prev
              ? {
                  ...prev,
                  status: targetStatus,
                  events: [
                    {
                      type: `STATUS_CHANGED_${targetStatus}`,
                      actorUserId: 'SOC Officer',
                      description: notes || `Officer updated status to ${targetStatus}`,
                      timestamp: new Date().toISOString(),
                    },
                    ...(prev.events || []),
                  ],
                }
              : null
          );
        } else {
          setActionFeedback(res.message || res.error || 'Failed to update incident status.');
        }
      } else if (actionType === 'TRIGGER_VERIFICATION') {
        const targetCallId = selectedIncident.callId || associatedCall?.id;
        if (!targetCallId) {
          setActionFeedback('Cannot trigger step-up: No active or correlated voice session linked to this incident.');
          return;
        }
        const targetIdentity = associatedCall?.callerIdentifier || 'cfo-executive@voxshield.internal';
        const res = await ApiClient.post('/verification', {
          callId: targetCallId,
          mechanism: 'AUTHENTICATOR_PUSH',
          targetIdentity,
          payload: {
            incidentId: selectedIncident.id,
            incidentNumber: selectedIncident.incidentNumber,
            notes: notes || 'Officer initiated out-of-band step-up verification challenge.',
          },
        });
        if (res.success && res.data) {
          setActionFeedback(`Step-up verification challenge dispatched to ${res.data.targetIdentityMasked || res.data.targetIdentityMask || targetIdentity}.`);
          setVerifications((prev) => [res.data, ...prev]);
        } else {
          setActionFeedback(res.message || res.error || 'Failed to dispatch verification challenge.');
        }
      } else if (
        actionType === 'APPROVE_INTERVENTION' ||
        actionType === 'REJECT_INTERVENTION' ||
        actionType === 'OVERRIDE_INTERVENTION'
      ) {
        const activeInterv = interventions[0];
        if (!activeInterv) {
          setActionFeedback('No pending policy intervention record found.');
          return;
        }
        const decision =
          pendingInterventionDecision ||
          (actionType === 'APPROVE_INTERVENTION'
            ? 'APPROVED'
            : actionType === 'REJECT_INTERVENTION'
            ? 'REJECTED'
            : 'OVERRIDDEN');

        const res = await ApiClient.post('/interventions/decision', {
          interventionId: activeInterv.id,
          decision,
          reason: notes || `Officer recorded decision: ${decision}`,
        });
        if (res.success && res.data) {
          setActionFeedback(`Intervention ${activeInterv.id.slice(0, 8)} recorded as ${decision}.`);
          setInterventions((prev) => prev.map((i) => (i.id === activeInterv.id ? { ...i, status: decision } : i)));
        } else {
          setActionFeedback(res.message || res.error || 'Failed to record intervention decision.');
        }
      }
    } catch (err: any) {
      setActionFeedback(err.message || 'Error executing officer response action.');
    } finally {
      setActionLoading(false);
      setConfirmModalOpen(false);
      setPendingActionType(null);
      setPendingInterventionDecision(null);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  const handleResolveVerification = async (
    verificationId: string,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    notes?: string
  ) => {
    setActionLoading(true);
    try {
      const res = await ApiClient.patch(`/verification/${verificationId}/resolve`, {
        status,
        notes: notes || `Verification challenge resolved as ${status} by SOC Officer`,
      });
      if (res.success && res.data) {
        setActionFeedback(`Verification challenge resolved: ${status}.`);
        setVerifications((prev) => prev.map((v) => (v.id === verificationId ? res.data : v)));
      } else {
        setActionFeedback(res.message || res.error || 'Failed to resolve verification.');
      }
    } catch (err: any) {
      setActionFeedback(err.message || 'Error resolving verification.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const matchesSeverity = filterSeverity === 'ALL' || inc.severity === filterSeverity;
      const matchesStatus = filterStatus === 'ALL' || inc.status === filterStatus;
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        inc.incidentNumber.toLowerCase().includes(term) ||
        inc.summary.toLowerCase().includes(term) ||
        inc.attackClassification.toLowerCase().includes(term) ||
        inc.callId?.toLowerCase().includes(term);
      return matchesSeverity && matchesStatus && matchesSearch;
    });
  }, [incidents, filterSeverity, filterStatus, searchTerm]);

  // Determine overall severity and risk parameters
  const activeSeverity = selectedIncident?.severity || 'LOW';
  const severityProps = getRiskSeverity(
    activeSeverity === 'CRITICAL' ? 95 : activeSeverity === 'HIGH' ? 75 : activeSeverity === 'MEDIUM' ? 50 : 20
  );

  // Synthesize evidence items from incident and associated risk assessment
  const evidenceItems = useMemo(() => {
    if (!selectedIncident) return [];
    const list: Array<{
      id: string;
      title: string;
      category: 'AUDIO' | 'ACOUSTIC' | 'SPEAKER' | 'SEMANTIC' | 'POLICY';
      source: string;
      modelVersion?: string;
      confidence?: number;
      details: string | string[];
      hash?: string;
      timestamp?: string;
    }> = [];

    // 1. Explicit incident evidence references
    if (selectedIncident.evidenceReferences && selectedIncident.evidenceReferences.length > 0) {
      selectedIncident.evidenceReferences.forEach((ref, idx) => {
        list.push({
          id: ref.id || `ev-ref-${idx}`,
          title: ref.type.replace(/_/g, ' '),
          category: ref.type.includes('TRANSCRIPT') ? 'SEMANTIC' : 'AUDIO',
          source: 'Incident Evidence Registry',
          details: ref.description,
          hash: ref.hash,
        });
      });
    }

    // 2. Multi-modal detector evidence from risk provenance
    if (associatedRisk?.dimension_provenance) {
      Object.entries(associatedRisk.dimension_provenance).forEach(([dimKey, prov]) => {
        if (prov.status === 'AVAILABLE' && prov.score > 10) {
          const meta = DIMENSION_METADATA[dimKey];
          let cat: 'ACOUSTIC' | 'SPEAKER' | 'SEMANTIC' | 'POLICY' = 'SEMANTIC';
          if (dimKey === 'deepfake_synthetic' || dimKey === 'replay_injection') cat = 'ACOUSTIC';
          else if (dimKey === 'identity_impersonation') cat = 'SPEAKER';

          list.push({
            id: `prov-${dimKey}`,
            title: `${meta?.label || dimKey.replace(/_/g, ' ')} Detection`,
            category: cat,
            source: prov.source_detector,
            modelVersion: prov.model_version,
            confidence: prov.confidence,
            details: prov.evidence.length > 0 ? prov.evidence : `Elevated risk factor: score ${prov.score}/100`,
            timestamp: prov.timestamp,
          });
        }
      });
    }

    // 3. Evidence graph primary findings
    if (associatedRisk?.evidence_graph?.primary_findings) {
      associatedRisk.evidence_graph.primary_findings.forEach((finding, idx) => {
        if (!list.some((i) => i.details === finding || (Array.isArray(i.details) && i.details.includes(finding)))) {
          list.push({
            id: `graph-finding-${idx}`,
            title: 'Neural Cross-Modal Finding',
            category: 'ACOUSTIC',
            source: 'Multi-Modal Risk Fusion Graph',
            details: finding,
          });
        }
      });
    }

    // 4. Policy triggers
    if (selectedIncident.triggeredPolicies && selectedIncident.triggeredPolicies.length > 0) {
      selectedIncident.triggeredPolicies.forEach((pol, idx) => {
        list.push({
          id: `policy-${idx}`,
          title: `Deterministic Policy Violation: ${pol}`,
          category: 'POLICY',
          source: 'Sentinel Deterministic Policy Engine',
          details: `Enforcement rule matched against detected conversational intent or acoustic anomalies.`,
        });
      });
    }

    return list;
  }, [selectedIncident, associatedRisk]);

  // Accessibility: Close evidence modal on Escape key
  useEffect(() => {
    if (!selectedEvidenceDetail) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedEvidenceDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvidenceDetail]);

  return (
    <div className="flex h-screen bg-background text-primaryText overflow-hidden font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Navbar
          title="Incident Response & Investigation Workspace"
          subtitle="Forensic evidence analysis, multi-modal risk decomposition, and audited containment"
        />

        <main className="p-4 md:p-6 space-y-5 max-w-[1600px] w-full mx-auto">
          {/* ACTION FEEDBACK TOAST */}
          {actionFeedback && (
            <div className="p-3 rounded bg-success/15 border border-success/30 text-success text-xs flex items-center justify-between font-sans shadow-subtle">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">{actionFeedback}</span>
              </span>
              <button
                onClick={() => setActionFeedback(null)}
                className="text-mutedText hover:text-primaryText font-sans text-xs px-1"
                aria-label="Dismiss feedback"
              >
                ✕
              </button>
            </div>
          )}

          {/* LEVEL 1: GLOBAL INVESTIGATION HEADER */}
          <header className="panel-enterprise p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 border-l-4 border-l-primary">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-primary" />
                <h1 className="text-xs sm:text-sm md:text-base font-bold tracking-tight text-primaryText uppercase font-mono whitespace-nowrap">
                  INVESTIGATION
                </h1>
                {selectedIncident && (
                  <span className="text-xs sm:text-sm font-bold font-mono text-primaryText px-2 py-0.5 rounded bg-surface-elevated border border-border">
                    {selectedIncident.incidentNumber}
                  </span>
                )}
              </div>

              <div className="h-4 w-px bg-border hidden sm:block" />

              {/* Severity Pill */}
              {selectedIncident && (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] sm:text-xs font-mono font-bold border whitespace-nowrap ${
                      selectedIncident.severity === 'CRITICAL'
                        ? 'bg-danger/20 text-danger border-danger/40'
                        : selectedIncident.severity === 'HIGH'
                        ? 'bg-warning/20 text-warning border-warning/40'
                        : 'bg-primary/20 text-primary border-primary/30'
                    }`}
                  >
                    <ShieldAlert className="w-3 h-3" />
                    <span>{selectedIncident.severity} SEVERITY</span>
                  </span>
                </div>
              )}

              {/* Status Pill */}
              {selectedIncident && (
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono bg-surface-elevated px-2.5 py-0.5 sm:py-1 rounded border border-border whitespace-nowrap">
                  <span className="text-mutedText">STATUS:</span>
                  <span
                    className={`font-bold uppercase ${
                      selectedIncident.status === 'OPEN'
                        ? 'text-danger'
                        : selectedIncident.status === 'INVESTIGATING'
                        ? 'text-warning'
                        : selectedIncident.status === 'CONTAINED'
                        ? 'text-primary'
                        : 'text-success'
                    }`}
                  >
                    {selectedIncident.status.replace(/_/g, ' ')}
                  </span>
                </div>
              )}

              {/* Detected Timestamp */}
              {selectedIncident && (
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono text-secondaryText bg-surface-elevated px-2.5 py-0.5 sm:py-1 rounded border border-border whitespace-nowrap">
                  <Clock className="w-3 h-3 text-mutedText" />
                  <span className="text-mutedText hidden md:inline">DETECTED:</span>
                  <span className="text-primaryText font-medium">
                    {formatSafeDateTime(selectedIncident.detectedAt)}
                  </span>
                </div>
              )}

              {/* Associated Session Reference */}
              {selectedIncident?.callId && (
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono text-secondaryText bg-surface-elevated px-2.5 py-0.5 sm:py-1 rounded border border-border whitespace-nowrap">
                  <PhoneCall className="w-3 h-3 text-mutedText" />
                  <span className="text-mutedText">CALL:</span>
                  <span className="text-primaryText font-semibold">
                    {associatedCall?.callerIdentifier || selectedIncident.callId.slice(0, 8)}
                  </span>
                </div>
              )}
            </div>

            {/* Officer Quick Actions Toolbar */}
            <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
              <Link
                href="/calls"
                className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1.5 font-sans"
                title="Navigate to Live Voice Sessions"
              >
                <Radio className="w-3.5 h-3.5 text-primary" />
                <span>Live Calls</span>
              </Link>

              <Link
                href="/verification"
                className="btn-primary py-1 px-3 text-xs flex items-center gap-1.5 font-sans"
                title="Dispatch Out-of-Band Step-Up Challenge"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Step-Up Auth</span>
              </Link>
            </div>
          </header>

          {/* MAIN INVESTIGATION LAYOUT */}
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: CASE DIRECTORY & QUEUE (Desktop: col-3, Mobile: order-2) */}
            <div className="order-2 lg:order-1 w-full lg:col-span-4 xl:col-span-3 space-y-3">
              <div className="panel-enterprise p-3 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
                      CASE DIRECTORY
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-[11px] font-mono text-secondaryText">
                      {filteredIncidents.length}
                    </span>
                  </div>
                  <button
                    onClick={fetchIncidents}
                    className="p-1 rounded hover:bg-surface-elevated text-mutedText hover:text-primaryText transition-colors"
                    title="Refresh incidents"
                  >
                    <Clock className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
                  </button>
                </div>

                {/* Search & Filter Controls */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-mutedText absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search case number, threat..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input-enterprise pl-8 w-full text-xs font-sans"
                    />
                  </div>

                  {/* Severity Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                      <button
                        key={sev}
                        onClick={() => setFilterSeverity(sev)}
                        className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium transition-colors ${
                          filterSeverity === sev
                            ? 'bg-primary text-white'
                            : 'bg-surface-elevated text-secondaryText hover:bg-surface-hover border border-border'
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>

                  {/* Status Filter Dropdown */}
                  <div className="flex items-center gap-2 text-xs font-sans pt-1">
                    <span className="text-[11px] text-mutedText">Status:</span>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="select-enterprise py-0.5 text-[11px] flex-1"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="OPEN">Open</option>
                      <option value="INVESTIGATING">Investigating</option>
                      <option value="CONTAINED">Contained</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="FALSE_POSITIVE">False Positive</option>
                    </select>
                  </div>
                </div>

                {/* Dense Incident Rows */}
                <div className="space-y-1.5 max-h-[380px] lg:max-h-[560px] overflow-y-auto pr-0.5">
                  {loading && incidents.length === 0 ? (
                    <div className="py-12 text-center text-xs text-mutedText font-mono">
                      Loading investigation queue...
                    </div>
                  ) : filteredIncidents.length === 0 ? (
                    <div className="py-12 text-center text-mutedText font-sans text-xs space-y-1">
                      <FileSearch className="w-6 h-6 text-mutedText mx-auto opacity-40" />
                      <p className="font-medium text-secondaryText">NO INCIDENTS MATCH FILTER</p>
                      <p className="text-[11px]">Adjust your severity or status filters to view cases.</p>
                    </div>
                  ) : (
                    filteredIncidents.map((inc) => {
                      const isSelected = selectedIncident?.id === inc.id;
                      return (
                        <div
                          key={inc.id}
                          onClick={() => setSelectedIncident(inc)}
                          className={`p-2.5 rounded border transition-all cursor-pointer select-none text-xs ${
                            isSelected
                              ? 'bg-surface-elevated border-primary text-primaryText shadow-subtle'
                              : 'bg-surface/60 border-border hover:bg-surface-elevated/70 text-secondaryText'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-xs truncate text-primaryText">
                              {inc.incidentNumber}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                                inc.severity === 'CRITICAL'
                                  ? 'bg-danger/20 text-danger border border-danger/40'
                                  : inc.severity === 'HIGH'
                                  ? 'bg-warning/20 text-warning border border-warning/40'
                                  : 'bg-primary/20 text-primary border border-primary/30'
                              }`}
                            >
                              {inc.severity}
                            </span>
                          </div>

                          <p className="text-[11px] text-secondaryText line-clamp-2 mt-1 font-sans">
                            {inc.summary}
                          </p>

                          <div className="flex items-center justify-between text-[10px] text-mutedText mt-1.5 font-mono">
                            <span className="capitalize">{inc.status.toLowerCase().replace(/_/g, ' ')}</span>
                            <span>{formatSafeTime(inc.detectedAt)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* OPERATIONAL RESPONSE & AUDIT TIMELINE */}
              <ResponseTimeline events={selectedIncident?.events || []} className="max-h-[350px]" />
            </div>

            {/* RIGHT / MAIN COLUMN: CASE INVESTIGATION DOSSIER (Desktop: col-9, Mobile: order-1) */}
            <div className="order-1 lg:order-2 w-full lg:col-span-8 xl:col-span-9 space-y-5">
              {selectedIncident ? (
                <>
                  {/* LEVEL 2: EXECUTIVE THREAT & RISK COMMAND PANEL */}
                  <section
                    aria-label="Executive Case Threat Summary"
                    className={`panel-enterprise p-4 rounded-lg transition-all ${
                      selectedIncident.severity === 'CRITICAL'
                        ? 'border-danger/60 bg-danger/5 shadow-subtle'
                        : selectedIncident.severity === 'HIGH'
                        ? 'border-warning/60 bg-warning/5'
                        : 'border-border bg-surface'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Risk Score & Threat Level */}
                      <div className="md:col-span-4 flex items-center gap-4 border-b md:border-b-0 md:border-r border-border pb-3 md:pb-0 md:pr-4">
                        <div
                          className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center border font-mono font-extrabold ${
                            selectedIncident.severity === 'CRITICAL'
                              ? 'bg-danger/20 border-danger text-danger'
                              : selectedIncident.severity === 'HIGH'
                              ? 'bg-warning/20 border-warning text-warning'
                              : 'bg-primary/20 border-primary text-primary'
                          }`}
                        >
                          <span className="text-2xl leading-none">
                            {associatedRisk?.overall_risk_score !== null && associatedRisk?.overall_risk_score !== undefined
                              ? Math.round(associatedRisk.overall_risk_score)
                              : selectedIncident.severity === 'CRITICAL'
                              ? 95
                              : 75}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider mt-0.5 opacity-80">/ 100</span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider text-mutedText font-semibold block font-mono">
                            CASE THREAT VERDICT
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${
                                selectedIncident.severity === 'CRITICAL'
                                  ? 'badge-danger'
                                  : selectedIncident.severity === 'HIGH'
                                  ? 'badge-warning'
                                  : 'badge-primary'
                              }`}
                            >
                              {selectedIncident.severity} SEVERITY
                            </span>
                          </div>
                          <span className="text-[11px] text-secondaryText block font-mono">
                            Status: <strong className="text-primaryText uppercase">{selectedIncident.status}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Primary Threat Classification & Case Summary */}
                      <div className="md:col-span-5 space-y-1 md:px-2">
                        <span className="text-[10px] uppercase tracking-wider text-mutedText font-semibold block font-mono">
                          ATTACK CLASSIFICATION
                        </span>
                        <h3 className="text-xs md:text-sm font-semibold text-primaryText leading-snug">
                          {selectedIncident.attackClassification}
                        </h3>
                        <p className="text-xs text-secondaryText line-clamp-2">
                          {selectedIncident.summary}
                        </p>
                      </div>

                      {/* Enforced Policy & Recommended Action */}
                      <div className="md:col-span-3 flex flex-col justify-center bg-surface-elevated p-3 rounded border border-border">
                        <span className="text-[10px] uppercase tracking-wider text-mutedText font-semibold font-mono">
                          GOVERNING POLICY
                        </span>
                        <div className="mt-1">
                          <span className="text-xs font-mono font-bold text-primaryText block truncate">
                            {selectedIncident.triggeredPolicies[0] || 'POL-INCIDENT-CONTAIN'}
                          </span>
                          <span
                            className={`text-[11px] font-mono font-semibold block mt-0.5 ${
                              selectedIncident.severity === 'CRITICAL' ? 'text-danger' : 'text-warning'
                            }`}
                          >
                            {selectedIncident.actionsTaken[0] || 'REQUIRE_STEP_UP_VERIFICATION'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* LEVEL 3: ASSOCIATED VOICE SESSION & SUBJECT CONTEXT */}
                  {selectedIncident.callId && (
                    <section aria-label="Associated Voice Session" className="panel-enterprise p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="w-4 h-4 text-primary" />
                          <h3 className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
                            ASSOCIATED VOICE SESSION & CALL CONTEXT
                          </h3>
                        </div>
                        <Link
                          href={`/calls`}
                          className="text-xs text-primary hover:underline flex items-center gap-1 font-mono"
                        >
                          <span>Open Live Calls</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                        <div className="p-2.5 rounded bg-surface-elevated border border-border">
                          <span className="text-[10px] text-mutedText block">CALLER NUMBER</span>
                          <span className="text-primaryText font-bold text-xs mt-0.5 block truncate">
                            {associatedCall?.callerIdentifier || selectedIncident.callId}
                          </span>
                        </div>

                        <div className="p-2.5 rounded bg-surface-elevated border border-border">
                          <span className="text-[10px] text-mutedText block">GATEWAY / CHANNEL</span>
                          <span className="text-primaryText font-bold text-xs mt-0.5 block truncate">
                            {associatedCall?.callerDisplayName || 'Telephony Gateway (PSTN/SIP)'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded bg-surface-elevated border border-border">
                          <span className="text-[10px] text-mutedText block">CALL DURATION</span>
                          <span className="text-primaryText font-bold text-xs mt-0.5 block">
                            {associatedCall?.durationSeconds
                              ? `${Math.floor(associatedCall.durationSeconds / 60)}m ${associatedCall.durationSeconds % 60}s`
                              : 'Session Concluded'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded bg-surface-elevated border border-border">
                          <span className="text-[10px] text-mutedText block">CALL STATUS</span>
                          <span className="text-primaryText font-bold text-xs mt-0.5 block uppercase">
                            {associatedCall?.status || 'FLAGGED'}
                          </span>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* LEVEL 4: EVIDENCE-FIRST WORKSPACE (WHAT → EVIDENCE → IMPACT) */}
                  <section aria-label="Forensic Evidence Workspace" className="panel-enterprise overflow-hidden">
                    <div className="p-3 bg-surface-elevated/60 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
                          CORROBORATED FORENSIC EVIDENCE ({evidenceItems.length} SIGNALS RECORDED)
                        </h3>
                      </div>
                      <span className="text-[10px] text-mutedText font-mono">
                        Select an item to inspect technical provenance
                      </span>
                    </div>

                    <div className="p-4 space-y-2.5 text-xs font-sans">
                      {evidenceItems.length === 0 ? (
                        <div className="py-8 text-center text-mutedText text-xs font-mono">
                          No secondary forensic evidence registered for this case record.
                        </div>
                      ) : (
                        evidenceItems.map((item) => (
                          <div
                            key={item.id}
                            onClick={() =>
                              setSelectedEvidenceDetail({
                                id: item.id,
                                title: item.title,
                                category: item.category,
                                source: item.source,
                                modelVersion: item.modelVersion,
                                confidence: item.confidence,
                                details: item.details,
                                hash: item.hash,
                                timestamp: item.timestamp,
                              })
                            }
                            className="p-3 rounded border border-border bg-surface-elevated/40 hover:bg-surface-elevated hover:border-primary/40 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 font-mono text-xs">
                                <span className="font-bold text-primaryText">{item.title}</span>
                                <span className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px] text-secondaryText">
                                  {item.category}
                                </span>
                              </div>
                              <p className="text-xs text-secondaryText line-clamp-2">
                                {Array.isArray(item.details) ? item.details.join(' • ') : item.details}
                              </p>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center font-mono text-xs">
                              {item.confidence !== undefined && (
                                <span className="text-secondaryText text-[11px]">
                                  Conf: <strong className="text-primaryText">{formatPercentage(item.confidence)}</strong>
                                </span>
                              )}
                              <span className="text-primary hover:underline text-[11px] font-medium flex items-center gap-1">
                                <span>Inspect</span>
                                <ArrowRight className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {/* LEVEL 5: 10D MULTI-MODAL RISK FUSION MATRIX (DETECTION SIGNALS) */}
                  <section aria-label="10D Risk Fusion Matrix" className="panel-enterprise overflow-hidden">
                    <div className="p-3 bg-surface-elevated/60 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-primaryText font-mono">
                          10-DIMENSIONAL MULTI-MODAL RISK MATRIX
                        </h3>
                      </div>
                      <span className="text-[10px] text-mutedText font-mono">
                        Latency: {associatedRisk?.fusion_latency_ms ? `${associatedRisk.fusion_latency_ms.toFixed(1)}ms` : '6.4ms'}
                      </span>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="grid grid-cols-12 px-2 py-1 border-b border-border text-[10px] font-medium text-mutedText uppercase tracking-wider font-mono">
                        <div className="col-span-5 sm:col-span-4">Dimension & Model</div>
                        <div className="col-span-4 sm:col-span-5">Detector Provenance & Evidence</div>
                        <div className="col-span-3 text-right">Score / 100</div>
                      </div>

                      <div className="divide-y divide-border/40 text-xs font-sans">
                        {Object.entries(DIMENSION_METADATA).map(([key, meta]) => {
                          const prov = associatedRisk?.dimension_provenance?.[key];
                          const scoreVal =
                            typeof prov?.score === 'number'
                              ? prov.score
                              : typeof associatedRisk?.dimensions?.[key] === 'number'
                              ? (associatedRisk.dimensions[key] as number)
                              : 0;

                          const s = getRiskSeverity(scoreVal);
                          const isHigh = scoreVal >= 50;

                          return (
                            <div
                              key={key}
                              className={`grid grid-cols-12 px-2 py-2.5 items-center transition-colors ${
                                isHigh ? 'bg-danger/5' : 'hover:bg-surface-elevated/30'
                              }`}
                            >
                              <div className="col-span-5 sm:col-span-4 min-w-0 pr-2">
                                <span className="font-bold text-xs text-primaryText font-mono block truncate">
                                  {meta.label}
                                </span>
                                <span className="text-[10px] text-mutedText font-mono block mt-0.5 truncate">
                                  {prov?.model_version || meta.model}
                                </span>
                              </div>

                              <div className="col-span-4 sm:col-span-5 min-w-0 pr-2">
                                <span className="text-xs text-secondaryText line-clamp-1">
                                  {prov?.evidence?.[0] || meta.desc}
                                </span>
                              </div>

                              <div className="col-span-3 text-right font-mono flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden border border-border hidden sm:block">
                                  <div
                                    className={`h-full ${
                                      scoreVal >= 80 ? 'bg-danger' : scoreVal >= 50 ? 'bg-warning' : 'bg-success'
                                    }`}
                                    style={{ width: `${Math.min(100, scoreVal)}%` }}
                                  />
                                </div>
                                <span className={`font-bold text-xs ${s.textClass}`}>
                                  {Math.round(scoreVal)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>

                  {/* LEVEL 6: OPERATIONAL INCIDENT RESPONSE & OFFICER COMMAND CENTER */}
                  <section aria-label="Officer Incident Response Command Center" className="space-y-4">
                    <OfficerActionPanel
                      incidentId={selectedIncident.id}
                      incidentNumber={selectedIncident.incidentNumber}
                      callId={selectedIncident.callId}
                      status={selectedIncident.status}
                      severity={selectedIncident.severity}
                      governingPolicy={selectedIncident.triggeredPolicies[0] || 'POL-CRED-001'}
                      recommendedAction={selectedIncident.actionsTaken[0] || 'REQUIRE_STEP_UP_VERIFICATION'}
                      attackClassification={selectedIncident.attackClassification}
                      actionsTaken={selectedIncident.actionsTaken}
                      activeIntervention={interventions[0]}
                      actionLoading={actionLoading}
                      onInitiateAction={handleInitiateAction}
                      onInterventionDecision={handleInterventionDecision}
                    />

                    {/* OUT-OF-BAND VERIFICATION CHALLENGE MANAGEMENT */}
                    {verifications.length > 0 ? (
                      <VerificationStatusCard
                        verification={verifications[0]}
                        onResolve={handleResolveVerification}
                        loading={actionLoading}
                      />
                    ) : (
                      <div className="p-3.5 rounded-lg border border-dashed border-border bg-surface-elevated/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-secondaryText shrink-0" />
                          <span className="text-secondaryText">
                            OUT-OF-BAND VERIFICATION: No active challenge registered for this session.
                          </span>
                        </div>
                        <button
                          onClick={() => handleInitiateAction('TRIGGER_VERIFICATION')}
                          disabled={actionLoading || !selectedIncident.callId}
                          className="btn-secondary py-1 px-3 text-xs flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                        >
                          <span>Initiate Challenge</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <EmptyState
                  title="No Incident Case Selected"
                  description="Select a security incident from the left case directory to inspect evidence, multi-modal risk tensors, and audit trails."
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {/* EVIDENCE DETAIL MODAL / DRAWER */}
      {selectedEvidenceDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="panel-enterprise max-w-xl w-full p-5 space-y-4 shadow-elevated border-primary/40 bg-surface">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2 font-mono">
                <FileSearch className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-primaryText uppercase">
                  EVIDENCE PROVENANCE INSPECTOR
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvidenceDetail(null)}
                className="p-1 rounded hover:bg-surface-elevated text-mutedText hover:text-primaryText"
                aria-label="Close evidence inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded bg-surface-elevated border border-border space-y-2">
                <div>
                  <span className="text-[10px] text-mutedText uppercase block">EVIDENCE TITLE</span>
                  <span className="font-bold text-sm text-primaryText mt-0.5 block">
                    {selectedEvidenceDetail.title}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60 text-[11px]">
                  <div>
                    <span className="text-mutedText">DETECTOR SOURCE:</span>
                    <span className="text-secondaryText block font-semibold">{selectedEvidenceDetail.source}</span>
                  </div>
                  <div>
                    <span className="text-mutedText">MODEL VERSION:</span>
                    <span className="text-secondaryText block font-semibold">
                      {selectedEvidenceDetail.modelVersion || 'Standard Neural Pipeline'}
                    </span>
                  </div>
                  {selectedEvidenceDetail.confidence !== undefined && (
                    <div>
                      <span className="text-mutedText">CONFIDENCE:</span>
                      <span className="text-primaryText block font-bold">
                        {formatPercentage(selectedEvidenceDetail.confidence)}
                      </span>
                    </div>
                  )}
                  {selectedEvidenceDetail.timestamp && (
                    <div>
                      <span className="text-mutedText">TIMESTAMP:</span>
                      <span className="text-secondaryText block">
                        {formatSafeTime(selectedEvidenceDetail.timestamp)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-mutedText uppercase font-semibold block">
                  TECHNICAL FINDING / EVIDENCE OBSERVATION
                </span>
                <div className="p-3 rounded bg-surface-elevated/60 border border-border text-secondaryText text-xs font-sans leading-relaxed">
                  {Array.isArray(selectedEvidenceDetail.details) ? (
                    <ul className="list-disc list-inside space-y-1">
                      {selectedEvidenceDetail.details.map((d, i) => (
                        <li key={i} className="text-primaryText">
                          {d}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-primaryText">{selectedEvidenceDetail.details}</p>
                  )}
                </div>
              </div>

              {selectedEvidenceDetail.hash && (
                <div className="p-2.5 rounded bg-surface-elevated border border-border flex items-center justify-between text-[10px]">
                  <span className="text-mutedText">VERIFICATION HASH:</span>
                  <span className="text-secondaryText font-mono truncate max-w-[320px]">
                    {selectedEvidenceDetail.hash}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => setSelectedEvidenceDetail(null)}
                className="btn-secondary py-1.5 px-4 text-xs font-sans"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONSEQUENTIAL OFFICER ACTION CONFIRMATION MODAL */}
      {confirmModalOpen && pendingActionType && selectedIncident && (
        <ActionConfirmationModal
          isOpen={confirmModalOpen}
          actionType={pendingActionType}
          incidentNumber={selectedIncident.incidentNumber}
          incidentSeverity={selectedIncident.severity}
          governingPolicy={selectedIncident.triggeredPolicies[0] || 'POL-CRED-001'}
          currentStatus={selectedIncident.status}
          loading={actionLoading}
          onConfirm={(notes) => handleExecuteConfirmedAction(pendingActionType, notes)}
          onCancel={() => {
            setConfirmModalOpen(false);
            setPendingActionType(null);
            setPendingInterventionDecision(null);
          }}
        />
      )}
    </div>
  );
}
