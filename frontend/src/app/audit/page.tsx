'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { ScrollText, ShieldCheck, RefreshCw } from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { formatSafeDateTime } from '@/lib/format';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    const res = await ApiClient.get('/audit');
    setLoading(false);
    if (res.success && res.data) {
      setLogs(res.data);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Immutable Security Audit Logs" subtitle="Tamper-evident trail with zero secret retention" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-cyan-400" />
                <span>Audit Trail Records ({logs.length})</span>
              </h2>
              <button
                onClick={fetchLogs}
                aria-label="Refresh Audit Logs"
                className="p-1 text-slate-400 hover:text-white rounded transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-2">
              {logs.length === 0 && !loading && (
                <div className="p-8 text-center text-slate-500 font-mono text-xs">
                  <ShieldCheck className="w-6 h-6 text-emerald-400/50 mx-auto mb-1.5" />
                  <p className="text-slate-300 font-semibold">Zero Audit Log Entries Recorded</p>
                  <p className="text-[10px] text-slate-500 mt-1">All security-critical actions and policy decisions are cryptographically recorded here.</p>
                </div>
              )}
              {logs.map((log) => (
                <div key={log.id} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 font-mono text-xs space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                          log.result === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {log.result}
                      </span>
                      <span className="font-bold text-white">{log.action}</span>
                      <span className="text-slate-500">[{log.resourceType}]</span>
                    </div>
                    <span className="text-slate-500 text-[10px]">
                      {formatSafeDateTime(log.timestamp)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                    <span>Actor: <strong className="text-slate-300">{log.actorUserId || 'SYSTEM_DAEMON'}</strong></span>
                    <span className="text-slate-500 font-mono">CID: {log.correlationId ? `${log.correlationId.slice(0, 16)}...` : 'N/A'}</span>
                  </div>

                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80 text-[10px] text-slate-300 overflow-x-auto">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(log.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
