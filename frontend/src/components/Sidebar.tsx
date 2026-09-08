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
} from 'lucide-react';
import { ApiClient } from '@/lib/api';

const NAV_GROUPS = [
  {
    group: 'MONITOR',
    items: [
      { name: 'Overview', href: '/dashboard', icon: Shield },
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
      { name: 'Architecture & Diagrams', href: '/diagrams', icon: Network },
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

    // Listen for custom toggle events from mobile navbar
    const handleToggle = () => setIsMobileOpen((prev) => !prev);
    window.addEventListener('voxshield-toggle-sidebar', handleToggle);
    return () => window.removeEventListener('voxshield-toggle-sidebar', handleToggle);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Handle Escape key to close mobile drawer
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
    <aside className="w-64 bg-sidebar border-r border-border flex flex-col h-screen sticky top-0 shrink-0 select-none z-40">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded bg-surface-elevated border border-border text-primary shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm tracking-wide text-primaryText font-sans truncate">
              VOXSHIELD
            </div>
            <p className="text-[11px] text-mutedText font-sans truncate leading-none">
              Security Operations
            </p>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden p-1.5 rounded text-mutedText hover:text-primaryText hover:bg-surface-hover"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Categorized Navigation */}
      <nav className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.group} className="space-y-0.5">
            <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-mutedText font-sans">
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
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-sans transition-colors ${
                    isActive
                      ? 'bg-surface-elevated text-primaryText font-medium border-l-2 border-primary pl-2'
                      : 'text-secondaryText hover:text-primaryText hover:bg-surface-hover/60 border-l-2 border-transparent pl-2'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-primary' : 'text-mutedText'
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>

                  {item.isLive && (
                    <span className="flex items-center gap-1 text-[10px] font-sans font-medium px-1.5 py-0.2 rounded bg-red-500/10 text-red-400 border border-red-500/20 mr-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      <span>Live</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Session Footer */}
      <div className="p-3 border-t border-border bg-sidebar">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded bg-surface-elevated border border-border flex items-center justify-center text-xs font-medium text-primaryText font-sans shrink-0">
              {getInitials(user?.fullName)}
            </div>
            <div className="truncate">
              <p className="text-xs font-medium text-primaryText font-sans truncate leading-snug">
                {user?.fullName || 'Tier-3 SOC Analyst'}
              </p>
              <p className="text-[11px] text-mutedText font-sans truncate leading-none">
                {user?.role ? user.role.replace(/_/g, ' ') : 'Security Analyst'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout Session"
            className="p-1 text-mutedText hover:text-danger hover:bg-red-500/10 rounded transition-colors shrink-0 ml-1.5"
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
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative z-50 flex">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
