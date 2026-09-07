'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Activity, Bell, Cpu, Lock, User } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export const Navbar: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const [gatewayStatus, setGatewayStatus] = useState<boolean | null>(null);
  const [aiStatus, setAiStatus] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    const checkHealth = async () => {
      try {
        const res = await ApiClient.get('/health');
        if (mounted) {
          const isHealthy = res.status === 'HEALTHY' || res.success === true;
          setGatewayStatus(isHealthy);
          const aiServiceHealthy =
            res.components?.aiService?.status === 'HEALTHY' ||
            res.components?.ai_service?.status === 'HEALTHY';
          setAiStatus(Boolean(aiServiceHealthy));
        }
      } catch {
        if (mounted) {
          setGatewayStatus(false);
          setAiStatus(false);
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
    <header className="h-16 border-b border-slate-800/80 bg-[#070b14]/95 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 select-none">
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
        {/* Gateway Status */}
        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-mono font-medium ${
            gatewayStatus === null
              ? 'bg-slate-900 border-slate-800 text-slate-400'
              : gatewayStatus
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
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
        </div>

        {/* AI Engine Status */}
        <div
          className={`hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-mono font-medium ${
            aiStatus === null
              ? 'bg-slate-900 border-slate-800 text-slate-400'
              : aiStatus
              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{aiStatus ? 'AI SERVICE HEALTHY' : 'AI DEGRADED'}</span>
        </div>

        {/* Privacy Firewall Badge */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono font-medium">
          <Lock className="w-3.5 h-3.5 text-indigo-400" />
          <span>PRIVACY ENFORCED</span>
        </div>

        {/* Active Analyst Avatar */}
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


