'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ShieldAlert,
  CheckCircle2,
  Lock,
  Search,
  ArrowRight,
  Clock,
  Ban,
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
    <div className="flex min-h-screen bg-background text-primaryText">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Incident Response & Case Management"
          subtitle="Triage and Containment for Voice Impersonation & Fraud"
        />

        <main className="flex-1 p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {actionFeedback && (
            <div className="p-3 rounded bg-success/10 border border-success/30 text-success text-xs flex items-center justify-between font-sans">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{actionFeedback}</span>
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

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 Columns: Incident Queue (Table List) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between pb-1.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText font-sans">
                    Incident Queue
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-elevated border border-border text-[11px] font-mono text-mutedText">
                    {filteredIncidents.length}
                  </span>
                </div>
                <button
                  onClick={fetchIncidents}
                  className="text-xs text-mutedText hover:text-primaryText flex items-center gap-1 font-sans"
                  title="Refresh incidents"
                >
                  <Clock className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Filters & Search (Inline) */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-mutedText absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search incident number, keyword..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-enterprise pl-8 w-full text-xs font-sans"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setFilterSeverity(sev)}
                      className={`px-2 py-0.5 rounded text-[10px] font-sans font-medium transition-colors ${
                        filterSeverity === sev
                          ? 'bg-primary text-white'
                          : 'bg-surface-elevated text-secondaryText hover:bg-surface-hover border border-border/60'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              {/* Queue Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="border-b border-border text-[10px] text-mutedText uppercase tracking-wider font-medium">
                      <th className="py-2 pr-2 font-medium">Incident</th>
                      <th className="py-2 px-2 font-medium">Severity</th>
                      <th className="py-2 px-2 font-medium">Status</th>
                      <th className="py-2 pl-2 font-medium text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-xs text-mutedText">
                          Loading incident queue...
                        </td>
                      </tr>
                    ) : filteredIncidents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-xs text-mutedText">
                          No security incidents match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredIncidents.map((inc) => {
                        const isSelected = selectedIncident?.id === inc.id;

                        return (
                          <tr
                            key={inc.id}
                            onClick={() => setSelectedIncident(inc)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-surface-elevated font-medium text-primaryText'
                                : 'hover:bg-surface-hover/50 text-secondaryText'
                            }`}
                          >
                            <td className="py-2.5 pr-2 font-mono">
                              <span className={isSelected ? 'text-primary' : 'text-primaryText'}>
                                {inc.incidentNumber}
                              </span>
                            </td>
                            <td className="py-2.5 px-2">
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    inc.severity === 'CRITICAL'
                                      ? 'bg-danger'
                                      : inc.severity === 'HIGH'
                                      ? 'bg-warning'
                                      : 'bg-mutedText'
                                  }`}
                                />
                                <span className="text-[11px] capitalize">{inc.severity?.toLowerCase()}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-2">
                              <span className="text-[11px] text-secondaryText capitalize">
                                {inc.status?.toLowerCase().replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 pl-2 text-right font-mono text-[10px] text-mutedText">
                              {formatSafeTime(inc.createdAt)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right 7 Columns: Unboxed Incident Detail Workspace */}
            <div className="lg:col-span-7 lg:pl-6 lg:border-l lg:border-border space-y-4">
              {selectedIncident ? (
                <>
                  {/* Detail Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-primaryText">
                          {selectedIncident.incidentNumber}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              selectedIncident.severity === 'CRITICAL'
                                ? 'bg-danger'
                                : selectedIncident.severity === 'HIGH'
                                ? 'bg-warning'
                                : 'bg-mutedText'
                            }`}
                          />
                          <span className="capitalize">{selectedIncident.severity?.toLowerCase()}</span>
                        </span>
                        <span className="text-border">•</span>
                        <span className="text-xs text-secondaryText capitalize">
                          {selectedIncident.status?.toLowerCase().replace('_', ' ')}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-primaryText font-sans">
                        {selectedIncident.title}
                      </h3>
                      <p className="text-xs text-mutedText font-mono mt-0.5">
                        Recorded: {formatSafeDateTime(selectedIncident.createdAt)}
                      </p>
                    </div>

                    <Link
                      href="/calls"
                      className="btn-secondary text-xs flex items-center gap-1.5 self-start shrink-0 font-sans"
                    >
                      <span>Live Sessions</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  {/* Incident Summary */}
                  <div className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wider text-mutedText font-semibold font-sans">
                      Incident Summary
                    </span>
                    <p className="text-xs text-secondaryText font-sans leading-relaxed">
                      {selectedIncident.description}
                    </p>
                  </div>

                  <hr className="border-border" />

                  {/* Corroborated Evidence */}
                  <div className="space-y-2">
                    <span className="text-xs uppercase tracking-wider text-mutedText font-semibold font-sans">
                      Corroborated Evidence
                    </span>
                    {selectedIncident.evidenceSummary && selectedIncident.evidenceSummary.length > 0 ? (
                      <ul className="space-y-1.5 text-xs text-secondaryText font-sans">
                        {selectedIncident.evidenceSummary.map((ev: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                            <span>{ev}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-mutedText font-sans italic">
                        No secondary acoustic or behavioral evidence recorded for this case record.
                      </p>
                    )}
                  </div>

                  <hr className="border-border" />

                  {/* Officer Response Actions */}
                  <div className="space-y-3 font-sans">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider text-secondaryText font-semibold flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-danger" />
                        <span>Incident Response Actions</span>
                      </span>
                      <span className="text-[10px] font-mono text-mutedText">
                        Audited Workflow
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Link
                        href="/verification"
                        className="btn-primary text-xs flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Dispatch Step-Up</span>
                      </Link>

                      {selectedIncident.status !== 'CONTAINED' && (
                        <button
                          onClick={() => handleUpdateStatus(selectedIncident.id, 'CONTAINED')}
                          disabled={actionLoading}
                          className="btn-danger text-xs flex items-center gap-1.5"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Contain Call</span>
                        </button>
                      )}

                      {selectedIncident.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleUpdateStatus(selectedIncident.id, 'RESOLVED')}
                          disabled={actionLoading}
                          className="btn-secondary text-xs flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                          <span>Mark Resolved</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'FALSE_POSITIVE')}
                        disabled={actionLoading}
                        className="btn-outline text-xs ml-auto"
                      >
                        False Positive
                      </button>
                    </div>
                  </div>
                </>
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
