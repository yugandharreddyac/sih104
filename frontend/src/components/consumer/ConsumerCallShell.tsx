'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  Smartphone,
  Monitor,
  PhoneCall,
  History,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Wifi,
  Sparkles,
  Lock,
} from 'lucide-react';
import { ConnectionStatus, WSConnectionState } from './ConnectionStatus';

export type ConsumerTab = 'CALL' | 'HISTORY' | 'REPORT';

interface ConsumerCallShellProps {
  children: React.ReactNode;
  activeTab: ConsumerTab;
  onTabChange: (tab: ConsumerTab) => void;
  connectionStatus: WSConnectionState;
  connectionError?: string | null;
  onReconnect?: () => void;
}

export const ConsumerCallShell: React.FC<ConsumerCallShellProps> = ({
  children,
  activeTab,
  onTabChange,
  connectionStatus,
  connectionError,
  onReconnect,
}) => {
  const [deviceMode, setDeviceMode] = useState<'MOBILE_FRAME' | 'RESPONSIVE'>('MOBILE_FRAME');

  return (
    <div className="min-h-screen bg-[#1A1A1F] text-[#F5F5F7] flex flex-col antialiased relative selection:bg-[#7A1F3D]/40 selection:text-white overflow-x-hidden">
      {/* Consumer Top Header */}
      <header className="h-16 border-b border-[#3A3A42] bg-[#1A1A1F] px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 select-none shadow-sm">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#7A1F3D] flex items-center justify-center shadow-sm border border-[#7A1F3D]/60">
            <Shield className="w-5 h-5 text-[#F5F5F7]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-wider text-[#F5F5F7]">
                VOXSHIELD
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#2E2E36] border border-[#3A3A42] text-[#A0A4AE] font-mono text-[10px] font-bold">
                CONSUMER SHIELD
              </span>
            </div>
            <p className="text-[11px] text-[#A0A4AE] font-sans tracking-tight hidden sm:block">
              Real-Time AI Voice Call Protection & Fraud Defense
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* Connection Status Pill */}
          <ConnectionStatus
            status={connectionStatus}
            errorMessage={connectionError}
            onReconnect={onReconnect}
            compact
          />

          {/* View Mode Toggle (Mobile Mockup vs Responsive Web) */}
          <div className="hidden md:flex items-center bg-[#24242B] border border-[#3A3A42] rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setDeviceMode('MOBILE_FRAME')}
              className={`p-1.5 rounded-md text-xs font-mono transition-all flex items-center gap-1 ${
                deviceMode === 'MOBILE_FRAME'
                  ? 'bg-[#7A1F3D] text-[#F5F5F7] shadow-sm'
                  : 'text-[#A0A4AE] hover:text-[#F5F5F7]'
              }`}
              title="Smartphone Viewport Mockup"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[11px]">Phone</span>
            </button>
            <button
              onClick={() => setDeviceMode('RESPONSIVE')}
              className={`p-1.5 rounded-md text-xs font-mono transition-all flex items-center gap-1 ${
                deviceMode === 'RESPONSIVE'
                  ? 'bg-[#7A1F3D] text-[#F5F5F7] shadow-sm'
                  : 'text-[#A0A4AE] hover:text-[#F5F5F7]'
              }`}
              title="Responsive Viewport"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="text-[11px]">Desktop</span>
            </button>
          </div>

          {/* Link to Authority / SOC Portal */}
          <Link
            href="/dashboard"
            className="px-3 py-1.5 rounded-lg bg-[#24242B] hover:bg-[#2E2E36] border border-[#3A3A42] text-[#F5F5F7] text-xs font-medium font-mono transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span>Authority SOC</span>
            <ExternalLink className="w-3 h-3 text-[#A0A4AE]" />
          </Link>
        </div>
      </header>

      {/* Main Tab Navigation Subheader */}
      <div className="border-b border-[#3A3A42] bg-[#1A1A1F]/90 px-4 sm:px-8 py-2 flex items-center justify-between overflow-x-auto select-none">
        <div className="flex items-center gap-2 max-w-lg mx-auto md:mx-0">
          <button
            onClick={() => onTabChange('CALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'CALL'
                ? 'bg-[#7A1F3D] border border-[#7A1F3D]/60 text-[#F5F5F7] shadow-sm'
                : 'text-[#A0A4AE] hover:text-[#F5F5F7] hover:bg-[#24242B] border border-transparent'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Live Call Protection</span>
          </button>

          <button
            onClick={() => onTabChange('HISTORY')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'HISTORY'
                ? 'bg-[#7A1F3D] border border-[#7A1F3D]/60 text-[#F5F5F7] shadow-sm'
                : 'text-[#A0A4AE] hover:text-[#F5F5F7] hover:bg-[#24242B] border border-transparent'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Call History</span>
          </button>

          <button
            onClick={() => onTabChange('REPORT')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'REPORT'
                ? 'bg-[#D94A5A]/20 border border-[#D94A5A]/40 text-[#D94A5A] shadow-sm'
                : 'text-[#A0A4AE] hover:text-[#F5F5F7] hover:bg-[#24242B] border border-transparent'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-[#D94A5A]" />
            <span>Cyber Cell Report</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-[#A0A4AE]">
          <span className="w-2 h-2 rounded-full bg-[#168F86] animate-pulse" />
          <span>Real-Time Audio Protection Pipeline Active</span>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
        {deviceMode === 'MOBILE_FRAME' ? (
          /* Realistic Smartphone Mockup Shell */
          <div className="w-full max-w-[430px] rounded-[48px] bg-[#24242B] border-[8px] border-[#3A3A42] shadow-2xl ring-1 ring-[#3A3A42] relative overflow-hidden flex flex-col min-h-[780px]">
            {/* Phone Speaker & Dynamic Island Mockup */}
            <div className="h-8 bg-[#24242B] flex items-center justify-between px-7 pt-2 select-none shrink-0 z-20">
              <span className="text-[11px] font-mono text-[#A0A4AE] font-semibold">
                9:41
              </span>
              <div className="w-24 h-4 bg-[#1A1A1F] rounded-full flex items-center justify-center border border-[#3A3A42] shadow-inner">
                <span className="w-2.5 h-2.5 rounded-full bg-[#24242B]" />
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[#A0A4AE]">
                <Wifi className="w-3 h-3 text-[#168F86]" />
                <span className="font-mono text-[10px]">5G</span>
              </div>
            </div>

            {/* Phone Screen Body Content */}
            <div className="flex-1 p-4 overflow-y-auto max-h-[730px] bg-[#1A1A1F]">
              {children}
            </div>

            {/* Phone Home Bar Indicator */}
            <div className="h-6 bg-[#24242B] flex items-center justify-center pb-2 shrink-0">
              <div className="w-32 h-1 bg-[#3A3A42] rounded-full" />
            </div>
          </div>
        ) : (
          /* Full-Width Responsive Desktop/Tablet Layout */
          <div className="w-full max-w-3xl mx-auto">{children}</div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#3A3A42] bg-[#1A1A1F] px-6 py-3 text-center text-[#A0A4AE] text-[11px] font-mono select-none">
        VOXSHIELD Protected Consumer Voice Environment • Zero Secret Retention • Real-Time AI Acoustic Defense
      </footer>
    </div>
  );
};
