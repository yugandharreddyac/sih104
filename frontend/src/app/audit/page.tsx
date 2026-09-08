'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { formatSafeDateTime } from '@/lib/format';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterResult, setFilterResult] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const res = await ApiClient.get('/audit');
    setLoading(false);
    if (res.success && res.data) {
      setLogs(res.data);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    const matchesResult = filterResult === 'ALL' || log.result === filterResult;
    const matchesSearch =
      searchTerm === '' ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resourceType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.actorUserId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.correlationId?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesResult && matchesSearch;
  });

  return (
    <div className="flex min-h-screen bg-background text-primaryText">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Security Audit Logs"
          subtitle="Tamper-evident cryptographic audit trail and analyst action log"
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl w-full mx-auto font-sans">
          {/* Header & Controls Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-primaryText">
                Cryptographic Audit Trail
              </h2>
              <p className="text-xs text-mutedText mt-0.5">
                All voice intelligence actions, policy decisions, step-up challenges, and analyst orders.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-mutedText absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Filter action, actor, CID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-enterprise pl-8 text-xs py-1 h-8 w-full"
                  aria-label="Filter audit logs"
                />
              </div>

              <div className="flex items-center border border-border rounded overflow-hidden" role="group" aria-label="Filter by result">
                {(['ALL', 'SUCCESS', 'ERROR'] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setFilterResult(res)}
                    className={`px-2.5 py-1 text-[11px] font-mono transition-colors ${
                      filterResult === res
                        ? 'bg-primary text-white font-semibold'
                        : 'bg-surface text-secondaryText hover:text-primaryText hover:bg-surface-hover'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={fetchLogs}
                disabled={loading}
                className="text-xs text-secondaryText hover:text-primaryText flex items-center gap-1 px-2 py-1"
                title="Refresh audit records"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Audit Records Table */}
          {loading && logs.length === 0 ? (
            <div className="pt-8">
              <LoadingState
                label="Retrieving Immutable Audit Trail..."
                description="Querying cryptographic event logs, correlation hashes, and actor signatures."
              />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="pt-8">
              <EmptyState
                title="Zero Audit Log Entries Recorded"
                description="All security-critical actions and policy decisions will be cryptographically recorded here."
                actionLabel="Refresh Logs"
                onAction={fetchLogs}
              />
            </div>
          ) : (
            <div className="pt-2">
              <div className="flex items-center justify-between py-2 border-b border-border text-xs text-mutedText">
                <span className="font-semibold uppercase tracking-wider text-[11px] text-secondaryText">
                  Event Sequence ({filteredLogs.length} records)
                </span>
                <span className="font-mono text-[11px]">
                  Zero-Knowledge Retention Active
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-mutedText font-medium text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 pr-4">Timestamp</th>
                      <th className="py-2.5 px-3">Result</th>
                      <th className="py-2.5 px-4">Action & Resource</th>
                      <th className="py-2.5 px-4">Actor</th>
                      <th className="py-2.5 px-4">Correlation ID</th>
                      <th className="py-2.5 pl-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                    {filteredLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      const isSuccess = log.result === 'SUCCESS';
                      const hasMeta = log.metadata && Object.keys(log.metadata).length > 0;

                      return (
                        <React.Fragment key={log.id}>
                          <tr className="hover:bg-surface-hover/30 transition-colors">
                            <td className="py-3 pr-4 text-mutedText whitespace-nowrap">
                              {formatSafeDateTime(log.timestamp)}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 font-sans">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isSuccess ? 'bg-success' : 'bg-danger'
                                  }`}
                                />
                                <span className={isSuccess ? 'text-success' : 'text-danger'}>
                                  {log.result}
                                </span>
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-sans font-medium text-primaryText">
                                {log.action}
                              </div>
                              <div className="text-mutedText text-[10px]">
                                {log.resourceType}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-primaryText whitespace-nowrap">
                              {log.actorUserId || 'SYSTEM_DAEMON'}
                            </td>
                            <td className="py-3 px-4 text-mutedText whitespace-nowrap">
                              {log.correlationId ? log.correlationId.slice(0, 16) : '—'}
                            </td>
                            <td className="py-3 pl-3 text-right whitespace-nowrap">
                              {hasMeta ? (
                                <button
                                  type="button"
                                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                  className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-[11px]"
                                >
                                  <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              ) : (
                                <span className="text-mutedText">—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && hasMeta && (
                            <tr className="bg-surface-elevated/40">
                              <td colSpan={6} className="p-3 pl-8">
                                <div className="text-[10px] uppercase font-semibold text-mutedText mb-1">
                                  Corroborated Event Metadata
                                </div>
                                <pre className="p-2.5 rounded bg-surface border border-border text-[11px] text-secondaryText overflow-x-auto whitespace-pre-wrap font-mono">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
