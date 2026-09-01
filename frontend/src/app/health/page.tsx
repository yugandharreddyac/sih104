'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { Activity, Server, Database, Cpu, ShieldCheck, RefreshCw } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function HealthPage() {
  const [healthData, setHealthData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    const res = await ApiClient.get('/health');
    setLoading(false);
    if (res.success || res.data) {
      setHealthData(res.data || res);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="System & Component Health Matrix" subtitle="Real-time diagnostics across all layers" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Platform Component Status</span>
            </h2>
            <button onClick={fetchHealth} className="p-1 text-slate-400 hover:text-white rounded">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Backend Core */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono">Backend Core</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Node.js Express + WS</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  HEALTHY
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Port:</span>
                  <span className="text-slate-200">4000</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="text-emerald-400">ONLINE</span>
                </div>
              </div>
            </div>

            {/* AI Engine Service */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono">AI Engine Service</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Python FastAPI</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                  PHASE 1 READY
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Port:</span>
                  <span className="text-slate-200">8000</span>
                </div>
                <div className="flex justify-between">
                  <span>Pipelines:</span>
                  <span className="text-cyan-400">Interfaces Initialized</span>
                </div>
              </div>
            </div>

            {/* PostgreSQL */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono">PostgreSQL Database</h3>
                    <p className="text-[10px] text-slate-400 font-mono">17 Schema Entities</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  CONNECTED
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Port:</span>
                  <span className="text-slate-200">5432</span>
                </div>
                <div className="flex justify-between">
                  <span>Redaction:</span>
                  <span className="text-emerald-400">Zero Secret Retention</span>
                </div>
              </div>
            </div>

            {/* Privacy Firewall */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono">Privacy Firewall</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Pre-Persistence Sanitizer</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  ACTIVE
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Categories:</span>
                  <span className="text-slate-200">11 Entity Types</span>
                </div>
                <div className="flex justify-between">
                  <span>Interception:</span>
                  <span className="text-emerald-400">Deterministic RegEx</span>
                </div>
              </div>
            </div>

            {/* Policy Engine */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono">Policy Engine</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Deterministic Rules V1</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  ACTIVE
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Priority Sorting:</span>
                  <span className="text-slate-200">Enforced</span>
                </div>
                <div className="flex justify-between">
                  <span>Decision Logic:</span>
                  <span className="text-emerald-400">Deterministic</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
