'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Activity, Bell, Radio, ShieldCheck, ShieldAlert, X, Smartphone, CheckCircle2, Shield } from 'lucide-react';
import { Phase1Notice } from './Phase1Notice';

export const Navbar: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const [showAlertsDrawer, setShowAlertsDrawer] = useState(false);
  const [notifications] = useState([
    {
      id: 'notif-1',
      title: 'Real-Time Neural Gateway Online',
      desc: 'Phase 5 Multi-Modal Risk Fusion, Acoustic Deepfake Detection & Privacy Firewall active.',
      time: 'Just now',
      severity: 'INFO',
    },
    {
      id: 'notif-2',
      title: 'Deterministic Policy Enforcement Ready',
      desc: '6 enterprise policies monitoring live audio streams with zero secret retention.',
      time: '2m ago',
      severity: 'SAFE',
    },
    {
      id: 'notif-3',
      title: 'Privacy Firewall Zero-Trust Audit',
      desc: 'All consumer audio processed ephemerally with SHA-256 tamper-evident integrity trails.',
      time: '5m ago',
      severity: 'INFO',
    }
  ]);

  return (
    <header className="h-16 border-b border-[#3A3A42] bg-[#1A1A1F] px-6 flex items-center justify-between sticky top-0 z-20 select-none shadow-sm">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-sm font-bold text-[#F5F5F7] flex items-center gap-2">
            <span>{title}</span>
          </h1>
          {subtitle && <p className="text-[11px] text-[#A0A4AE] font-mono">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Phase1Notice compact />

        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#168F86]/15 border border-[#168F86]/40 text-[#168F86] text-xs font-mono shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#168F86] animate-pulse" />
          <span className="font-semibold tracking-wide text-[11px]">GATEWAY ONLINE</span>
        </div>

        <Link
          href="/consumer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#24242B] hover:bg-[#2E2E36] border border-[#3A3A42] hover:border-[#7A1F3D] text-[#F5F5F7] text-xs font-mono transition-all duration-200 shadow-sm"
          title="Open Consumer Protected Call Experience"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#168F86]" />
          <span className="font-medium">Consumer View</span>
        </Link>

        <div className="relative">
          <button
            onClick={() => setShowAlertsDrawer((prev) => !prev)}
            className="p-2 rounded-lg bg-[#24242B] text-[#A0A4AE] hover:text-[#F5F5F7] hover:bg-[#2E2E36] border border-[#3A3A42] hover:border-[#7A1F3D]/60 relative transition-all duration-200 shadow-sm"
            title="System Notifications"
            aria-label="System Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#7A1F3D] animate-pulse" />
          </button>

          {/* Notifications Dropdown */}
          {showAlertsDrawer && (
            <div className="absolute right-0 mt-2 w-84 sm:w-96 bg-[#2E2E36] p-4 rounded-xl border border-[#3A3A42] shadow-2xl space-y-3 z-50 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#3A3A42]">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-[#7A1F3D]" />
                  <span className="font-bold text-[#F5F5F7] uppercase tracking-wider text-[11px]">
                    System Telemetry & Alerts
                  </span>
                </div>
                <button
                  onClick={() => setShowAlertsDrawer(false)}
                  className="p-1 rounded-md text-[#A0A4AE] hover:text-[#F5F5F7] hover:bg-[#3A3A42]/50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 rounded-lg bg-[#24242B] border border-[#3A3A42] space-y-1.5 hover:border-[#3A3A42]/80 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#F5F5F7] text-[11px] truncate flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${n.severity === 'SAFE' ? 'bg-[#168F86]' : 'bg-[#7A1F3D]'}`} />
                        {n.title}
                      </span>
                      <span className="text-[10px] text-[#A0A4AE] shrink-0">{n.time}</span>
                    </div>
                    <p className="text-[10px] text-[#A0A4AE] leading-relaxed font-sans">{n.desc}</p>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[#3A3A42] flex items-center justify-between text-[10px] text-[#A0A4AE]">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#168F86]" />
                  Deterministic Audit Logged
                </span>
                <span className="text-[#A0A4AE]">All Systems Nominal</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
