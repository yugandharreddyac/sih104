'use client';

import React from 'react';
import { Activity, Bell, Radio, ShieldCheck } from 'lucide-react';
import { Phase1Notice } from './Phase1Notice';
import { ApiClient } from '@/lib/api';


export const Navbar: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const [isOnline, setIsOnline] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const res = await ApiClient.get('/health');
        if (mounted) {
          setIsOnline(res.status === 'HEALTHY' || res.success === true || !!res.components);
        }
      } catch {
        if (mounted) setIsOnline(false);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="h-16 border-b border-slate-800 bg-[#0a0f1d]/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h1 className="text-base font-bold text-white flex items-center gap-2">
          <span>{title}</span>
        </h1>
        {subtitle && <p className="text-xs text-slate-400 font-mono">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        <Phase1Notice compact />

        {isOnline === null ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse"></span>
            <span>CONNECTING...</span>
          </div>
        ) : isOnline ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>GATEWAY ONLINE</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
            <span>BACKEND OFFLINE</span>
          </div>
        )}

        <button className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700/60 relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
        </button>
      </div>
    </header>
  );
};

