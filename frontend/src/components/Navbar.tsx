'use client';

import React, { useEffect, useState } from 'react';
import { Menu, Shield, ShieldCheck, Activity } from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationCenter } from '@/components/NotificationCenter';

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
    const interval = setInterval(checkHealth, 20000);

    const localUser = ApiClient.getUser();
    if (localUser) setUser(localUser);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const toggleMobileNav = () => {
    window.dispatchEvent(new CustomEvent('voxshield-toggle-sidebar'));
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

  return (
    <header className="h-14 border-b border-border bg-surface px-3 sm:px-5 flex items-center justify-between sticky top-0 z-30 select-none backdrop-blur-md">
      {/* Left: Mobile Toggle, Breadcrumb, Page Context */}
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        <button
          onClick={toggleMobileNav}
          className="lg:hidden p-1.5 rounded text-mutedText hover:text-primaryText hover:bg-surface-elevated transition-colors shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <Breadcrumbs />
          <div className="flex items-center gap-2">
            <h1 className="text-xs sm:text-sm font-semibold text-primaryText font-sans tracking-tight truncate leading-tight">
              {title}
            </h1>
            {subtitle && (
              <span className="hidden xl:inline text-[11px] text-mutedText font-sans truncate before:content-['•'] before:mr-2 before:text-border">
                {subtitle}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Global Search Trigger */}
      <div className="hidden lg:flex items-center justify-center px-2">
        <GlobalSearch />
      </div>

      {/* Right: Operational Status, Alerts, Theme, Analyst Identity */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Gateway Status Pill */}
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated border border-border text-[11px] font-sans">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              gatewayStatus === null
                ? 'bg-mutedText'
                : gatewayStatus
                ? 'bg-success animate-pulse'
                : 'bg-danger'
            }`}
          />
          <span className="text-secondaryText font-medium">Gateway:</span>
          <span className="font-semibold text-primaryText">
            {gatewayStatus === null ? 'Checking' : gatewayStatus ? 'Active' : 'Offline'}
          </span>
        </div>

        {/* AI Engine Status Pill */}
        <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated border border-border text-[11px] font-sans">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              aiStatus === 'HEALTHY'
                ? 'bg-success'
                : aiStatus === 'DEGRADED'
                ? 'bg-warning'
                : 'bg-danger'
            }`}
          />
          <span className="text-secondaryText font-medium">AI Engine:</span>
          <span className="font-semibold text-primaryText">
            {aiStatus === 'HEALTHY'
              ? 'Online'
              : aiStatus === 'DEGRADED'
              ? 'Degraded'
              : 'Unavailable'}
          </span>
        </div>

        {/* Policy Guardrails Status Badge */}
        <div className="hidden 2xl:flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated border border-border text-[10px] font-semibold tracking-wider uppercase">
          <ShieldCheck className="w-3 h-3 text-success" />
          <span className="text-secondaryText">Guardrails:</span>
          <span className="text-primaryText">Enforced</span>
        </div>

        {/* Global Notifications Center */}
        <NotificationCenter />

        {/* Theme Switcher */}
        <ThemeToggle />

        {/* Analyst Identity Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div
            className="w-7 h-7 rounded bg-surface-elevated border border-border flex items-center justify-center text-xs font-semibold text-primaryText font-sans shrink-0 hover:border-primary transition-colors cursor-pointer"
            title={`${user?.fullName || 'Tier-3 SOC Analyst'} (${user?.role || 'Security Analyst'})`}
          >
            {getInitials(user?.fullName)}
          </div>
          <div className="hidden xl:block text-left">
            <p className="text-xs font-semibold text-primaryText font-sans leading-none truncate max-w-[120px]">
              {user?.fullName || 'Tier-3 Analyst'}
            </p>
            <p className="text-[10px] text-mutedText font-mono uppercase tracking-wider leading-none mt-1">
              {user?.role ? user.role.replace(/_/g, ' ') : 'SOC OPERATOR'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
