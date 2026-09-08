'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield,
  PhoneCall,
  AlertTriangle,
  FileCheck2,
  Lock,
  BarChart3,
  ScrollText,
  Activity,
  LogOut,
  Radio,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';

const NAV_GROUPS = [
  {
    group: 'MONITOR',
    items: [
      { name: 'SOC Overview', href: '/dashboard', icon: Shield },
      { name: 'Live Calls', href: '/calls', icon: PhoneCall, isLive: true },
    ],
  },
  {
    group: 'RESPOND',
    items: [
      { name: 'Incidents', href: '/incidents', icon: AlertTriangle },
      { name: 'Step-Up Verification', href: '/verification', icon: Lock },
    ],
  },
  {
    group: 'ANALYZE',
    items: [
      { name: 'Risk Assessment', href: '/risk', icon: BarChart3 },
      { name: 'Policy Engine', href: '/policies', icon: FileCheck2 },
    ],
  },
  {
    group: 'GOVERN',
    items: [
      { name: 'Audit Logs', href: '/audit', icon: ScrollText },
      { name: 'System Health', href: '/health', icon: Activity },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const localUser = ApiClient.getUser();
    if (localUser) {
      setUser(localUser);
    } else {
      ApiClient.get('/auth/me').then((res) => {
        if (res.success && res.data) {
          setUser(res.data);
        }
      });
    }
  }, []);

  const handleLogout = () => {
    ApiClient.clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'SO';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside className="w-64 bg-[#070b17] border-r border-[#24304a] flex flex-col h-screen sticky top-0 shrink-0 select-none z-40">
      {/* Brand Header — Indian Cyber Command Identity */}
      <div className="p-4 border-b border-[#24304a] flex items-center gap-3 relative">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm tracking-wider text-white flex items-center gap-1.5 font-sans">
            <span>VOXSHIELD</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 font-mono border border-cyan-500/20">
              SOC
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff9933] ml-auto shrink-0" title="Indian Cyber Command Node" />
          </div>
          <p className="text-[10px] text-slate-400 font-sans tracking-tight">
            National Cyber Security Operations
          </p>
        </div>
      </div>

      {/* Categorized Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.group} className="space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
              {group.group}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname?.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all relative ${
                    isActive
                      ? 'bg-[#151f38] text-cyan-300 border border-[#2a3b5c] shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#10182d] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-cyan-400' : 'text-slate-400'
                      }`}
                    />
                    <span className="font-sans truncate">{item.name}</span>
                  </div>

                  {isActive && (
                    <span className="w-1 h-3.5 rounded-full bg-cyan-400 absolute right-1.5" />
                  )}

                  {item.isLive && (
                    <span className="flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 mr-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                      <span>LIVE</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Session Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-[#080d1a]">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300 font-mono shrink-0">
              {getInitials(user?.fullName)}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-200 font-sans truncate">
                {user?.fullName || 'SOC Operator'}
              </p>
              <p className="text-[10px] text-indigo-400 font-mono truncate">
                {user?.role || 'AUTHENTICATED'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout Session"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};


