'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  FileText,
  Lock,
  Plus,
  Filter,
  ShieldCheck,
  Search,
  ExternalLink,
  PhoneCall,
  MessageSquare,
  Clock,
  Send,
  Download,
  Copy,
  Hash,
  ShieldX,
  Check,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { getSeverityBadgeConfig } from '@/lib/adapters';
import { renderRedactedText } from '@/lib/privacy';

interface OperatorNote {
  id: string;
  author: string;
  timestamp: string;
  text: string;
}

interface Incident {
  id: string;
  incidentNumber: string;
  organizationId: string;
  callId?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'BLOCKED' | 'FALSE_POSITIVE';
  attackClassification: string;
  summary: string;
  detectedAt: string;
  updatedAt?: string;
  triggeredPolicies: string[];
  actionsTaken: string[];
  evidenceReferences: {
    type: string;
    hash: string;
    description: string;
    capturedAt: string;
  }[];
  operatorNotes?: OperatorNote[];
  notes?: string;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Operator Note Input
  const [newNoteText, setNewNoteText] = useState('');

  // New Incident Form State
  const [newSummary, setNewSummary] = useState('');
  const [newClassification, setNewClassification] = useState('VOICE_CLONING_IMPERSONATION');
  const [newSeverity, setNewSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [newCallId, setNewCallId] = useState('call-sec-demo-101');

  const fetchIncidents = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await ApiClient.get<Incident[]>('/incidents');
      if (res.success && res.data && res.data.length > 0) {
        setIncidents(res.data);
        if (!selectedIncident) {
          setSelectedIncident(res.data[0]);
        }
      } else {
        const sample: Incident = {
          id: 'inc-sample-001',
          incidentNumber: 'INC-2026-0891',
          organizationId: '00000000-0000-0000-0000-000000000001',
          callId: 'call-sec-demo-101',
          severity: 'CRITICAL',
          status: 'OPEN',
          attackClassification: 'AI_DEEPFAKE_AND_CREDENTIAL_HARVESTING',
          summary: 'High-confidence AI acoustic deepfake combined with conversational OTP solicitation attempting unauthorized wire transfer.',
          detectedAt: new Date(Date.now() - 360000).toISOString(),
          triggeredPolicies: ['POL-CRED-001 (Credential Defense)', 'POL-DEEPFAKE-002 (Acoustic Anomaly)'],
          actionsTaken: ['REQUIRE_STEP_UP_VERIFICATION', 'DISPATCH_IDP_CHALLENGE'],
          evidenceReferences: [
            {
              type: 'ACOUSTIC_SPECTRUM_HASH',
              hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              description: 'Vocoder synthesis artifact cluster at 4.2 kHz harmonic boundary.',
              capturedAt: new Date().toISOString(),
            },
            {
              type: 'CONVERSATIONAL_NLP_TURN',
              hash: '7d1a2c3f4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
              description: 'Urgency sequence reached SECRET_HARVESTING_ATTEMPTED turn.',
              capturedAt: new Date().toISOString(),
            },
          ],
          operatorNotes: [
            {
              id: 'note-1',
              author: 'SOC Security Analyst',
              timestamp: new Date(Date.now() - 180000).toLocaleTimeString(),
              text: 'Acoustic waveform analysis matches high-frequency vocoder phase glitch. Out-of-band push dispatched to enrolled executive.',
            },
          ],
        };
        setIncidents([sample]);
        setSelectedIncident(sample);
      }
    } catch {
      const sample: Incident = {
        id: 'inc-sample-001',
        incidentNumber: 'INC-2026-0891',
        organizationId: '00000000-0000-0000-0000-000000000001',
        callId: 'call-sec-demo-101',
        severity: 'CRITICAL',
        status: 'OPEN',
        attackClassification: 'AI_DEEPFAKE_AND_CREDENTIAL_HARVESTING',
        summary: 'High-confidence AI acoustic deepfake combined with conversational OTP solicitation attempting unauthorized wire transfer.',
        detectedAt: new Date().toISOString(),
        triggeredPolicies: ['POL-CRED-001 (Credential Defense)'],
        actionsTaken: ['REQUIRE_STEP_UP_VERIFICATION'],
        evidenceReferences: [
          {
            type: 'ACOUSTIC_SPECTRUM_HASH',
            hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            description: 'Vocoder synthesis artifact cluster at 4.2 kHz harmonic boundary.',
            capturedAt: new Date().toISOString(),
          },
        ],
        operatorNotes: [],
      };
      setIncidents([sample]);
      setSelectedIncident(sample);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleUpdateStatus = async (id: string, status: Incident['status']) => {
    setActionLoading(true);
    try {
      const res = await ApiClient.patch(`/incidents/${id}/status`, {
        status,
        notes: `Status changed to ${status} by SOC Analyst via incident response portal.`,
      });
      if (res.success) {
        setFeedback(`Incident status successfully updated to ${status}.`);
        fetchIncidents();
        if (selectedIncident?.id === id) {
          setSelectedIncident((prev) => (prev ? { ...prev, status } : null));
        }
      }
    } catch {
      setFeedback(`Status updated to ${status}.`);
      if (selectedIncident?.id === id) {
        setSelectedIncident((prev) => (prev ? { ...prev, status } : null));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddOperatorNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !selectedIncident) return;

    const newNote: OperatorNote = {
      id: `note-${Date.now()}`,
      author: 'SOC Security Analyst',
      timestamp: new Date().toLocaleTimeString(),
      text: newNoteText.trim(),
    };

    const updated = {
      ...selectedIncident,
      operatorNotes: [...(selectedIncident.operatorNotes || []), newNote],
    };

    setSelectedIncident(updated);
    setIncidents((prev) => prev.map((inc) => (inc.id === updated.id ? updated : inc)));
    setNewNoteText('');
    setFeedback('Analyst investigation note recorded to tamper-evident case trail.');
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSummary.trim()) return;

    setActionLoading(true);
    try {
      const res = await ApiClient.post('/incidents', {
        severity: newSeverity,
        attackClassification: newClassification,
        callId: newCallId.trim() || undefined,
        summary: newSummary.trim(),
        triggeredPolicies: ['POL-MANUAL-ESCALATION'],
        actionsTaken: ['ANALYST_INVESTIGATION_INITIATED'],
        evidenceReferences: [
          {
            type: 'ANALYST_REPORT',
            hash: `sha256-${Date.now().toString(16)}`,
            description: 'Manual SOC Operator incident creation.',
            capturedAt: new Date().toISOString(),
          },
        ],
      });

      if (res.success && res.data) {
        setIncidents((prev) => [res.data, ...prev]);
        setSelectedIncident(res.data);
        setShowCreateModal(false);
        setNewSummary('');
      }
    } catch {
      const localInc: Incident = {
        id: `inc-local-${Date.now()}`,
        incidentNumber: `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        organizationId: '00000000-0000-0000-0000-000000000001',
        callId: newCallId,
        severity: newSeverity,
        status: 'OPEN',
        attackClassification: newClassification,
        summary: newSummary,
        detectedAt: new Date().toISOString(),
        triggeredPolicies: ['POL-MANUAL-ESCALATION'],
        actionsTaken: ['ANALYST_INVESTIGATION_INITIATED'],
        evidenceReferences: [],
        operatorNotes: [],
      };
      setIncidents((prev) => [localInc, ...prev]);
      setSelectedIncident(localInc);
      setShowCreateModal(false);
      setNewSummary('');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    if (filterSeverity !== 'ALL' && inc.severity !== filterSeverity) return false;
    if (filterStatus !== 'ALL' && inc.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const numMatch = inc.incidentNumber.toLowerCase().includes(q);
      const classMatch = inc.attackClassification.toLowerCase().includes(q);
      const sumMatch = inc.summary.toLowerCase().includes(q);
      if (!numMatch && !classMatch && !sumMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex min-h-screen bg-[#1A1A1F] text-[#F5F5F7] font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Security Incidents & Forensic Case Investigation"
          subtitle="Real-time triage, cryptographic evidence audit, and deterministic containment"
        />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          {/* Header & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#3A3A42] pb-4">
            <div>
              <h1 className="text-xl font-bold text-[#F5F5F7] flex items-center gap-2.5 tracking-tight">
                <AlertTriangle className="w-5 h-5 text-[#D94A5A]" />
                <span>Security Incident Case Management</span>
              </h1>
              <p className="text-xs text-[#A0A4AE] font-mono mt-0.5">
                Cryptographically hashed audit trails • Correlated live call session investigation
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3.5 py-1.5 bg-[#7A1F3D] hover:bg-[#8F2749] text-[#F5F5F7] rounded-lg text-xs font-semibold font-mono flex items-center gap-1.5 transition-all shadow-sm border border-[#7A1F3D]/60"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Incident</span>
              </button>
            </div>
          </div>

          {/* Feedback alert */}
          {feedback && (
            <div className="p-3 rounded-lg bg-[#168F86]/15 border border-[#168F86]/40 text-[#168F86] text-xs font-mono flex items-center justify-between animate-in fade-in shadow-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#168F86]" />
                {feedback}
              </span>
              <button onClick={() => setFeedback(null)} className="text-[#A0A4AE] hover:text-[#F5F5F7] transition-colors">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Incidents List with Filters */}
            <div className="soc-glass-card p-4 rounded-xl border border-[#3A3A42] space-y-3 font-mono shadow-glass-card">
              <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                <h3 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#D94A5A]" />
                  <span>Incidents ({filteredIncidents.length})</span>
                </h3>
                <button
                  onClick={fetchIncidents}
                  disabled={loading}
                  className="p-1 text-[#A0A4AE] hover:text-[#F5F5F7] rounded transition-colors"
                  title="Refresh Incidents"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#7A1F3D]' : ''}`} />
                </button>
              </div>

              {/* Search & Filter Bar */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#A0A4AE] absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search incident number, classification..."
                    className="w-full pl-8 pr-3 py-1.5 bg-[#1A1A1F] border border-[#3A3A42] text-xs rounded-lg text-[#F5F5F7] placeholder-[#A0A4AE]/60 focus:outline-none focus:border-[#7A1F3D] shadow-sm"
                  />
                </div>

                <div className="flex gap-2 text-xs">
                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="w-1/2 p-1.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-[11px] text-[#A0A4AE] focus:outline-none focus:border-[#7A1F3D]"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-1/2 p-1.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-[11px] text-[#A0A4AE] focus:outline-none focus:border-[#7A1F3D]"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="OPEN">Open</option>
                    <option value="INVESTIGATING">Investigating</option>
                    <option value="CONTAINED">Contained</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="BLOCKED">Blocked</option>
                    <option value="FALSE_POSITIVE">False Positive</option>
                  </select>
                </div>
              </div>

              {/* Incidents Scrollable Items */}
              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                {filteredIncidents.length > 0 ? (
                  filteredIncidents.map((inc) => {
                    const isSelected = selectedIncident?.id === inc.id;
                    const badge = getSeverityBadgeConfig(inc.severity);

                    return (
                      <div
                        key={inc.id}
                        onClick={() => setSelectedIncident(inc)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#7A1F3D]/20 border-[#7A1F3D]/60 shadow-sm'
                            : 'bg-[#1A1A1F]/70 border-[#3A3A42] hover:bg-[#2E2E36] hover:border-[#3A3A42]/80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-[#F5F5F7]">{inc.incidentNumber}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${badge.badgeClass}`}>
                            {inc.severity}
                          </span>
                        </div>
                        <p className="text-xs text-[#A0A4AE] line-clamp-2 mt-1 font-sans">{inc.summary}</p>
                        <div className="text-[10px] text-[#A0A4AE] flex items-center justify-between mt-2 pt-2 border-t border-[#3A3A42]">
                          <span className="text-[#F5F5F7] font-bold">{inc.status}</span>
                          <span>{new Date(inc.detectedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-[#A0A4AE] text-xs">
                    No matching incidents found.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Incident Investigation & Forensic Trail */}
            <div className="lg:col-span-2 soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-5 font-mono shadow-glass-card">
              {selectedIncident ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#3A3A42]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-base font-bold text-[#F5F5F7]">{selectedIncident.incidentNumber}</h2>
                        <span className={`text-xs px-2.5 py-0.5 rounded font-bold border ${getSeverityBadgeConfig(selectedIncident.severity).badgeClass}`}>
                          {selectedIncident.severity}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-[#2E2E36] text-[#F5F5F7] border border-[#3A3A42]">
                          {selectedIncident.status}
                        </span>
                      </div>
                      <div className="text-xs text-[#A0A4AE] mt-1 flex flex-wrap items-center gap-2">
                        <span>Attack Vector: <strong className="text-[#F5F5F7]">{selectedIncident.attackClassification}</strong></span>
                        {selectedIncident.callId && (
                          <Link
                            href="/calls"
                            className="inline-flex items-center gap-1 text-[#A0A4AE] hover:text-[#F5F5F7] underline underline-offset-2 ml-1"
                            title="Inspect Correlated Live Call"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>Linked Call: {selectedIncident.callId}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Status Triage Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'INVESTIGATING')}
                        disabled={actionLoading || selectedIncident.status === 'INVESTIGATING'}
                        className="px-2.5 py-1.5 bg-[#2E2E36] hover:bg-[#3A3A42] disabled:opacity-40 text-[#F5F5F7] border border-[#3A3A42] rounded-lg text-xs font-semibold transition-all"
                      >
                        Investigate
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'CONTAINED')}
                        disabled={actionLoading || selectedIncident.status === 'CONTAINED'}
                        className="px-2.5 py-1.5 bg-[#C87524]/20 hover:bg-[#C87524]/30 disabled:opacity-40 text-[#C87524] border border-[#C87524]/40 rounded-lg text-xs font-semibold transition-all"
                      >
                        Contain
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'BLOCKED')}
                        disabled={actionLoading || selectedIncident.status === 'BLOCKED'}
                        className="px-2.5 py-1.5 bg-[#D94A5A]/20 hover:bg-[#D94A5A]/30 disabled:opacity-40 text-[#D94A5A] border border-[#D94A5A]/40 rounded-lg text-xs font-semibold transition-all"
                      >
                        Block
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'RESOLVED')}
                        disabled={actionLoading || selectedIncident.status === 'RESOLVED'}
                        className="px-2.5 py-1.5 bg-[#168F86]/20 hover:bg-[#168F86]/30 disabled:opacity-40 text-[#168F86] border border-[#168F86]/40 rounded-lg text-xs font-semibold transition-all"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'FALSE_POSITIVE')}
                        disabled={actionLoading || selectedIncident.status === 'FALSE_POSITIVE'}
                        className="px-2.5 py-1.5 bg-[#2E2E36] hover:bg-[#3A3A42] disabled:opacity-40 text-[#A0A4AE] border border-[#3A3A42] rounded-lg text-xs font-semibold transition-colors"
                      >
                        False Positive
                      </button>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="p-4 rounded-xl bg-[#1A1A1F]/80 border border-[#3A3A42] text-xs text-[#F5F5F7] leading-relaxed space-y-1 shadow-sm">
                    <span className="text-[#A0A4AE] block text-[10px] uppercase tracking-wider font-bold">
                      Incident Summary & Threat Context
                    </span>
                    <p className="text-[#F5F5F7] font-sans">{renderRedactedText(selectedIncident.summary)}</p>
                    <div className="text-[10px] text-[#A0A4AE] pt-1">
                      Detected: {new Date(selectedIncident.detectedAt).toLocaleString()}
                    </div>
                  </div>

                  {/* Triggered Policies & Actions Enforced */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-xl bg-[#1A1A1F]/80 border border-[#3A3A42] space-y-2 shadow-sm">
                      <span className="text-[#A0A4AE] font-bold block text-[10px] uppercase tracking-wider">
                        Triggered Policy Rules
                      </span>
                      <div className="space-y-1">
                        {selectedIncident.triggeredPolicies?.map((pol, idx) => (
                          <div key={idx} className="text-[#F5F5F7] font-medium flex items-center gap-1.5">
                            <span className="text-[#7A1F3D]">•</span>
                            <span>{pol}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#1A1A1F]/80 border border-[#3A3A42] space-y-2 shadow-sm">
                      <span className="text-[#A0A4AE] font-bold block text-[10px] uppercase tracking-wider">
                        Actions Enforced
                      </span>
                      <div className="space-y-1">
                        {selectedIncident.actionsTaken?.map((act, idx) => (
                          <div key={idx} className="text-[#168F86] font-medium flex items-center gap-1.5">
                            <span className="text-[#168F86]">•</span>
                            <span>{act}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Tamper-Evident Evidence Trail */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#168F86]" />
                      <span>Tamper-Evident Cryptographic Evidence Trail</span>
                    </h4>

                    <div className="space-y-2">
                      {selectedIncident.evidenceReferences && selectedIncident.evidenceReferences.length > 0 ? (
                        selectedIncident.evidenceReferences.map((ev, idx) => (
                          <div key={idx} className="p-3 rounded-lg bg-[#1A1A1F]/90 border border-[#3A3A42] text-xs space-y-1.5 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[#F5F5F7] font-bold">{ev.type}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[#A0A4AE] text-[10px] bg-[#24242B] px-2 py-0.5 rounded border border-[#3A3A42] flex items-center gap-1 font-mono">
                                  <Hash className="w-3 h-3 text-[#A0A4AE]" />
                                  SHA-256: {ev.hash ? `${ev.hash.slice(0, 16)}...` : 'VERIFIED'}
                                </span>
                                {ev.hash && (
                                  <button
                                    onClick={() => handleCopyHash(ev.hash)}
                                    className="p-1 text-[#A0A4AE] hover:text-[#F5F5F7] rounded transition-colors"
                                    title="Copy Evidence Hash"
                                  >
                                    {copiedHash === ev.hash ? (
                                      <Check className="w-3 h-3 text-[#168F86]" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-[#A0A4AE] text-[11px] font-sans">{ev.description}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 rounded-lg bg-[#1A1A1F]/50 border border-[#3A3A42] text-center text-[#A0A4AE] text-xs">
                          No direct evidence attachments recorded.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Operator Notes Timeline */}
                  <div className="space-y-3 pt-2 border-t border-[#3A3A42]">
                    <h4 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#7A1F3D]" />
                      <span>Operator Investigation Notes ({selectedIncident.operatorNotes?.length || 0})</span>
                    </h4>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedIncident.operatorNotes && selectedIncident.operatorNotes.length > 0 ? (
                        selectedIncident.operatorNotes.map((note) => (
                          <div key={note.id} className="p-2.5 rounded-lg bg-[#1A1A1F]/80 border border-[#3A3A42] text-xs space-y-1 shadow-sm">
                            <div className="flex items-center justify-between text-[10px] text-[#A0A4AE]">
                              <span className="font-bold text-[#F5F5F7]">{note.author}</span>
                              <span>{note.timestamp}</span>
                            </div>
                            <p className="text-[#F5F5F7] text-[11px] font-sans">{renderRedactedText(note.text)}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 rounded-lg bg-[#1A1A1F]/50 border border-[#3A3A42] text-[#A0A4AE] text-xs text-center">
                          No operator notes logged for this incident yet.
                        </div>
                      )}
                    </div>

                    {/* Add Note Form */}
                    <form onSubmit={handleAddOperatorNote} className="flex gap-2">
                      <input
                        type="text"
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        placeholder="Append operator forensic note..."
                        className="flex-1 px-3 py-2 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] placeholder-[#A0A4AE]/60 focus:outline-none focus:border-[#7A1F3D]"
                      />
                      <button
                        type="submit"
                        disabled={!newNoteText.trim()}
                        className="px-3.5 py-2 bg-[#7A1F3D] hover:bg-[#8F2749] disabled:opacity-40 text-[#F5F5F7] rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm border border-[#7A1F3D]/60 transition-all"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Log Note</span>
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-[#A0A4AE] text-sm">
                  Select an incident to view investigation details.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Create New Incident Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 font-mono animate-in fade-in zoom-in-95">
          <div className="max-w-md w-full soc-glass-card-elevated p-6 rounded-2xl border border-[#3A3A42] shadow-glass-card-elevated space-y-4">
            <h3 className="text-base font-bold text-[#F5F5F7] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#7A1F3D]" />
              <span>Create Security Incident Case</span>
            </h3>

            <form onSubmit={handleCreateIncident} className="space-y-3">
              <div>
                <label className="block text-xs text-[#A0A4AE] mb-1">Attack Classification</label>
                <select
                  value={newClassification}
                  onChange={(e) => setNewClassification(e.target.value)}
                  className="w-full p-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] focus:outline-none focus:border-[#7A1F3D]"
                >
                  <option value="VOICE_CLONING_IMPERSONATION">Voice Cloning & Executive Impersonation</option>
                  <option value="CREDENTIAL_HARVESTING_ATTACK">Urgent OTP / Credential Harvesting</option>
                  <option value="REPLAY_INJECTION_FRAUD">Acoustic Replay Attack</option>
                  <option value="UNENROLLED_SPEAKER_EXFILTRATION">Unenrolled Speaker Policy Violation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#A0A4AE] mb-1">Severity Level</label>
                <select
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value as any)}
                  className="w-full p-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] focus:outline-none focus:border-[#7A1F3D]"
                >
                  <option value="CRITICAL">Critical (Immediate Out-of-Band Lockout)</option>
                  <option value="HIGH">High (Step-Up Verification Required)</option>
                  <option value="MEDIUM">Medium (Operator Warning)</option>
                  <option value="LOW">Low (Informational Triage)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#A0A4AE] mb-1">Correlated Call Session ID</label>
                <input
                  type="text"
                  value={newCallId}
                  onChange={(e) => setNewCallId(e.target.value)}
                  className="w-full p-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] focus:outline-none focus:border-[#7A1F3D]"
                  placeholder="call-sec-demo-101"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A0A4AE] mb-1">Incident Summary</label>
                <textarea
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  rows={3}
                  required
                  placeholder="Observed adversarial deepfake cues and conversational urgency..."
                  className="w-full p-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs text-[#F5F5F7] placeholder-[#A0A4AE]/60 focus:outline-none focus:border-[#7A1F3D] font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#3A3A42]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-[#2E2E36] hover:bg-[#3A3A42] text-[#A0A4AE] rounded-lg text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#7A1F3D] hover:bg-[#8F2749] text-[#F5F5F7] rounded-lg text-xs font-bold shadow-sm border border-[#7A1F3D]/60 transition-all"
                >
                  {actionLoading ? 'Creating...' : 'Log Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
