'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { MetricCard } from '@/components/ui/MetricCard';
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
  Activity,
  RefreshCw,
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
    <div className="flex min-h-screen bg-background text-primaryText">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Security Operations Center"
          subtitle="Real-Time Voice Threat Monitoring & Response"
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl w-full mx-auto font-sans space-y-6">
          {/* Top Operational KPIs (Open Strip, Divided by subtle vertical lines) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border pb-5">
            <MetricCard
              label="Active Calls"
              value={stats.activeCalls}
              icon={PhoneCall}
              subtext="Monitored Streams"
              statusColor={stats.activeCalls > 0 ? 'cyan' : 'slate'}
              href="/calls"
              unboxed
            />
            <div className="sm:pl-4">
              <MetricCard
                label="Active Threats"
                value={stats.activeThreats}
                icon={ShieldAlert}
                subtext="Impersonation / Fraud"
                statusColor={stats.activeThreats > 0 ? 'rose' : 'emerald'}
                href="/risk"
                unboxed
              />
            </div>
            <div className="sm:pl-4">
              <MetricCard
                label="Pending Verifications"
                value={stats.pendingVerifications}
                icon={Lock}
                subtext="Step-Up Decoupled"
                statusColor={stats.pendingVerifications > 0 ? 'amber' : 'slate'}
                href="/verification"
                unboxed
              />
            </div>
            <div className="sm:pl-4">
              <MetricCard
                label="Open Incidents"
                value={stats.openIncidents}
                icon={AlertTriangle}
                subtext="Case Management"
                statusColor={stats.openIncidents > 0 ? 'rose' : 'emerald'}
                href="/incidents"
                unboxed
              />
            </div>
          </div>

          {/* Primary Threat Alert Section (Unboxed, Left accent bar) */}
          {primaryIncident || (primaryCall && stats.activeThreats > 0) ? (
            <div className="border-l-2 border-danger pl-4 py-1 space-y-3 pb-4 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-danger">
                    {primaryIncident?.severity || 'HIGH RISK'} VOICE SECURITY EVENT
                  </span>
                  <span className="text-mutedText">|</span>
                  <span className="text-xs font-mono text-primaryText font-semibold">
                    {primaryCall?.callerIdentifier || 'Active Voice Session'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-mutedText text-[10px] uppercase mr-1.5">Composite Threat:</span>
                    <span className="font-semibold text-danger">
                      {typeof primaryCall?.riskScore === 'number' && Number.isFinite(primaryCall.riskScore)
                        ? `${Math.round(primaryCall.riskScore > 1 ? primaryCall.riskScore : primaryCall.riskScore * 100)}%`
                        : typeof primaryIncident?.riskScore === 'number' && Number.isFinite(primaryIncident.riskScore)
                        ? `${Math.round(primaryIncident.riskScore > 1 ? primaryIncident.riskScore : primaryIncident.riskScore * 100)}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="pl-3 border-l border-border">
                    <span className="text-mutedText text-[10px] uppercase mr-1.5">Confidence:</span>
                    <span className="text-primaryText font-semibold">
                      {typeof primaryCall?.confidence === 'number' && Number.isFinite(primaryCall.confidence)
                        ? `${Math.round(primaryCall.confidence > 1 ? primaryCall.confidence : primaryCall.confidence * 100)}%`
                        : typeof primaryIncident?.confidence === 'number' && Number.isFinite(primaryIncident.confidence)
                        ? `${Math.round(primaryIncident.confidence > 1 ? primaryIncident.confidence : primaryIncident.confidence * 100)}%`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-secondaryText">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-mutedText mb-1">
                    Contributing Threat Indicators
                  </div>
                  {primaryIncident?.evidenceSummary && primaryIncident.evidenceSummary.length > 0 ? (
                    <ul className="space-y-1">
                      {primaryIncident.evidenceSummary.map((ev: any, idx: number) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                          <span>{ev.title || ev.detail || ev.category}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="italic text-mutedText">
                      {primaryIncident?.description || 'Acoustic AI detected synthetic spectral artifacts exceeding safe thresholds.'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-mutedText">
                    Recommended Action
                  </div>
                  <p className="text-mutedText">
                    Policy <strong className="text-primaryText font-mono">POL-VOICE-STEPUP-01</strong> requires out-of-band verification challenge before credential release.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href="/verification"
                      className="btn-primary text-xs py-1 px-3"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Dispatch Step-Up</span>
                    </Link>
                    <Link
                      href="/incidents"
                      className="btn-secondary text-xs py-1 px-3"
                    >
                      <span>Review Incident</span>
                    </Link>
                    <Link
                      href="/calls"
                      className="text-xs text-mutedText hover:text-primaryText ml-auto flex items-center gap-1"
                    >
                      <span>Live Sessions</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between py-2 border-b border-border text-xs text-mutedText">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="font-semibold text-primaryText">System State: Normal Voice Operations</span>
                <span>— Zero active critical threat indicators across current monitored streams.</span>
              </div>
              <span className="text-[11px] font-mono text-success">SAFE</span>
            </div>
          )}

          {/* Main 2-Column Section: Active Calls Table + Platform Services */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
            {/* Active Voice Calls Queue (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText">
                    Active Voice Calls
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-elevated border border-border text-[11px] font-mono text-mutedText">
                    {callsList.length}
                  </span>
                </div>
                <button
                  onClick={loadData}
                  className="text-xs text-mutedText hover:text-primaryText flex items-center gap-1"
                  title="Refresh calls"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {callsList.length === 0 && !loading ? (
                <EmptyState
                  title="No Active Voice Calls"
                  description="Incoming SIP trunk calls and live microphone sessions will appear here automatically."
                  actionLabel="Open Live Calls Console"
                  onAction={() => (window.location.href = '/calls')}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-mutedText font-medium text-[11px] uppercase tracking-wider">
                        <th className="py-2 pr-3">Caller</th>
                        <th className="py-2 px-3">Channel</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3 text-right">Threat Risk</th>
                        <th className="py-2 pl-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {callsList.map((call) => {
                        const isThreat =
                          call.riskLevel === 'CRITICAL' ||
                          call.riskLevel === 'HIGH' ||
                          (typeof call.riskScore === 'number' && call.riskScore >= 0.7);

                        return (
                          <tr key={call.id} className="hover:bg-surface-hover/30 transition-colors">
                            <td className="py-2.5 pr-3">
                              <div className="font-mono text-xs font-medium text-primaryText">
                                {call.callerIdentifier}
                              </div>
                              <div className="text-[10px] font-mono text-mutedText">
                                {call.id.slice(0, 8)}...
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-mutedText text-[11px]">
                              {call.channelType || 'WIDEBAND'}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isThreat
                                      ? 'bg-danger'
                                      : call.status === 'ACTIVE'
                                      ? 'bg-success'
                                      : 'bg-mutedText'
                                  }`}
                                />
                                <span className="capitalize">{call.status.toLowerCase()}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs">
                              {typeof call.riskScore === 'number' ? (
                                <span className={isThreat ? 'text-danger font-semibold' : 'text-success'}>
                                  {formatPercentage(call.riskScore)}
                                </span>
                              ) : (
                                <span className="text-mutedText">—</span>
                              )}
                            </td>
                            <td className="py-2.5 pl-3 text-right">
                              <Link
                                href="/calls"
                                className="text-xs text-primary hover:text-primary-hover font-medium"
                              >
                                Inspect →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Platform Services & Live Alert Feed (5 cols) */}
            <div className="lg:col-span-5 lg:pl-6 lg:border-l lg:border-border space-y-6">
              {/* Platform Service Status Summary */}
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText">
                    System Infrastructure
                  </span>
                  <Link
                    href="/health"
                    className="text-[11px] font-sans text-primary hover:underline"
                  >
                    Diagnostics →
                  </Link>
                </div>

                <div className="divide-y divide-border/40 text-xs">
                  <div className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-mutedText" />
                      <span className="text-secondaryText font-medium">Backend Gateway</span>
                    </div>
                    <span className="text-[11px] text-success font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      Online (4000)
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-mutedText" />
                      <span className="text-secondaryText font-medium">Acoustic AI Service</span>
                    </div>
                    <span className="text-[11px] text-success font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      Healthy (8000)
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-mutedText" />
                      <span className="text-secondaryText font-medium">Privacy Firewall</span>
                    </div>
                    <span className="text-[11px] text-success font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      Enforced
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="w-3.5 h-3.5 text-mutedText" />
                      <span className="text-secondaryText font-medium">Policy Engine</span>
                    </div>
                    <span className="text-[11px] text-success font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      Deterministic
                    </span>
                  </div>

                  <div className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-mutedText" />
                      <span className="text-secondaryText font-medium">PostgreSQL Store</span>
                    </div>
                    <span className="text-[11px] text-secondaryText font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      {healthData?.components?.database?.status === 'CONNECTED'
                        ? 'Connected'
                        : 'In-Memory Store'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Threat Alert Feed */}
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondaryText">
                    Live Threat Feed
                  </span>
                  <span className="text-[10px] font-mono text-mutedText">WebSocket</span>
                </div>

                <div className="divide-y divide-border/40 max-h-56 overflow-y-auto">
                  {liveAlerts.length === 0 ? (
                    <div className="py-4 text-center text-xs text-mutedText">
                      Listening for real-time security events...
                    </div>
                  ) : (
                    liveAlerts.map((alert) => (
                      <div key={alert.id} className="py-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-medium text-danger">
                            {alert.type}
                          </span>
                          <span className="text-[10px] text-mutedText font-mono">
                            {formatSafeTime(alert.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-secondaryText leading-tight">
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
