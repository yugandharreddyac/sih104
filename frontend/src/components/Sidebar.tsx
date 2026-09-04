'use client';

import React from 'react';
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
} from 'lucide-react';
import { ApiClient } from '@/lib/api';


const NAV_ITEMS = [
  { name: 'SOC Overview', href: '/dashboard', icon: Shield },
  { name: 'Live Calls', href: '/calls', icon: PhoneCall },
  { name: 'Incidents', href: '/incidents', icon: AlertTriangle },
  { name: 'Policy Engine', href: '/policies', icon: FileCheck2 },
  { name: 'Step-Up Verification', href: '/verification', icon: Lock },
  { name: 'Risk Assessment', href: '/risk', icon: BarChart3 },
  { name: 'Audit Logs', href: '/audit', icon: ScrollText },
  { name: 'System Health', href: '/health', icon: Activity },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [user, setUser] = React.useState<any>(null);

  React.useEffect(() => {
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
    <aside className="w-64 bg-[#0c1222] border-r border-slate-800 flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-bold text-base tracking-wider text-white flex items-center gap-1.5">
            <span>VOXSHIELD</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">SOC</span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono tracking-tight">AI Voice Security</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 font-mono">
          Security Operations
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / User Profile */}
      <div className="p-3 border-t border-slate-800 bg-[#0a0f1d]">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-indigo-500/30 border border-indigo-400/30 flex items-center justify-center text-xs font-bold text-indigo-300">
              {getInitials(user?.fullName)}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.fullName || 'SOC Operator'}</p>
              <p className="text-[10px] text-indigo-400 font-mono truncate">{user?.role || 'AUTHENTICATED'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

