'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SecurityStatusBadge } from '@/components/ui/SecurityStatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ScrollText,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Hash,
  ChevronDown,
  ChevronUp,
  Lock,
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
    <div className="flex min-h-screen bg-[#070b14]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Immutable Security Audit Logs"
          subtitle="Tamper-Evident Evidence Trail with Zero Secret Retention"
        />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {/* Top Compliance & Integrity Banner */}
          <div className="p-4 rounded-xl bg-[#0c1222] border border-slate-800 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <span>Cryptographic Audit Trail</span>
                <span className="text-[10px] px-2 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Compliance Ready
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                All voice intelligence actions, policy decisions, step-up challenges, and analyst containment orders are cryptographically logged with correlation IDs. Raw biometric recordings and plaintext secrets are permanently scrubbed by the Privacy Firewall.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#0c1222] border border-slate-800 space-y-4">
            <SectionHeader
              title="Audit Trail Records"
              subtitle="Chronological sequence of security operations events"
              icon={ScrollText}
              count={filteredLogs.length}
              onRefresh={fetchLogs}
              loading={loading}
            />

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
              <div className="relative w-full sm:w-80">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by action, actor, resource..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 font-sans focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                {['ALL', 'SUCCESS', 'ERROR'].map((res) => (
                  <button
                    key={res}
                    onClick={() => setFilterResult(res as any)}
                    className={`px-3 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                      filterResult === res
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            {/* Audit Log Entries List */}
            <div className="space-y-2">
              {filteredLogs.length === 0 && !loading ? (
                <EmptyState
                  title="Zero Audit Log Entries Recorded"
                  description="All security-critical actions and policy decisions will be cryptographically recorded here."
                />
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const isSuccess = log.result === 'SUCCESS';

                  return (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 font-mono text-xs space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                              isSuccess
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {log.result}
                          </span>
                          <span className="font-bold text-white font-sans">{log.action}</span>
                          <span className="text-slate-500 text-[11px]">[{log.resourceType}]</span>
                        </div>
                        <span className="text-slate-400 text-[11px] font-mono">
                          {formatSafeDateTime(log.timestamp)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2 pt-1 border-t border-slate-800/60">
                        <span className="flex items-center gap-1.5 font-sans">
                          <User className="w-3 h-3 text-slate-500" />
                          <span>Actor: <strong className="text-slate-300 font-mono">{log.actorUserId || 'SYSTEM_DAEMON'}</strong></span>
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-slate-500">
                          <Hash className="w-3 h-3 text-slate-600" />
                          <span>CID: {log.correlationId ? `${log.correlationId.slice(0, 16)}...` : 'N/A'}</span>
                        </span>

                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 ml-auto"
                          >
                            <span>{isExpanded ? 'Hide Metadata' : 'Inspect Evidence'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>

                      {isExpanded && log.metadata && (
                        <div className="mt-2 p-3 rounded-lg bg-slate-950/90 border border-slate-800 text-[10px] text-slate-300 overflow-x-auto">
                          <pre className="whitespace-pre-wrap font-mono">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
