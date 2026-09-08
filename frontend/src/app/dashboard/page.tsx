'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { MetricCard } from '@/components/ui/MetricCard';
import {
  PhoneCall,
  AlertTriangle,
  Lock,
  FileCheck2,
  ShieldAlert,
  Server,
  Cpu,
  Database,
  ArrowRight,
  Radio,
  Activity,
  RefreshCw,
  ExternalLink,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { ApiClient, WS_BASE } from '@/lib/api';
import { formatSafeTime, formatSafeDateTime, formatPercentage } from '@/lib/format';

interface AuditItem {
  id: string;
  action: string;
  resourceType: string;
  actorUserId?: string;
  correlationId?: string;
  result: 'SUCCESS' | 'ERROR';
  timestamp: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    activeCalls: 0,
    activeThreats: 0,
    pendingVerifications: 0,
    enforcedPolicies: 0,
    openIncidents: 0,
  });

  const [callsList, setCallsList] = useState<any[]>([]);
  const [incidentsList, setIncidentsList] = useState<any[]>([]);
  const [auditList, setAuditList] = useState<AuditItem[]>([]);
  const [healthData, setHealthData] = useState<any | null>(null);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [callsRes, incRes, polRes, verRes, healthRes, auditRes] = await Promise.all([
        ApiClient.get('/calls'),
        ApiClient.get('/incidents'),
        ApiClient.get('/policies'),
        ApiClient.get('/verification'),
        ApiClient.get('/health'),
        ApiClient.get('/audit'),
      ]);

      let activeThreatsCount = 0;
      if (callsRes.success && Array.isArray(callsRes.data)) {
        setCallsList(callsRes.data);
        activeThreatsCount = callsRes.data.filter(
          (c: any) =>
            c.riskLevel === 'CRITICAL' ||
            c.riskLevel === 'HIGH' ||
            (typeof c.riskScore === 'number' && (c.riskScore > 1 ? c.riskScore >= 70 : c.riskScore >= 0.7))
        ).length;
      } else {
        setCallsList([]);
      }

      let openIncCount = 0;
      if (incRes.success && Array.isArray(incRes.data)) {
        setIncidentsList(incRes.data);
        openIncCount = incRes.data.filter(
          (i: any) => i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
        ).length;
      } else {
        setIncidentsList([]);
      }

      let pendingVerCount = 0;
      if (verRes.success && Array.isArray(verRes.data)) {
        pendingVerCount = verRes.data.filter((v: any) => v.status === 'PENDING').length;
      }

      let policyCount = 0;
      if (polRes.success && Array.isArray(polRes.data)) {
        policyCount = polRes.data.length;
      }

      if (auditRes.success && Array.isArray(auditRes.data)) {
        setAuditList(auditRes.data.slice(0, 7));
      } else {
        setAuditList([]);
      }

      setStats({
        activeCalls: Array.isArray(callsRes.data) ? callsRes.data.length : 0,
        activeThreats: Math.max(activeThreatsCount, openIncCount > 0 ? openIncCount : 0),
        pendingVerifications: pendingVerCount,
        enforcedPolicies: policyCount,
        openIncidents: openIncCount,
      });

      if (healthRes && (healthRes.status || healthRes.success || healthRes.components)) {
        setHealthData(healthRes.data || healthRes);
      } else {
        setHealthData(null);
      }
    } catch {
      setHealthData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // WebSocket real-time threat listener
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
          msg.type === 'SOCIAL_ENGINEERING_ALERT' ||
          msg.type === 'RISK_EVALUATION'
        ) {
          setLiveAlerts((prev) => [
            {
              id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              type: msg.type,
              callId: msg.callId,
              severity:
                msg.payload?.severity ||
                (msg.type === 'POLICY_ENFORCEMENT_TRIGGER' ? 'CRITICAL' : 'HIGH'),
              message:
                msg.payload?.message ||
                msg.payload?.rule_name ||
                msg.payload?.explanation ||
                'Voice security event received via real-time WebSocket telemetry',
              timestamp: msg.timestamp || new Date().toISOString(),
            },
            ...prev.slice(0, 14),
          ]);
        }
      } catch {}
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [loadData]);

  // Compute real risk distribution strictly from actual calls and incidents
  const criticalCount =
    callsList.filter((c) => c.riskLevel === 'CRITICAL' || (typeof c.riskScore === 'number' && (c.riskScore > 1 ? c.riskScore >= 70 : c.riskScore >= 0.7)))
      .length + incidentsList.filter((i) => i.severity === 'CRITICAL' && i.status !== 'RESOLVED').length;

  const highCount =
    callsList.filter((c) => c.riskLevel === 'HIGH' || (typeof c.riskScore === 'number' && (c.riskScore > 1 ? c.riskScore >= 40 && c.riskScore < 70 : c.riskScore >= 0.4 && c.riskScore < 0.7)))
      .length + incidentsList.filter((i) => i.severity === 'HIGH' && i.status !== 'RESOLVED').length;

  const lowCount =
    callsList.filter((c) => c.riskLevel === 'LOW' || c.riskLevel === 'SAFE' || (typeof c.riskScore === 'number' && (c.riskScore > 1 ? c.riskScore < 40 : c.riskScore < 0.4)))
      .length + incidentsList.filter((i) => (i.severity === 'LOW' || i.severity === 'MEDIUM') && i.status !== 'RESOLVED').length;

  const totalAssessed = criticalCount + highCount + lowCount;
  const criticalPct = totalAssessed > 0 ? Math.round((criticalCount / totalAssessed) * 100) : 0;
  const highPct = totalAssessed > 0 ? Math.round((highCount / totalAssessed) * 100) : 0;
  const lowPct = totalAssessed > 0 ? Math.round((lowCount / totalAssessed) * 100) : 0;

  const primaryIncident = incidentsList.find(
    (i: any) => (i.severity === 'CRITICAL' || i.severity === 'HIGH') && i.status !== 'RESOLVED'
  );

  const isPostureElevated = stats.activeThreats > 0 || stats.openIncidents > 0;

  // Subsystem helpers to avoid hardcoded status
  const backendComponent = healthData?.components?.backend;
  const aiComponent = healthData?.components?.aiService;
  const privacyComponent = healthData?.components?.privacyFirewall;
  const policyComponent = healthData?.components?.policyEngine;
  const dbComponent = healthData?.components?.database;

  return (
    <div className="flex min-h-screen bg-background text-primaryText">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Security Operations Center"
          subtitle="Real-Time Voice Threat Monitoring & Executive Command Console"
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl w-full mx-auto font-sans space-y-6">
          {/* Operational Posture Banner (Answers: What is happening?) */}
          <div
            className={`p-3.5 sm:p-4 rounded border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isPostureElevated
                ? 'bg-danger/10 border-danger/30 text-primaryText'
                : 'bg-surface border-border text-primaryText'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isPostureElevated ? 'bg-danger animate-ping' : 'bg-success'
                }`}
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-wide uppercase">
                    {isPostureElevated ? 'POSTURE: ELEVATED DEFENSE' : 'POSTURE: NOMINAL VOICE OPERATIONS'}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded uppercase ${
                      isPostureElevated ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'
                    }`}
                  >
                    {isPostureElevated ? 'ACTIVE ATTACK CUES' : 'NOMINAL BASELINE'}
                  </span>
                </div>
                <p className="text-xs text-mutedText mt-0.5">
                  {isPostureElevated
                    ? `${stats.activeThreats} active threat pattern detected requiring analyst containment or step-up verification.`
                    : 'All monitored voice streams and biometric authentication channels operating within safe acoustic baseline.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={loadData}
                className="btn-secondary text-xs py-1 px-2.5"
                title="Synchronize state from backend"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
              <Link href="/calls" className="btn-primary text-xs py-1 px-3">
                <PhoneCall className="w-3 h-3" />
                <span>Live Calls Console</span>
              </Link>
            </div>
          </div>

          {/* Top Operational KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Active Voice Streams"
              value={stats.activeCalls}
              icon={PhoneCall}
              subtext="Monitored Voice Sessions"
              statusColor={stats.activeCalls > 0 ? 'cyan' : 'slate'}
              href="/calls"
            />
            <MetricCard
              label="Voice Spoof Attacks"
              value={stats.activeThreats}
              icon={ShieldAlert}
              subtext="Open Threat Incidents"
              statusColor={stats.activeThreats > 0 ? 'rose' : 'emerald'}
              href="/incidents"
            />
            <MetricCard
              label="Pending Step-Up"
              value={stats.pendingVerifications}
              icon={Lock}
              subtext="Out-of-Band MFA Challenges"
              statusColor={stats.pendingVerifications > 0 ? 'amber' : 'slate'}
              href="/verification"
            />
            <MetricCard
              label="Enforced Guardrails"
              value={stats.enforcedPolicies}
              icon={FileCheck2}
              subtext="Active Deterministic Rules"
              statusColor="emerald"
              href="/policies"
            />
          </div>

          {/* High-Priority Investigation Banner (Answers: What threats require attention?) */}
          {primaryIncident && (
            <div className="p-4 rounded border border-danger/40 bg-surface shadow-card space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-danger">
                    CRITICAL PRIORITY INVESTIGATION
                  </span>
                  <span className="text-mutedText">|</span>
                  <span className="text-xs font-mono text-primaryText font-semibold">
                    {primaryIncident.incidentNumber}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-[11px] text-mutedText">Detected:</span>
                  <span className="text-primaryText font-medium">
                    {formatSafeDateTime(primaryIncident.detectedAt || primaryIncident.createdAt)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="md:col-span-2 space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-mutedText">
                    Attack Classification
                  </span>
                  <p className="text-primaryText font-medium leading-snug">
                    {primaryIncident.attackClassification || primaryIncident.title}
                  </p>
                  <p className="text-[11px] text-secondaryText">
                    Triggered Policies:{' '}
                    <span className="font-mono text-danger font-semibold">
                      {primaryIncident.triggeredPolicies?.join(', ') || 'POL-CRED-001 (Credential Theft Block)'}
                    </span>
                  </p>
                </div>

                <div className="space-y-2 flex flex-col justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-mutedText">
                    Autonomous Actions Taken
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {primaryIncident.actionsTaken?.map((act: string) => (
                      <span
                        key={act}
                        className="px-2 py-0.5 rounded bg-danger/10 text-danger border border-danger/20 font-mono text-[10px] font-semibold"
                      >
                        {act}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={`/verification?callId=${primaryIncident.callId}`}
                      className="btn-primary text-xs py-1 px-2.5"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Dispatch Step-Up</span>
                    </Link>
                    <Link
                      href="/incidents"
                      className="btn-secondary text-xs py-1 px-2.5"
                    >
                      <span>Contain Incident</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3-Column Middle Analytical Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 Cols: Active Calls Queue & Risk Spectrum */}
            <div className="lg:col-span-8 space-y-6">
              {/* Risk Distribution Spectrum */}
              <div className="p-4 rounded border border-border bg-surface shadow-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primaryText">
                      Threat Risk Distribution Spectrum
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-mutedText">
                    {totalAssessed} Total Assessed
                  </span>
                </div>

                {/* Proportional Segmented Bar or Empty State */}
                {totalAssessed === 0 ? (
                  <div className="py-2 text-center text-xs text-mutedText font-sans">
                    No active voice sessions or incidents in evaluation queue.
                  </div>
                ) : (
                  <>
                    <div className="h-2.5 w-full rounded bg-surface-elevated overflow-hidden flex">
                      {criticalPct > 0 && (
                        <div
                          style={{ width: `${criticalPct}%` }}
                          className="bg-danger transition-all duration-300"
                          title={`Critical Risk: ${criticalCount} (${criticalPct}%)`}
                        />
                      )}
                      {highPct > 0 && (
                        <div
                          style={{ width: `${highPct}%` }}
                          className="bg-warning transition-all duration-300"
                          title={`High Risk: ${highCount} (${highPct}%)`}
                        />
                      )}
                      {lowPct > 0 && (
                        <div
                          style={{ width: `${lowPct}%` }}
                          className="bg-success transition-all duration-300"
                          title={`Safe/Low Risk: ${lowCount} (${lowPct}%)`}
                        />
                      )}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center justify-between text-xs font-mono pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-danger" />
                        <span className="text-secondaryText">Critical (≥70%):</span>
                        <span className="font-semibold text-danger">{criticalCount}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-warning" />
                        <span className="text-secondaryText">High (40-69%):</span>
                        <span className="font-semibold text-warning">{highCount}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-success" />
                        <span className="text-secondaryText">Safe/Low (&lt;40%):</span>
                        <span className="font-semibold text-success">{lowCount}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Active Voice Calls Table (Answers: What calls are active?) */}
              <div className="rounded border border-border bg-surface shadow-subtle overflow-hidden">
                <div className="p-3.5 border-b border-border flex items-center justify-between bg-surface-elevated">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primaryText">
                      Monitored Voice Streams
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-mutedText">
                      {callsList.length}
                    </span>
                  </div>
                  <Link href="/calls" className="text-xs text-primary hover:underline flex items-center gap-1">
                    <span>Manage Live Mic</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {callsList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-mutedText">
                    No voice sessions currently in intercept queue. Start a live microphone stream in the Calls console.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-mutedText text-[10px] font-semibold uppercase tracking-wider bg-surface-elevated/50">
                          <th className="py-2.5 px-3.5">Caller Identifier</th>
                          <th className="py-2.5 px-3">Channel</th>
                          <th className="py-2.5 px-3">State</th>
                          <th className="py-2.5 px-3 text-right">Composite Risk</th>
                          <th className="py-2.5 px-3.5 text-right">Telemetry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {callsList.map((c) => {
                          const isThreat =
                            c.riskLevel === 'CRITICAL' ||
                            c.riskLevel === 'HIGH' ||
                            (typeof c.riskScore === 'number' && (c.riskScore > 1 ? c.riskScore >= 70 : c.riskScore >= 0.7));

                          return (
                            <tr key={c.id} className="hover:bg-surface-hover/40 transition-colors">
                              <td className="py-2.5 px-3.5">
                                <div className="font-mono text-xs font-semibold text-primaryText">
                                  {c.callerIdentifier}
                                </div>
                                <div className="text-[10px] font-mono text-mutedText">
                                  ID: {c.id.slice(0, 8)}...
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-mutedText text-[11px] font-mono">
                                {c.channelType || 'WIDEBAND'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="inline-flex items-center gap-1.5 text-[11px]">
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      c.status === 'ACTIVE' ? 'bg-success animate-pulse' : 'bg-mutedText'
                                    }`}
                                  />
                                  <span className="capitalize">{c.status?.toLowerCase() || 'active'}</span>
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold">
                                {typeof c.riskScore === 'number' ? (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[11px] ${
                                      isThreat ? 'bg-danger/10 text-danger border border-danger/20' : 'text-success'
                                    }`}
                                  >
                                    {formatPercentage(c.riskScore > 1 ? c.riskScore / 100 : c.riskScore)}
                                  </span>
                                ) : (
                                  <span className="text-mutedText">Evaluating</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 text-right">
                                <Link
                                  href="/calls"
                                  className="text-primary hover:text-primary-hover font-medium inline-flex items-center gap-1"
                                >
                                  <span>Inspect</span>
                                  <ChevronRight className="w-3 h-3" />
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

              {/* Real Activity Timeline (Answers: What is happening?) */}
              <div className="rounded border border-border bg-surface shadow-subtle p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primaryText">
                      Security Audit Log Stream
                    </span>
                  </div>
                  <Link href="/audit" className="text-xs text-primary hover:underline flex items-center gap-1">
                    <span>Full Trail</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                </div>

                <div className="divide-y divide-border/40">
                  {auditList.length === 0 ? (
                    <div className="py-4 text-center text-xs text-mutedText">
                      No security audit events currently recorded.
                    </div>
                  ) : (
                    auditList.map((log) => (
                      <div key={log.id} className="py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              log.result === 'SUCCESS' ? 'bg-success' : 'bg-danger'
                            }`}
                          />
                          <span className="font-mono text-xs text-primaryText font-medium truncate">
                            {log.action}
                          </span>
                          <span className="text-[10px] text-mutedText font-mono hidden sm:inline">
                            [{log.resourceType}]
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] text-mutedText">
                          <span>{formatSafeTime(log.timestamp)}</span>
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-semibold uppercase ${
                              log.result === 'SUCCESS'
                                ? 'bg-success/10 text-success'
                                : 'bg-danger/10 text-danger'
                            }`}
                          >
                            {log.result}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right 4 Cols: System Functioning & Real-Time Alerts */}
            <div className="lg:col-span-4 space-y-6">
              {/* Subsystem Health & Diagnostics (Answers: Is VOXSHIELD functioning correctly?) */}
              <div className="rounded border border-border bg-surface shadow-subtle p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primaryText">
                      Platform Subsystems
                    </span>
                  </div>
                  <Link href="/health" className="text-xs text-primary hover:underline">
                    Diagnostics →
                  </Link>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Backend Gateway */}
                  <div className="p-2.5 rounded bg-surface-elevated border border-border flex items-center justify-between">
                    <div>
                      <div className="font-medium text-primaryText">Backend Gateway</div>
                      <div className="text-[10px] text-mutedText font-mono">
                        {backendComponent?.uptimeSeconds ? `Uptime ${Math.floor(backendComponent.uptimeSeconds)}s` : 'Port 4000 (HTTP/WS)'}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${
                        backendComponent?.status === 'HEALTHY'
                          ? 'text-success bg-success/10 border border-success/20'
                          : backendComponent?.status
                          ? 'text-warning bg-warning/10 border border-warning/20'
                          : 'text-mutedText bg-surface border border-border'
                      }`}
                    >
                      {backendComponent?.status === 'HEALTHY' && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
                      {backendComponent?.status || 'STATUS UNAVAILABLE'}
                    </span>
                  </div>

                  {/* Acoustic AI Service */}
                  <div className="p-2.5 rounded bg-surface-elevated border border-border flex items-center justify-between">
                    <div>
                      <div className="font-medium text-primaryText">Acoustic AI Service</div>
                      <div className="text-[10px] text-mutedText font-mono">
                        {aiComponent?.targetUrl ? `${aiComponent.targetUrl} (${aiComponent.latencyMs || 0}ms)` : 'FastAPI / Port 8000'}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${
                        aiComponent?.status === 'HEALTHY'
                          ? 'text-success bg-success/10 border border-success/20'
                          : aiComponent?.status === 'DEGRADED'
                          ? 'text-warning bg-warning/10 border border-warning/20'
                          : aiComponent?.status
                          ? 'text-danger bg-danger/10 border border-danger/20'
                          : 'text-mutedText bg-surface border border-border'
                      }`}
                    >
                      {aiComponent?.status === 'HEALTHY' && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
                      {aiComponent?.status || 'STATUS UNAVAILABLE'}
                    </span>
                  </div>

                  {/* Privacy Firewall */}
                  <div className="p-2.5 rounded bg-surface-elevated border border-border flex items-center justify-between">
                    <div>
                      <div className="font-medium text-primaryText">Privacy Firewall</div>
                      <div className="text-[10px] text-mutedText font-mono">
                        {privacyComponent?.redactionEngine || 'Pre-Persistence Sanitizer'}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        privacyComponent?.status === 'ACTIVE'
                          ? 'text-success bg-success/10 border border-success/20'
                          : privacyComponent?.status
                          ? 'text-warning bg-warning/10 border border-warning/20'
                          : 'text-mutedText bg-surface border border-border'
                      }`}
                    >
                      {privacyComponent?.status || 'STATUS UNAVAILABLE'}
                    </span>
                  </div>

                  {/* Policy Engine */}
                  <div className="p-2.5 rounded bg-surface-elevated border border-border flex items-center justify-between">
                    <div>
                      <div className="font-medium text-primaryText">Policy Engine</div>
                      <div className="text-[10px] text-mutedText font-mono">
                        {stats.enforcedPolicies > 0
                          ? `${stats.enforcedPolicies} Rules (${policyComponent?.ruleEngine || 'Deterministic'})`
                          : policyComponent?.ruleEngine || 'Rule Engine'}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        policyComponent?.status === 'ACTIVE'
                          ? 'text-primary bg-primary/10 border border-primary/20'
                          : policyComponent?.status
                          ? 'text-warning bg-warning/10 border border-warning/20'
                          : 'text-mutedText bg-surface border border-border'
                      }`}
                    >
                      {policyComponent?.status || 'STATUS UNAVAILABLE'}
                    </span>
                  </div>

                  {/* Persistence Store */}
                  <div className="p-2.5 rounded bg-surface-elevated border border-border flex items-center justify-between">
                    <div>
                      <div className="font-medium text-primaryText">Persistence Store</div>
                      <div className="text-[10px] text-mutedText font-mono">
                        {healthData?.persistenceMode ? `Mode: ${healthData.persistenceMode}` : 'Database Engine'}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        dbComponent?.status === 'CONNECTED'
                          ? 'text-success bg-success/10 border border-success/20'
                          : 'text-secondaryText bg-surface border border-border'
                      }`}
                    >
                      {dbComponent?.status === 'CONNECTED'
                        ? 'CONNECTED'
                        : healthData?.persistenceMode === 'fallback'
                        ? 'IN-MEMORY STORE'
                        : dbComponent?.status || 'STATUS UNAVAILABLE'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-Time WebSocket Alerts Feed */}
              <div className="rounded border border-border bg-surface shadow-subtle p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-danger animate-pulse" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primaryText">
                      Live Telemetry Stream
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-mutedText">Port 4000 /ws</span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {liveAlerts.length === 0 ? (
                    <div className="py-6 text-center text-xs text-mutedText font-sans">
                      <Activity className="w-5 h-5 mx-auto mb-1 text-mutedText/40" />
                      <span>Listening for live streaming threat frames...</span>
                    </div>
                  ) : (
                    liveAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="p-2.5 rounded bg-surface-elevated border border-border text-xs space-y-1 animate-in fade-in"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                              alert.severity === 'CRITICAL'
                                ? 'bg-danger/15 text-danger'
                                : 'bg-warning/15 text-warning'
                            }`}
                          >
                            {alert.type}
                          </span>
                          <span className="text-[10px] text-mutedText font-mono">
                            {formatSafeTime(alert.timestamp)}
                          </span>
                        </div>
                        <p className="text-[11px] text-secondaryText leading-tight">
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
