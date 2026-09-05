'use client';

import React, { useEffect, useState, useRef } from 'react';
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
  Database,
  Cpu,
  ShieldCheck,
  Radio,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { ApiClient, WS_BASE } from '@/lib/api';
import { formatSafeTime } from '@/lib/format';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    activeCalls: 0,
    openIncidents: 0,
    activePolicies: 0,
    pendingVerifications: 0,
  });

  const [callsList, setCallsList] = useState<any[]>([]);
  const [incidentsList, setIncidentsList] = useState<any[]>([]);
  const [healthData, setHealthData] = useState<any | null>(null);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [callsRes, incRes, polRes, verRes, healthRes] = await Promise.all([
      ApiClient.get('/calls'),
      ApiClient.get('/incidents'),
      ApiClient.get('/policies'),
      ApiClient.get('/verification'),
      ApiClient.get('/health'),
    ]);
    setLoading(false);

    if (callsRes.success && callsRes.data) {
      setCallsList(callsRes.data);
      setStats((prev) => ({ ...prev, activeCalls: callsRes.data.length }));
    }
    if (incRes.success && incRes.data) {
      setIncidentsList(incRes.data);
      const openCount = incRes.data.filter((i: any) => i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE').length;
      setStats((prev) => ({ ...prev, openIncidents: openCount }));
    }
    if (polRes.success && polRes.data) {
      setStats((prev) => ({ ...prev, activePolicies: polRes.data.length }));
    }
    if (verRes.success && verRes.data) {
      const pendingCount = verRes.data.filter((v: any) => v.status === 'PENDING').length;
      setStats((prev) => ({ ...prev, pendingVerifications: pendingCount }));
    }
    if (healthRes.success || healthRes.status || healthRes.components) {
      setHealthData(healthRes.data || healthRes);
    }
  };

  useEffect(() => {
    loadData();

    // Connect to WebSocket for live SOC telemetry alerts
    const token = ApiClient.getToken();
    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      if (token) {
        ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SOC_ALERT' || msg.type === 'POLICY_ENFORCEMENT_TRIGGER' || msg.type === 'SOCIAL_ENGINEERING_ALERT') {
          setLiveAlerts((prev) => [
            {
              id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              type: msg.type,
              callId: msg.callId,
              severity: msg.payload?.severity || (msg.type === 'POLICY_ENFORCEMENT_TRIGGER' ? 'CRITICAL' : 'HIGH'),
              message: msg.payload?.message || msg.payload?.rule_name || msg.payload?.explanation || 'Security event detected',
              action: msg.payload?.action || msg.payload?.recommended_action,
              timestamp: msg.timestamp || new Date().toISOString(),
            },
            ...prev.slice(0, 19),
          ]);
        }
      } catch {}
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Security Operations Center (SOC)" subtitle="Real-Time Audio Defense Console" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          {/* Pipeline Stage Navigation Ribbon */}
          <div className="grid grid-cols-5 gap-2 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono text-center">
            <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-indigo-300">
              <span className="block text-[10px] text-slate-500 font-semibold">1. INGEST</span>
              <span className="font-bold text-slate-200">SIP / 16kHz PCM</span>
            </div>
            <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/20 text-cyan-300">
              <span className="block text-[10px] text-slate-500 font-semibold">2. ANALYZE</span>
              <span className="font-bold text-slate-200">Neural + ASR</span>
            </div>
            <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/20 text-amber-300">
              <span className="block text-[10px] text-slate-500 font-semibold">3. FUSION</span>
              <span className="font-bold text-slate-200">10D Threat Tensor</span>
            </div>
            <div className="p-2 rounded-lg bg-purple-950/40 border border-purple-500/20 text-purple-300">
              <span className="block text-[10px] text-slate-500 font-semibold">4. DECIDE</span>
              <span className="font-bold text-slate-200">Policy Rules</span>
            </div>
            <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/20 text-rose-300">
              <span className="block text-[10px] text-slate-500 font-semibold">5. ACT</span>
              <span className="font-bold text-slate-200">Step-Up / Enforce</span>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/calls"
              className="p-4 rounded-xl soc-glass border border-slate-800 hover:border-indigo-500/50 flex items-center justify-between transition-all group"
            >
              <div>
                <p className="text-xs font-mono text-slate-400">Live Call Streams</p>
                <h3 className="text-2xl font-bold text-white mt-1">{stats.activeCalls}</h3>
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {stats.activeCalls > 0 ? 'Active Channels' : 'Channels Idle'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                <PhoneCall className="w-5 h-5" />
              </div>
            </Link>

            <Link
              href="/incidents"
              className="p-4 rounded-xl soc-glass border border-slate-800 hover:border-rose-500/50 flex items-center justify-between transition-all group"
            >
              <div>
                <p className="text-xs font-mono text-slate-400">Security Incidents</p>
                <h3 className="text-2xl font-bold text-rose-400 mt-1">{stats.openIncidents}</h3>
                <span className="text-[10px] text-rose-400 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  {stats.openIncidents > 0 ? 'Under Investigation' : 'Queue Clear'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 transition-colors">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </Link>

            <Link
              href="/policies"
              className="p-4 rounded-xl soc-glass border border-slate-800 hover:border-cyan-500/50 flex items-center justify-between transition-all group"
            >
              <div>
                <p className="text-xs font-mono text-slate-400">Deterministic Policies</p>
                <h3 className="text-2xl font-bold text-white mt-1">{stats.activePolicies}</h3>
                <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Rules Enforced
                </span>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                <FileCheck2 className="w-5 h-5" />
              </div>
            </Link>

            <Link
              href="/verification"
              className="p-4 rounded-xl soc-glass border border-slate-800 hover:border-amber-500/50 flex items-center justify-between transition-all group"
            >
              <div>
                <p className="text-xs font-mono text-slate-400">Out-of-Band Step-Ups</p>
                <h3 className="text-2xl font-bold text-amber-400 mt-1">{stats.pendingVerifications}</h3>
                <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  IdP Challenges
                </span>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                <Lock className="w-5 h-5" />
              </div>
            </Link>
          </div>

          {/* Real-Time Security Live Stream & Subsystem Health Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Real-Time Live Threat Alert Feed */}
            <div className="lg:col-span-2 soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
                  <span>Real-Time Security Event Stream</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400">Live WebSocket Feed</span>
                  <button
                    onClick={loadData}
                    aria-label="Refresh Data"
                    className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {liveAlerts.length > 0 ? (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {liveAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                              alert.severity === 'CRITICAL'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <span className="text-indigo-400 font-bold">{alert.type}</span>
                          {alert.callId && <span className="text-slate-500">Call: {alert.callId.slice(0, 8)}...</span>}
                        </div>
                        <p className="text-slate-300 text-[11px]">{alert.message}</p>
                        {alert.action && (
                          <span className="text-[10px] text-cyan-400 block">Enforced Action: {alert.action}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {formatSafeTime(alert.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs font-mono rounded-lg bg-slate-950/40 border border-slate-800/60">
                  <ShieldCheck className="w-8 h-8 text-emerald-400/50 mx-auto mb-2" />
                  <p className="text-slate-300 font-semibold">Security Stream Active — Zero Threats on Queue</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Continuous acoustic analysis, synthetic voice detection & credential harvesting defense active.
                  </p>
                </div>
              )}

              {/* Active Calls Table */}
              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider">
                    Monitored Call Sessions ({callsList.length})
                  </h3>
                  <Link href="/calls" className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono">
                    <span>Inspect Live Console</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {callsList.length > 0 ? (
                  <div className="space-y-1.5">
                    {callsList.slice(0, 3).map((c) => (
                      <Link
                        key={c.id}
                        href="/calls"
                        className="p-2.5 rounded-lg bg-slate-950/60 hover:bg-slate-900 border border-slate-800/80 flex items-center justify-between text-xs font-mono transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="font-bold text-white">{c.callerIdentifier}</span>
                          {c.callerDisplayName && <span className="text-slate-400">({c.callerDisplayName})</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {c.status}
                          </span>
                          <span className="text-slate-500 text-[10px]">{formatSafeTime(c.createdAt)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-slate-950/40 border border-slate-800/60 text-center">
                    <p className="text-xs text-slate-500 font-mono">No active call sessions connected to gateway.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Architecture Stack & Subsystem Health */}
            <div className="soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Subsystem Live Diagnostics</span>
              </h2>

              <div className="space-y-2.5">
                {/* Backend Core */}
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2.5">
                    <Server className="w-4 h-4 text-indigo-400" />
                    <span className="text-slate-200 font-bold">Backend Gateway</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                    ONLINE
                  </span>
                </div>

                {/* AI Service */}
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span className="text-slate-200 font-bold">Acoustic AI Service</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                      healthData?.components?.aiService?.status === 'HEALTHY'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {healthData?.components?.aiService?.status === 'HEALTHY' ? 'HEALTHY' : 'AI STANDBY'}
                  </span>
                </div>

                {/* Database */}
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-200 font-bold">PostgreSQL DB</span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                      healthData?.components?.database?.status === 'CONNECTED'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    {healthData?.components?.database?.status || 'DUAL_MODE'}
                  </span>
                </div>

                {/* Privacy Firewall */}
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-200 font-bold">Privacy Firewall</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                    ENFORCED
                  </span>
                </div>

                {/* Deterministic Policy Engine */}
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2.5">
                    <FileCheck2 className="w-4 h-4 text-cyan-400" />
                    <span className="text-slate-200 font-bold">Policy Enforcer</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                    ACTIVE
                  </span>
                </div>
              </div>

              {/* Quick Navigation Links */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <Link
                  href="/calls"
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-xs text-slate-300 transition-colors font-mono"
                >
                  <span>Live Call Command Center</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>
                <Link
                  href="/incidents"
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-xs text-slate-300 transition-colors font-mono"
                >
                  <span>Incident Case Management</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>
                <Link
                  href="/policies"
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-xs text-slate-300 transition-colors font-mono"
                >
                  <span>Security Policy Rules</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
