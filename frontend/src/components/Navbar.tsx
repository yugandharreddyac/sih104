'use client';

import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';

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
    <header className="h-14 border-b border-border bg-surface px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left: Mobile Toggle & Page Context */}
      <div className="flex items-center gap-3 min-w-0 pr-4">
        <button
          onClick={toggleMobileNav}
          className="lg:hidden p-1.5 rounded text-mutedText hover:text-primaryText hover:bg-surface-elevated transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-primaryText font-sans tracking-tight truncate leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-mutedText font-sans truncate leading-none mt-0.5 hidden sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: Operational Status Indicators & Analyst Identity */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Gateway Status */}
        <div className="flex flex-col items-end sm:items-start text-right sm:text-left">
          <span className="text-[10px] text-mutedText font-sans leading-none">Gateway</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                gatewayStatus === null
                  ? 'bg-mutedText'
                  : gatewayStatus
                  ? 'bg-success'
                  : 'bg-danger'
              }`}
            />
            <span className="text-xs font-medium text-secondaryText font-sans">
              {gatewayStatus === null ? 'Connecting' : gatewayStatus ? 'Operational' : 'Offline'}
            </span>
          </div>
        </div>

        {/* AI Service Status */}
        <div className="hidden sm:flex flex-col">
          <span className="text-[10px] text-mutedText font-sans leading-none">AI Service</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                aiStatus === 'HEALTHY'
                  ? 'bg-success'
                  : aiStatus === 'DEGRADED'
                  ? 'bg-warning'
                  : aiStatus === 'CONNECTING'
                  ? 'bg-mutedText'
                  : 'bg-danger'
              }`}
            />
            <span className="text-xs font-medium text-secondaryText font-sans">
              {aiStatus === 'HEALTHY'
                ? 'Operational'
                : aiStatus === 'DEGRADED'
                ? 'Degraded'
                : aiStatus === 'CONNECTING'
                ? 'Connecting'
                : 'Unavailable'}
            </span>
          </div>
        </div>

        {/* Privacy Status */}
        <div className="hidden md:flex flex-col">
          <span className="text-[10px] text-mutedText font-sans leading-none">Privacy</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="text-xs font-medium text-secondaryText font-sans">
              Enforced
            </span>
          </div>
        </div>

        {/* Theme Mode Switcher */}
        <div className="pl-1">
          <ThemeToggle />
        </div>

        {/* User Identity Chip */}
        <div className="flex items-center gap-2 pl-3 border-l border-border">
          <div className="w-7 h-7 rounded bg-surface-elevated border border-border flex items-center justify-center text-xs font-medium text-primaryText font-sans shrink-0">
            {getInitials(user?.fullName)}
          </div>
          <div className="hidden xl:block text-left">
            <p className="text-xs font-medium text-primaryText font-sans leading-none truncate max-w-[130px]">
              {user?.fullName || 'Tier-3 SOC Analyst'}
            </p>
            <p className="text-[11px] text-mutedText font-sans leading-none mt-1">
              {user?.role ? user.role.replace(/_/g, ' ') : 'Security Analyst'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
