'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import {
  PhoneCall,
  AlertTriangle,
  FileCheck2,
  Lock,
  Activity,
  ArrowUpRight,
  ShieldAlert,
  Server,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    activeCalls: 2,
    openIncidents: 1,
    activePolicies: 3,
    pendingVerifications: 1,
    aiServiceStatus: 'INITIALIZED (PHASE 1)',
    privacyFirewallStatus: 'ACTIVE (PRE-PERSISTENCE)',
  });

  useEffect(() => {
    async function loadData() {
      const [callsRes, incRes, polRes, verRes] = await Promise.all([
        ApiClient.get('/calls'),
        ApiClient.get('/incidents'),
        ApiClient.get('/policies'),
        ApiClient.get('/verification'),
      ]);

      if (callsRes.success && callsRes.data) {
        setStats((prev) => ({ ...prev, activeCalls: callsRes.data.length }));
      }
      if (incRes.success && incRes.data) {
        setStats((prev) => ({ ...prev, openIncidents: incRes.data.length }));
      }
      if (polRes.success && polRes.data) {
        setStats((prev) => ({ ...prev, activePolicies: polRes.data.length }));
      }
      if (verRes.success && verRes.data) {
        setStats((prev) => ({ ...prev, pendingVerifications: verRes.data.length }));
      }
    }
    loadData();
  }, []);

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Security Operations Center (SOC)" subtitle="Real-Time Audio Defense Console" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl soc-glass border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-400">Live Call Streams</p>
                <h3 className="text-2xl font-bold text-white mt-1">{stats.activeCalls}</h3>
                <span className="text-[10px] text-emerald-400 font-mono">● Active Channels</span>
              </div>
              <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400">
                <PhoneCall className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl soc-glass border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-400">Security Incidents</p>
                <h3 className="text-2xl font-bold text-rose-400 mt-1">{stats.openIncidents}</h3>
                <span className="text-[10px] text-rose-400 font-mono">● Under Triage</span>
              </div>
              <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl soc-glass border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-400">Deterministic Policies</p>
                <h3 className="text-2xl font-bold text-white mt-1">{stats.activePolicies}</h3>
                <span className="text-[10px] text-cyan-400 font-mono">● Rules Enforced</span>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/10 text-cyan-400">
                <FileCheck2 className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl soc-glass border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-slate-400">Out-of-Band Step-Ups</p>
                <h3 className="text-2xl font-bold text-amber-400 mt-1">{stats.pendingVerifications}</h3>
                <span className="text-[10px] text-amber-400 font-mono">● Pending IdP Approval</span>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400">
                <Lock className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Quick Security Status & Pipeline Readiness */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Real-Time Defense Pipeline Architecture</span>
                </h2>
                <span className="text-[10px] font-mono text-slate-400">Phase 1 Modular Core</span>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Pre-Persistence Privacy Firewall</h4>
                      <p className="text-[11px] text-slate-400">Deterministic entity redaction for OTP, CVV, passwords</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    ACTIVE
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Deterministic Policy Engine</h4>
                      <p className="text-[11px] text-slate-400">Priority rule evaluation for high-value & exfiltration defense</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    ACTIVE
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                    <div>
                      <h4 className="text-xs font-bold text-white">AI Acoustic & Neural Detection Pipeline</h4>
                      <p className="text-[11px] text-slate-400">FastAPI streaming pipeline interfaces & modular endpoints</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                    PHASE 1 READY
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions & Navigation */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Quick Operations</span>
              </h2>

              <div className="space-y-2">
                <Link
                  href="/calls"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 transition-colors"
                >
                  <span>Inspect Live Call Queue</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </Link>
                <Link
                  href="/incidents"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 transition-colors"
                >
                  <span>Manage Active Incidents</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </Link>
                <Link
                  href="/policies"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 transition-colors"
                >
                  <span>Review Policy Rules</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </Link>
                <Link
                  href="/health"
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 transition-colors"
                >
                  <span>Check Stack Health</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
