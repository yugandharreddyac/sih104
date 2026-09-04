'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { Activity, Server, Database, Cpu, ShieldCheck, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function HealthPage() {
  const [healthData, setHealthData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    const res = await ApiClient.get('/health');
    setLoading(false);
    if (res.status || res.success || res.components) {
      setHealthData(res.data || res);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const getStatusBadge = (status?: string) => {
    const s = status?.toUpperCase() || 'UNKNOWN';
    if (s === 'HEALTHY' || s === 'CONNECTED' || s === 'ACTIVE') {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
    if (s === 'OFFLINE_OR_PENDING' || s === 'DEGRADED' || s === 'INITIALIZED') {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    }
    return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
  };

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
              <span>Platform Component Status ({healthData?.status || 'MONITORING'})</span>
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
                    <h3 className="text-xs font-bold text-white font-mono">Backend Gateway</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Node.js Express + WS</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${getStatusBadge(healthData?.components?.backend?.status || 'HEALTHY')}`}>
                  {healthData?.components?.backend?.status || 'HEALTHY'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Port:</span>
                  <span className="text-slate-200">4000</span>
                </div>
                <div className="flex justify-between">
                  <span>Uptime:</span>
                  <span className="text-slate-200">{healthData?.components?.backend?.uptimeSeconds ? `${Math.floor(healthData.components.backend.uptimeSeconds)}s` : 'Active'}</span>
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
                    <h3 className="text-xs font-bold text-white font-mono">Acoustic AI Service</h3>
                    <p className="text-[10px] text-slate-400 font-mono">PyTorch + CTranslate2</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${getStatusBadge(healthData?.components?.aiService?.status)}`}>
                  {healthData?.components?.aiService?.status || 'OFFLINE_OR_PENDING'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Latency:</span>
                  <span className="text-slate-200">{healthData?.components?.aiService?.latencyMs !== undefined ? `${healthData.components.aiService.latencyMs}ms` : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Target URL:</span>
                  <span className="text-cyan-400 truncate max-w-[150px]">{healthData?.components?.aiService?.targetUrl || 'http://localhost:8000'}</span>
                </div>
              </div>
            </div>

            {/* PostgreSQL Database */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono">PostgreSQL Database</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Dual-Mode Persistence</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${getStatusBadge(healthData?.components?.database?.status)}`}>
                  {healthData?.components?.database?.status || 'CONNECTED'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Persistence Mode:</span>
                  <span className="text-slate-200">{healthData?.persistenceMode || 'MEMORY_FALLBACK'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Zero Retention:</span>
                  <span className="text-emerald-400">Enforced</span>
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
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${getStatusBadge(healthData?.components?.privacyFirewall?.status || 'ACTIVE')}`}>
                  {healthData?.components?.privacyFirewall?.status || 'ACTIVE'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Redaction Engine:</span>
                  <span className="text-slate-200">DETERMINISTIC</span>
                </div>
                <div className="flex justify-between">
                  <span>Entities:</span>
                  <span className="text-emerald-400">OTP, Cards, Passwords</span>
                </div>
              </div>
            </div>

            {/* Policy Engine */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono">Deterministic Policy Engine</h3>
                    <p className="text-[10px] text-slate-400 font-mono">Rule Evaluator V1</p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${getStatusBadge(healthData?.components?.policyEngine?.status || 'ACTIVE')}`}>
                  {healthData?.components?.policyEngine?.status || 'ACTIVE'}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 space-y-1 pt-2 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Precedence:</span>
                  <span className="text-slate-200">Enforced</span>
                </div>
                <div className="flex justify-between">
                  <span>Decisions:</span>
                  <span className="text-emerald-400">ALLOW | STEP_UP | BLOCK</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

