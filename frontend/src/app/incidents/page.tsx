'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SecurityStatusBadge } from '@/components/ui/SecurityStatusBadge';
import { EvidenceList } from '@/components/ui/EvidenceList';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Search,
  Filter,
  ArrowRight,
  Clock,
  UserCheck,
  FileText,
  ShieldCheck,
  Ban,
  Activity,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { formatSafeTime, formatSafeDateTime } from '@/lib/format';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    const res = await ApiClient.get('/incidents');
    setLoading(false);
    if (res.success && res.data) {
      setIncidents(res.data);
      if (res.data.length > 0 && !selectedIncident) {
        setSelectedIncident(res.data[0]);
      }
    }
  }, [selectedIncident]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleUpdateStatus = async (id: string, status: string, notes?: string) => {
    setActionLoading(true);
    setActionFeedback(null);
    const res = await ApiClient.patch(`/incidents/${id}/status`, {
      status,
      notes: notes || `Status changed to ${status} by SOC Analyst`,
    });
    setActionLoading(false);
    if (res.success) {
      setActionFeedback(`Incident ${status.replace(/_/g, ' ')} successfully.`);
      fetchIncidents();
      if (selectedIncident?.id === id) {
        setSelectedIncident((prev: any) => ({ ...prev, status }));
      }
    } else {
      setActionFeedback(res.message || 'Failed to update incident status.');
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    const matchesSeverity = filterSeverity === 'ALL' || inc.severity === filterSeverity;
    const matchesSearch =
      searchTerm === '' ||
      inc.incidentNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSeverity && matchesSearch;
  });

  return (
    <div className="flex min-h-screen bg-[#05070d]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Incident Response & Case Management"
          subtitle="Triage and Containment for Voice Impersonation & Fraud"
        />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {actionFeedback && (
            <div className="p-3 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs flex items-center justify-between font-sans">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                {actionFeedback}
              </span>
              <button
                onClick={() => setActionFeedback(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 Columns: Incident Queue List */}
            <div className="lg:col-span-5 space-y-3">
              <SectionHeader
                title="Security Incident Queue"
                subtitle="Active security triage items"
                icon={AlertTriangle}
                count={filteredIncidents.length}
                onRefresh={fetchIncidents}
                loading={loading}
              />

              {/* Filters & Search */}
              <div className="space-y-2 p-3 rounded-xl bg-[#0c1222] border border-slate-800">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search incident number, keyword..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-sans focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setFilterSeverity(sev)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                        filterSeverity === sev
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              {/* Queue List */}
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                {filteredIncidents.length === 0 && !loading ? (
                  <EmptyState
                    title="Incident Queue Clear"
                    description="No security incidents match the current filters."
                  />
                ) : (
                  filteredIncidents.map((inc) => {
                    const isSelected = selectedIncident?.id === inc.id;
                    const isCritical = inc.severity === 'CRITICAL';
                    const isHigh = inc.severity === 'HIGH';

                    return (
                      <div
                        key={inc.id}
                        onClick={() => setSelectedIncident(inc)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-slate-900 border-indigo-500 shadow-md'
                            : 'bg-[#0c1222] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-xs font-bold text-white">
                            {inc.incidentNumber}
                          </span>
                          <SecurityStatusBadge status={inc.severity} size="xs" />
                        </div>

                        <h4 className="text-xs font-semibold text-slate-200 font-sans line-clamp-1">
                          {inc.title}
                        </h4>

                        <p className="text-[11px] text-slate-400 font-sans line-clamp-1 mt-0.5">
                          {inc.description}
                        </p>

                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
                          <span>Status: <strong className="text-slate-300">{inc.status}</strong></span>
                          <span>{formatSafeTime(inc.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right 7 Columns: Structured Incident Detail */}
            <div className="lg:col-span-7">
              {selectedIncident ? (
                <div className="p-5 rounded-xl bg-[#0c1222] border border-slate-800 space-y-5">
                  {/* Detail Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-bold text-white">
                          {selectedIncident.incidentNumber}
                        </span>
                        <SecurityStatusBadge status={selectedIncident.severity} size="xs" />
                        <SecurityStatusBadge status={selectedIncident.status} size="xs" />
                      </div>
                      <h3 className="text-base font-bold text-white font-sans">
                        {selectedIncident.title}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Recorded: {formatSafeDateTime(selectedIncident.createdAt)}
                      </p>
                    </div>

                    <Link
                      href="/calls"
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs font-mono text-cyan-400 flex items-center gap-1.5 self-start transition-colors"
                    >
                      <span>LIVE HUD</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  {/* Plain Language Summary */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                      Incident Summary
                    </span>
                    <p className="text-xs text-slate-300 font-sans leading-relaxed p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                      {selectedIncident.description}
                    </p>
                  </div>

                  {/* Structured Evidence Trail */}
                  {selectedIncident.evidenceSummary && selectedIncident.evidenceSummary.length > 0 ? (
                    <EvidenceList
                      items={selectedIncident.evidenceSummary}
                      title="Corroborated Telemetry & Signal Evidence"
                    />
                  ) : (
                    <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                        Corroborated Evidence
                      </span>
                      <p className="text-xs text-slate-400 font-sans italic">
                        No secondary acoustic or behavioral evidence recorded for this case record.
                      </p>
                    </div>
                  )}

                  {/* Officer Response Action Panel (What should I do?) */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Incident Response Actions</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        Audited Workflow
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Link
                        href="/verification"
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/20"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>DISPATCH STEP-UP</span>
                      </Link>

                      {selectedIncident.status !== 'CONTAINED' && (
                        <button
                          onClick={() => handleUpdateStatus(selectedIncident.id, 'CONTAINED')}
                          disabled={actionLoading}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600/90 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>CONTAIN CALL</span>
                        </button>
                      )}

                      {selectedIncident.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleUpdateStatus(selectedIncident.id, 'RESOLVED')}
                          disabled={actionLoading}
                          className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>MARK RESOLVED</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'FALSE_POSITIVE')}
                        disabled={actionLoading}
                        className="px-3 py-2 rounded-lg text-xs font-sans text-slate-400 hover:text-slate-300 bg-slate-900 border border-slate-800 transition-colors ml-auto"
                      >
                        FALSE POSITIVE
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No Incident Selected"
                  description="Select a case from the queue to review evidence and apply incident response actions."
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
