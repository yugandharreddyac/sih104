'use client';

import React, { useEffect, useState } from 'react';
import { Shield, Activity, Cpu, Lock, User, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export const Navbar: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const [gatewayStatus, setGatewayStatus] = useState<boolean | null>(null);
  const [aiStatus, setAiStatus] = useState<'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'CONNECTING'>('CONNECTING');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    const checkHealth = async () => {
      try {
        const res = await ApiClient.get('/health');
        if (mounted) {
          const isHealthy = res.status === 'HEALTHY' || res.success === true;
          setGatewayStatus(isHealthy);

          const aiStatusStr =
            res.components?.aiService?.status ||
            res.components?.ai_service?.status;

          if (aiStatusStr === 'HEALTHY') {
            setAiStatus('HEALTHY');
          } else if (aiStatusStr === 'DEGRADED') {
            setAiStatus('DEGRADED');
          } else if (aiStatusStr === 'UNAVAILABLE' || aiStatusStr === 'NOT_AVAILABLE' || aiStatusStr === 'OFFLINE') {
            setAiStatus('UNAVAILABLE');
          } else if (isHealthy) {
            setAiStatus('HEALTHY');
          } else {
            setAiStatus('UNAVAILABLE');
          }
        }
      } catch {
        if (mounted) {
          setGatewayStatus(false);
          setAiStatus('UNAVAILABLE');
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);

    const localUser = ApiClient.getUser();
    if (localUser) setUser(localUser);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="h-16 border-b border-[#24304a] bg-[#070b17]/95 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Page Title & Operational Subtitle */}
      <div className="min-w-0 pr-4">
        <h1 className="text-base font-bold text-slate-100 tracking-tight font-sans truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-slate-400 font-sans truncate">{subtitle}</p>
        )}
      </div>

      {/* Real Platform Health & Security Status Badges */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Gateway Status with Tooltip */}
        <div
          className={`group relative flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-mono font-medium cursor-help transition-all ${
            gatewayStatus === null
              ? 'bg-slate-900 border-slate-800 text-slate-400'
              : gatewayStatus
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
          title="Backend REST and WebSocket gateway status on port 4000"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              gatewayStatus === null
                ? 'bg-slate-500 animate-pulse'
                : gatewayStatus
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-rose-400'
            }`}
          />
          <span className="hidden sm:inline">
            {gatewayStatus === null
              ? 'GATEWAY CONNECTING'
              : gatewayStatus
              ? 'GATEWAY ONLINE'
              : 'GATEWAY OFFLINE'}
          </span>
          <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 absolute top-9 right-0 bg-slate-900 border border-slate-700 text-[10px] text-slate-300 px-2 py-1 rounded shadow-xl whitespace-nowrap z-50 font-mono">
            Backend REST & WebSocket telemetry gateway on port 4000
          </div>
        </div>

        {/* AI Engine Status with Tooltip */}
        <div
          className={`group relative hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-mono font-medium cursor-help transition-all ${
            aiStatus === 'CONNECTING'
              ? 'bg-slate-900 border-slate-800 text-slate-400'
              : aiStatus === 'HEALTHY'
              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              : aiStatus === 'DEGRADED'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
          title="Acoustic and conversational AI inference service status on port 8000"
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>
            {aiStatus === 'CONNECTING'
              ? 'AI CONNECTING'
              : aiStatus === 'HEALTHY'
              ? 'AI SERVICE HEALTHY'
              : aiStatus === 'DEGRADED'
              ? 'AI DEGRADED'
              : 'AI UNAVAILABLE'}
          </span>
          <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 absolute top-9 right-0 bg-slate-900 border border-slate-700 text-[10px] text-slate-300 px-2 py-1 rounded shadow-xl whitespace-nowrap z-50 font-mono">
            Neural acoustic deepfake & conversational intent inference on port 8000
          </div>
        </div>

        {/* Privacy Firewall Badge with Tooltip */}
        <div
          className="group relative hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-medium cursor-help"
          title="Zero audio retention privacy firewall enforced across all streams"
        >
          <Lock className="w-3.5 h-3.5 text-indigo-400" />
          <span>PRIVACY ENFORCED</span>
          <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 absolute top-9 right-0 bg-slate-900 border border-slate-700 text-[10px] text-slate-300 px-2 py-1 rounded shadow-xl whitespace-nowrap z-50 font-mono">
            Zero audio retention & real-time credential PII scrubbing active
          </div>
        </div>

        {/* Active Analyst Identity */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 font-mono">
              {user.fullName ? user.fullName[0].toUpperCase() : 'A'}
            </div>
            <div className="hidden xl:block text-left">
              <p className="text-xs font-semibold text-slate-200 font-sans leading-none truncate max-w-[120px]">
                {user.fullName || 'SOC Analyst'}
              </p>
              <p className="text-[10px] text-indigo-400 font-mono leading-none mt-1">
                {user.role || 'SECURITY_ANALYST'}
              </p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
