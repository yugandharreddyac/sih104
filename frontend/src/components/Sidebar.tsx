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
  Network,
  LogOut,
  X,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';

const NAV_GROUPS = [
  {
    group: 'MONITOR',
    items: [
      { name: 'Overview', href: '/dashboard', icon: Shield, badge: undefined },
      { name: 'Live Voice Sessions', href: '/calls', icon: PhoneCall, isLive: true },
    ],
  },
  {
    group: 'RESPOND',
    items: [
      { name: 'Incident Response', href: '/incidents', icon: AlertTriangle, badge: undefined },
      { name: 'Step-Up Verification', href: '/verification', icon: Lock, badge: undefined },
    ],
  },
  {
    group: 'ANALYZE',
    items: [
      { name: 'Risk Assessment', href: '/risk', icon: BarChart3, badge: undefined },
      { name: 'Policy Engine', href: '/policies', icon: FileCheck2, badge: undefined },
      { name: 'Architecture & Diagrams', href: '/diagrams', icon: Network, badge: undefined },
    ],
  },
  {
    group: 'GOVERN',
    items: [
      { name: 'Audit Logs', href: '/audit', icon: ScrollText, badge: undefined },
      { name: 'System Health', href: '/health', icon: Activity, badge: undefined },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

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

    // Custom toggle event listener from mobile Navbar
    const handleToggle = () => setIsMobileOpen((prev) => !prev);
    window.addEventListener('voxshield-toggle-sidebar', handleToggle);
    return () => window.removeEventListener('voxshield-toggle-sidebar', handleToggle);
  }, []);

  // Close drawer on path change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Escape key closes mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen]);

  const handleLogout = () => {
    ApiClient.clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'SA';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const sidebarContent = (
    <aside className="w-64 bg-sidebar border-r border-border flex flex-col h-screen sticky top-0 shrink-0 select-none z-40 font-sans">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between bg-sidebar">
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0 group" title="VOXSHIELD Platform">
          <div className="p-1.5 rounded bg-primary/10 border border-primary/20 text-primary shrink-0 group-hover:scale-105 transition-transform">
            <Shield className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm tracking-wide text-primaryText font-sans truncate flex items-center gap-1.5">
              <span>VOXSHIELD</span>
              <span className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                v1.0
              </span>
            </div>
            <p className="text-[10px] text-mutedText font-mono uppercase tracking-wider truncate leading-none mt-0.5">
              Voice Intelligence SOC
            </p>
          </div>
        </Link>

        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden p-1.5 rounded text-mutedText hover:text-primaryText hover:bg-surface-elevated transition-colors"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Categorized Navigation Links */}
      <nav className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto" aria-label="Main Navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.group} className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-mutedText/80 font-sans">
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
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-sans transition-all group ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary pl-2'
                      : 'text-secondaryText hover:text-primaryText hover:bg-surface-elevated border-l-2 border-transparent pl-2'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-primary' : 'text-mutedText group-hover:text-primaryText'
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>

                  {item.isLive && (
                    <span className="flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/20 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                      <span>LIVE</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Operational Shield Status Widget */}
      <div className="px-3 py-2.5 border-t border-border/60 bg-sidebar/50">
        <div className="p-2 rounded bg-surface-elevated border border-border/80 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-3.5 h-3.5 text-success animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-primaryText leading-none truncate">
                Telemetry Active
              </p>
              <p className="text-[10px] text-mutedText font-mono leading-none mt-1">
                Port 4000 WS / 8000 AI
              </p>
            </div>
          </div>
          <Link
            href="/health"
            className="text-[10px] text-primary hover:underline font-mono"
            title="Inspect health telemetry"
          >
            SLA 99.9%
          </Link>
        </div>
      </div>

      {/* User Session Footer */}
      <div className="p-3 border-t border-border bg-sidebar">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded bg-surface-elevated border border-border flex items-center justify-center text-xs font-semibold text-primaryText font-sans shrink-0">
              {getInitials(user?.fullName)}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-primaryText font-sans truncate leading-snug">
                {user?.fullName || 'Tier-3 SOC Analyst'}
              </p>
              <p className="text-[10px] text-mutedText font-mono uppercase tracking-wider truncate leading-none">
                {user?.role ? user.role.replace(/_/g, ' ') : 'OPERATOR'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title="Terminate Analyst Session"
            className="p-1.5 text-mutedText hover:text-danger hover:bg-danger/10 rounded transition-colors shrink-0 ml-1.5"
            aria-label="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:block shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Drawer with Backdrop */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative z-50 flex animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
