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
  Smartphone,
  Radio,
} from 'lucide-react';

interface NavGroup {
  group: string;
  items: {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'MONITOR',
    items: [
      { name: 'SOC Overview', href: '/dashboard', icon: Shield },
      { name: 'Live Surveillance', href: '/calls', icon: PhoneCall, badge: 'LIVE' },
    ],
  },
  {
    group: 'INVESTIGATE',
    items: [
      { name: 'Incidents & Forensics', href: '/incidents', icon: AlertTriangle },
      { name: 'Risk Assessment', href: '/risk', icon: BarChart3 },
      { name: 'Audit & Compliance', href: '/audit', icon: ScrollText },
    ],
  },
  {
    group: 'CONTROL',
    items: [
      { name: 'Policy Engine', href: '/policies', icon: FileCheck2 },
      { name: 'Step-Up Verification', href: '/verification', icon: Lock },
    ],
  },
  {
    group: 'SYSTEM',
    items: [
      { name: 'System Health', href: '/health', icon: Activity },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('voxshield_token');
      localStorage.removeItem('voxshield_user');
      window.location.href = '/';
    }
  };

  return (
    <aside className="w-64 bg-[#1A1A1F] border-r border-[#3A3A42] flex flex-col h-screen sticky top-0 shrink-0 select-none z-30 shadow-xl shadow-black/40">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#3A3A42] flex items-center gap-3 bg-[#24242B]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7A1F3D] to-[#482E52] flex items-center justify-center shadow-md border border-[#3A3A42] shrink-0">
          <Shield className="w-5 h-5 text-[#F5F5F7]" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm tracking-wider text-[#F5F5F7] flex items-center gap-1.5">
            <span className="font-black">VOXSHIELD</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#7A1F3D]/25 text-[#F5F5F7] font-mono border border-[#7A1F3D]/50 shadow-sm">SOC</span>
          </div>
          <p className="text-[10px] text-[#A0A4AE] font-mono tracking-tight truncate flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#168F86] animate-pulse"></span>
            Zero-Trust Audio Defense
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((section) => (
          <div key={section.group} className="space-y-1">
            <div className="px-3 text-[10px] font-bold tracking-wider text-[#A0A4AE] font-mono flex items-center justify-between">
              <span>{section.group}</span>
              <span className="text-[9px] text-[#A0A4AE]/70 font-normal">v2.4</span>
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[#7A1F3D] text-[#F5F5F7] border border-[#7A1F3D] shadow-sm font-semibold'
                      : 'text-[#A0A4AE] hover:text-[#F5F5F7] hover:bg-[#24242B] border border-transparent hover:border-[#3A3A42]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-[#F5F5F7]' : 'text-[#A0A4AE] group-hover:text-[#F5F5F7]'}`} />
                    <span className="truncate">{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#D94A5A]/20 text-[#D94A5A] border border-[#D94A5A]/40 font-mono font-bold animate-pulse shrink-0 shadow-sm">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        {/* Consumer View Group */}
        <div className="pt-2 border-t border-[#3A3A42] space-y-1">
          <div className="px-3 text-[10px] font-bold tracking-wider text-[#A0A4AE] font-mono">
            CONSUMER
          </div>
          <Link
            href="/consumer"
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
              pathname === '/consumer'
                ? 'bg-[#7A1F3D] text-[#F5F5F7] border border-[#7A1F3D] shadow-sm font-semibold'
                : 'text-[#A0A4AE] hover:text-[#F5F5F7] hover:bg-[#24242B] border border-transparent hover:border-[#3A3A42]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Smartphone className={`w-4 h-4 shrink-0 ${pathname === '/consumer' ? 'text-[#F5F5F7]' : 'text-[#A0A4AE]'}`} />
              <span className="truncate">Consumer Call App</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#482E52]/40 text-[#F5F5F7] border border-[#3A3A42] font-mono shadow-sm">
              APP
            </span>
          </Link>
        </div>
      </nav>

      {/* Operator Session Footer */}
      <div className="p-3 border-t border-[#3A3A42] bg-[#1A1A1F]">
        <div className="flex items-center justify-between p-2 rounded-lg bg-[#24242B] border border-[#3A3A42] shadow-sm">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-lg bg-[#482E52] border border-[#3A3A42] flex items-center justify-center text-xs font-bold text-[#F5F5F7] shrink-0 shadow-sm">
              SA
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-[#F5F5F7] truncate">SOC Analyst</p>
              <p className="text-[10px] text-[#A0A4AE] font-mono truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#168F86] animate-pulse"></span>
                ACTIVE_OPERATOR
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-1.5 text-[#A0A4AE] hover:text-[#D94A5A] hover:bg-[#D94A5A]/15 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
