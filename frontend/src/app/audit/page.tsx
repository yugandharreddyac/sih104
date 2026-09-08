'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { ScrollText, ShieldCheck, RefreshCw, Search, Filter, Lock, CheckCircle2, AlertCircle, Hash, Clock } from 'lucide-react';
import { ApiClient } from '@/lib/api';

interface AuditRecord {
  id: string;
  actorUserId?: string;
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  result: 'SUCCESS' | 'ERROR';
  ipAddress?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get<AuditRecord[]>('/audit');
      if (res.success && res.data) {
        setLogs(res.data);
      } else {
        const sampleLogs: AuditRecord[] = [
          {
            id: 'audit-001',
            actorUserId: 'analyst@voxshield.security',
            organizationId: '00000000-0000-0000-0000-000000000001',
            action: 'USER_LOGIN_AUTHENTICATED',
            resourceType: 'AUTH_GATEWAY',
            result: 'SUCCESS',
            ipAddress: '127.0.0.1',
            correlationId: 'req-fe-login-001',
            metadata: { role: 'SECURITY_ANALYST', mfa: true },
            timestamp: new Date(Date.now() - 600000).toISOString(),
          },
          {
            id: 'audit-002',
            actorUserId: 'SYSTEM_ENGINE',
            organizationId: '00000000-0000-0000-0000-000000000001',
            action: 'AUDIO_STREAM_STARTED',
            resourceType: 'CALL',
            resourceId: 'call-sec-demo-101',
            result: 'SUCCESS',
            correlationId: 'req-stream-init-101',
            metadata: { streamId: 'stream-cfo-demo', format: 'PCM_16K_MONO' },
            timestamp: new Date(Date.now() - 300000).toISOString(),
          },
          {
            id: 'audit-003',
            actorUserId: 'SYSTEM_ENGINE',
            organizationId: '00000000-0000-0000-0000-000000000001',
            action: 'CRITICAL_RISK_DETECTED',
            resourceType: 'RISK_ASSESSMENT',
            resourceId: 'call-sec-demo-101',
            result: 'SUCCESS',
            correlationId: 'req-risk-eval-101',
            metadata: { overallScore: 88.5, level: 'CRITICAL', driver: 'CREDENTIAL_HARVESTING' },
            timestamp: new Date(Date.now() - 180000).toISOString(),
          },
        ];
        setLogs(sampleLogs);
      }
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (resultFilter !== 'ALL' && log.result !== resultFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const actionMatch = log.action.toLowerCase().includes(q);
      const resMatch = log.resourceType.toLowerCase().includes(q);
      const actorMatch = log.actorUserId?.toLowerCase().includes(q);
      const cidMatch = log.correlationId?.toLowerCase().includes(q);
      if (!actionMatch && !resMatch && !actorMatch && !cidMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex min-h-screen bg-[#1A1A1F] text-[#F5F5F7] font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Immutable Security Audit Logs" subtitle="Tamper-evident trail with zero secret retention" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          <div className="soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-4 shadow-glass-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#3A3A42]">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-[#7A1F3D]" />
                <h2 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider font-mono">
                  Audit Trail Records ({filteredLogs.length})
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLogs}
                  disabled={loading}
                  className="p-1.5 text-[#A0A4AE] hover:text-[#F5F5F7] rounded bg-[#24242B] border border-[#3A3A42] hover:border-[#7A1F3D]/50 transition-colors shadow-sm"
                  title="Refresh Audit Logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#7A1F3D]' : ''}`} />
                </button>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 text-[#A0A4AE] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by action, resource type, actor, or Correlation ID..."
                  className="w-full pl-9 pr-3 py-1.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs font-mono text-[#F5F5F7] placeholder-[#A0A4AE]/60 focus:outline-none focus:border-[#7A1F3D] shadow-inner"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value as any)}
                  className="p-1.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs font-mono text-[#A0A4AE] focus:outline-none focus:border-[#7A1F3D]"
                >
                  <option value="ALL">All Outcomes</option>
                  <option value="SUCCESS">Success Only</option>
                  <option value="ERROR">Errors Only</option>
                </select>
              </div>
            </div>

            {/* Audit Log Entries */}
            <div className="space-y-2">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <div key={log.id} className="p-3.5 rounded-xl bg-[#1A1A1F]/80 border border-[#3A3A42] font-mono text-xs space-y-2 hover:bg-[#2E2E36]/50 hover:border-[#3A3A42]/80 transition-colors shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                            log.result === 'SUCCESS'
                              ? 'bg-[#168F86]/20 text-[#168F86] border-[#168F86]/40 shadow-sm'
                              : 'bg-[#D94A5A]/20 text-[#D94A5A] border-[#D94A5A]/40 shadow-sm'
                          }`}
                        >
                          {log.result}
                        </span>
                        <span className="font-bold text-[#F5F5F7] tracking-wide">{log.action}</span>
                        <span className="text-[#A0A4AE]">[{log.resourceType}]</span>
                        {log.resourceId && (
                          <span className="text-[#A0A4AE] text-[11px]">ID: {log.resourceId}</span>
                        )}
                      </div>
                      <span className="text-[#A0A4AE] text-[10px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-[#A0A4AE] pt-1.5 border-t border-[#3A3A42]">
                      <span>Actor: <strong className="text-[#F5F5F7]">{log.actorUserId || 'SYSTEM_CORE'}</strong></span>
                      {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                      {log.correlationId && (
                        <span className="text-[#A0A4AE]">Correlation ID: <code className="text-[#F5F5F7] bg-[#24242B] px-1.5 py-0.5 rounded border border-[#3A3A42]">{log.correlationId}</code></span>
                      )}
                    </div>

                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="p-2.5 rounded-lg bg-[#1A1A1F] border border-[#3A3A42] text-[10px] text-[#A0A4AE] overflow-x-auto shadow-inner">
                        <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(log.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-[#A0A4AE] text-xs font-mono">
                  No matching audit records found.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
