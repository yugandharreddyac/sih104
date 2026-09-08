'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { MetricCard } from '@/components/ui/MetricCard';
import { ThreatVerdict } from '@/components/ui/ThreatVerdict';
import { SecurityStatusBadge } from '@/components/ui/SecurityStatusBadge';
import { RecommendedAction } from '@/components/ui/RecommendedAction';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  PhoneCall,
  AlertTriangle,
  Lock,
  FileCheck2,
  ShieldCheck,
  ShieldAlert,
  Server,
  Cpu,
  Database,
  ArrowRight,
  Radio,
  Clock,
  Activity,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { ApiClient, WS_BASE } from '@/lib/api';
import { formatSafeTime, formatPercentage } from '@/lib/format';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    activeCalls: 0,
    activeThreats: 0,
    pendingVerifications: 0,
    openIncidents: 0,
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

    let activeThreatsCount = 0;

    if (callsRes.success && callsRes.data) {
      setCallsList(callsRes.data);
      // Calculate threats based on actual call status/scores
      activeThreatsCount = callsRes.data.filter(
        (c: any) =>
          c.riskLevel === 'CRITICAL' ||
          c.riskLevel === 'HIGH' ||
          (typeof c.riskScore === 'number' && c.riskScore >= 0.7)
      ).length;
    }

    let openIncCount = 0;
    if (incRes.success && incRes.data) {
      setIncidentsList(incRes.data);
      openIncCount = incRes.data.filter(
        (i: any) => i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
      ).length;
    }

    let pendingVerCount = 0;
    if (verRes.success && verRes.data) {
      pendingVerCount = verRes.data.filter((v: any) => v.status === 'PENDING').length;
    }

    setStats({
      activeCalls: callsRes.data?.length || 0,
      activeThreats: Math.max(activeThreatsCount, openIncCount > 0 ? 1 : 0),
      pendingVerifications: pendingVerCount,
      openIncidents: openIncCount,
    });

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
        if (
          msg.type === 'SOC_ALERT' ||
          msg.type === 'POLICY_ENFORCEMENT_TRIGGER' ||
          msg.type === 'SOCIAL_ENGINEERING_ALERT'
        ) {
          setLiveAlerts((prev) => [
            {
              id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              type: msg.type,
              callId: msg.callId,
              severity:
                msg.payload?.severity ||
                (msg.type === 'POLICY_ENFORCEMENT_TRIGGER' ? 'CRITICAL' : 'HIGH'),
              message:
                msg.payload?.message ||
                msg.payload?.rule_name ||
                msg.payload?.explanation ||
                'Security event detected during live stream analysis',
              action: msg.payload?.action || msg.payload?.recommended_action || 'STEP_UP_VERIFICATION',
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

  // Identify the Primary High-Risk Security Event dynamically from real application state
  const primaryIncident = incidentsList.find(
    (i: any) => i.severity === 'CRITICAL' || i.severity === 'HIGH' || i.status === 'INVESTIGATING'
  );
  const primaryCall = callsList.find(
    (c: any) =>
      c.riskLevel === 'CRITICAL' ||
      c.riskLevel === 'HIGH' ||
      (typeof c.riskScore === 'number' && c.riskScore >= 0.7)
  ) || callsList[0];

  return (
    <div className="flex min-h-screen bg-[#05070d]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Security Operations Center"
          subtitle="Real-Time Voice Threat Monitoring & Response"
        />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto max-w-7xl w-full mx-auto">
          {/* Top Operational KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Active Calls"
              value={stats.activeCalls}
              icon={PhoneCall}
              subtext="Monitored Voice Streams"
              statusColor={stats.activeCalls > 0 ? 'cyan' : 'slate'}
              href="/calls"
            />
            <MetricCard
              label="Active Threats"
              value={stats.activeThreats}
              icon={ShieldAlert}
              subtext="Impersonation / Fraud Signals"
              statusColor={stats.activeThreats > 0 ? 'rose' : 'emerald'}
              href="/risk"
            />
            <MetricCard
              label="Pending Verifications"
              value={stats.pendingVerifications}
              icon={Lock}
              subtext="Out-of-Band Step-Up Decoupled"
              statusColor={stats.pendingVerifications > 0 ? 'amber' : 'slate'}
              href="/verification"
            />
            <MetricCard
              label="Open Incidents"
              value={stats.openIncidents}
              icon={AlertTriangle}
              subtext="Case Management Triage"
              statusColor={stats.openIncidents > 0 ? 'rose' : 'emerald'}
              href="/incidents"
            />
          </div>

          {/* Primary High-Priority Security Event (DETECT -> EXPLAIN -> ASSESS -> RESPOND) */}
          {primaryIncident || (primaryCall && stats.activeThreats > 0) ? (
            <div className="p-5 rounded-xl border border-rose-500/30 bg-gradient-to-r from-rose-950/30 via-[#0c1222] to-[#0c1222] space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400 shrink-0">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {primaryIncident?.severity || 'HIGH RISK'} VOICE SECURITY EVENT
                      </span>
                      <span className="text-xs font-mono text-cyan-400">
                        {primaryCall?.callerIdentifier || 'Active Voice Session'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white font-sans mt-0.5">
                      {primaryIncident?.title || 'Elevated Threat Signals Detected'}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">
                      Composite Threat
                    </div>
                    <div className="text-2xl font-bold font-mono text-rose-400">
                      {typeof primaryCall?.riskScore === 'number' && Number.isFinite(primaryCall.riskScore)
                        ? `${Math.round(primaryCall.riskScore > 1 ? primaryCall.riskScore : primaryCall.riskScore * 100)}%`
                        : typeof primaryIncident?.riskScore === 'number' && Number.isFinite(primaryIncident.riskScore)
                        ? `${Math.round(primaryIncident.riskScore > 1 ? primaryIncident.riskScore : primaryIncident.riskScore * 100)}%`
                        : '—'}
                    </div>
                  </div>
                  <div className="text-right pl-3 border-l border-slate-800">
                    <div className="text-[10px] uppercase tracking-wider font-mono text-slate-500">
                      Confidence
                    </div>
                    <div className="text-sm font-semibold font-mono text-slate-300">
                      {typeof primaryCall?.confidence === 'number' && Number.isFinite(primaryCall.confidence)
                        ? `${Math.round(primaryCall.confidence > 1 ? primaryCall.confidence : primaryCall.confidence * 100)}%`
                        : typeof primaryIncident?.confidence === 'number' && Number.isFinite(primaryIncident.confidence)
                        ? `${Math.round(primaryIncident.confidence > 1 ? primaryIncident.confidence : primaryIncident.confidence * 100)}%`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                    Contributing Threat Indicators (Evidence)
                  </span>
                  {primaryIncident?.evidenceSummary && primaryIncident.evidenceSummary.length > 0 ? (
                    <ul className="space-y-1 text-slate-300 font-sans">
                      {primaryIncident.evidenceSummary.map((ev: any, idx: number) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                          <span>{ev.title || ev.detail || ev.category}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 font-sans italic">
                      {primaryIncident?.description || 'Active multi-modal audio telemetry evaluated above safe policy thresholds.'}
                    </p>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between space-y-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                      Deterministic Recommended Response
                    </span>
                    <p className="text-slate-200 font-sans mt-1">
                      Policy <strong className="text-white font-mono">POL-VOICE-STEPUP-01</strong> requires independent out-of-band identity challenge before releasing sensitive credentials or executing high-value wires.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <Link
                      href="/verification"
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/20"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>DISPATCH STEP-UP</span>
                    </Link>
                    <Link
                      href="/incidents"
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                    >
                      REVIEW INCIDENT
                    </Link>
                    <Link
                      href="/calls"
                      className="px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors ml-auto flex items-center gap-1"
                    >
                      <span>LIVE HUD</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#0c1222] border border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white font-sans">
                    System State: Normal Voice Operations
                  </h4>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Zero active critical threat indicators across current monitored streams.
                  </p>
                </div>
              </div>
              <SecurityStatusBadge status="SAFE" size="sm" />
            </div>
          )}

          {/* Main 2-Column Section: Active Calls + Platform Services */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Voice Calls Queue */}
            <div className="lg:col-span-2 space-y-3">
              <SectionHeader
                title="Active Call Sessions"
                subtitle="Live voice streams monitored by real-time neural acoustic & conversational models"
                icon={PhoneCall}
                count={callsList.length}
                onRefresh={loadData}
                loading={loading}
              />

              <div className="space-y-2.5">
                {callsList.length === 0 && !loading ? (
                  <EmptyState
                    title="No Active Voice Calls"
                    description="Incoming SIP trunk calls and live microphone sessions will appear here automatically."
                    actionLabel="Open Live Calls Console"
                    onAction={() => (window.location.href = '/calls')}
                  />
                ) : (
                  callsList.map((call) => {
                    const isThreat =
                      call.riskLevel === 'CRITICAL' ||
                      call.riskLevel === 'HIGH' ||
                      (typeof call.riskScore === 'number' && call.riskScore >= 0.7);

                    return (
                      <div
                        key={call.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isThreat
                            ? 'bg-[#0c1222] border-rose-500/30 hover:border-rose-500/50'
                            : 'bg-[#0c1222] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-lg ${
                                isThreat
                                  ? 'bg-rose-500/10 text-rose-400'
                                  : 'bg-indigo-500/10 text-indigo-400'
                              }`}
                            >
                              <PhoneCall className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-white">
                                  {call.callerIdentifier}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {call.id.slice(0, 8)}...
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                                Channel: {call.channelType || 'WIDEBAND'} • Protocol: {call.protocol || 'WEBRTC'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 justify-between sm:justify-end">
                            <SecurityStatusBadge
                              status={
                                isThreat
                                  ? 'HIGH_RISK'
                                  : call.status === 'ACTIVE'
                                  ? 'ANALYZING'
                                  : 'SAFE'
                              }
                              size="xs"
                            />

                            {typeof call.riskScore === 'number' && (
                              <div className="text-right font-mono text-xs font-bold">
                                <span className={isThreat ? 'text-rose-400' : 'text-emerald-400'}>
                                  {formatPercentage(call.riskScore)}
                                </span>
                              </div>
                            )}

                            <Link
                              href="/calls"
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 hover:text-white transition-colors"
                            >
                              VIEW HUD
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Platform Service Health & Live Alert Feed */}
            <div className="space-y-4">
              {/* Platform Service Status Summary */}
              <div className="p-4 rounded-xl bg-[#0c1222] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>System Infrastructure</span>
                  </h3>
                  <Link
                    href="/health"
                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300"
                  >
                    DETAILS →
                  </Link>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-slate-300">Backend Gateway</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      ONLINE (4000)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-slate-300">Acoustic AI Service</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      HEALTHY (8000)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-slate-300">Privacy Firewall</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">ENFORCED</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-slate-300">Policy Engine</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">DETERMINISTIC</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-slate-300">PostgreSQL Store</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {healthData?.components?.database?.status === 'CONNECTED'
                        ? 'CONNECTED'
                        : 'IN-MEMORY STORE'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Threat Alert Feed */}
              <div className="p-4 rounded-xl bg-[#0c1222] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans flex items-center gap-2">
                    <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
                    <span>Live SOC Threat Feed</span>
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">WebSocket</span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {liveAlerts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 font-sans">
                      Listening for real-time security events...
                    </div>
                  ) : (
                    liveAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold text-rose-400">
                            {alert.type}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {formatSafeTime(alert.timestamp)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-sans leading-tight">
                          {alert.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
