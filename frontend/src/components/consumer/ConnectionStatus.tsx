'use client';

import React from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

export type WSConnectionState = 'LIVE' | 'CONNECTING' | 'RECONNECTING' | 'OFFLINE' | 'ERROR' | 'AI_NOT_AVAILABLE';

interface ConnectionStatusProps {
  status: WSConnectionState;
  errorMessage?: string | null;
  onReconnect?: () => void;
  compact?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  errorMessage,
  onReconnect,
  compact = false,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'LIVE':
        return {
          label: 'VOXSHIELD Active',
          subtext: 'Real-time call protection active',
          bgColor: 'bg-[#168F86]/15',
          borderColor: 'border-[#168F86]/40',
          textColor: 'text-[#168F86]',
          dotColor: 'bg-[#168F86]',
          icon: Wifi,
          pulse: true,
        };
      case 'CONNECTING':
      case 'RECONNECTING':
        return {
          label: status === 'RECONNECTING' ? 'Reconnecting...' : 'Connecting...',
          subtext: 'Establishing secure link',
          bgColor: 'bg-[#C87524]/15',
          borderColor: 'border-[#C87524]/40',
          textColor: 'text-[#C87524]',
          dotColor: 'bg-[#C87524]',
          icon: RefreshCw,
          spin: true,
        };
      case 'AI_NOT_AVAILABLE':
        return {
          label: 'AI Service Offline',
          subtext: 'Voice AI analysis unavailable • Safety cannot be established',
          bgColor: 'bg-[#C87524]/15',
          borderColor: 'border-[#C87524]/40',
          textColor: 'text-[#C87524]',
          dotColor: 'bg-[#C87524]',
          icon: AlertCircle,
        };
      case 'ERROR':
        return {
          label: 'Connection Error',
          subtext: errorMessage || 'Gateway link failed',
          bgColor: 'bg-[#D94A5A]/15',
          borderColor: 'border-[#D94A5A]/40',
          textColor: 'text-[#D94A5A]',
          dotColor: 'bg-[#D94A5A]',
          icon: AlertCircle,
        };
      case 'OFFLINE':
      default:
        return {
          label: 'Protection Offline',
          subtext: 'Gateway disconnected',
          bgColor: 'bg-[#2E2E36]',
          borderColor: 'border-[#3A3A42]',
          textColor: 'text-[#A0A4AE]',
          dotColor: 'bg-[#A0A4AE]',
          icon: WifiOff,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-all ${config.bgColor} ${config.borderColor} ${config.textColor} shadow-sm backdrop-blur-md`}
        title={config.subtext}
      >
        <span
          className={`w-2 h-2 rounded-full ${config.dotColor} ${
            config.pulse ? 'animate-pulse' : ''
          }`}
        />
        <span className="font-mono text-[11px] font-semibold">{config.label}</span>
      </div>
    );
  }

  return (
    <div
      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${config.bgColor} ${config.borderColor} shadow-lg shadow-black/40`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${config.bgColor} ${config.textColor} border ${config.borderColor} shadow-sm`}
        >
          <Icon
            className={`w-4 h-4 ${config.spin ? 'animate-spin' : ''}`}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className={`text-xs font-bold font-mono tracking-wide ${config.textColor}`}>
              {config.label}
            </p>
            {config.pulse && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#168F86] animate-ping" />
            )}
          </div>
          <p className="text-[11px] text-[#A0A4AE] leading-tight mt-0.5">
            {config.subtext}
          </p>
        </div>
      </div>

      {onReconnect && (status === 'OFFLINE' || status === 'ERROR') && (
        <button
          onClick={onReconnect}
          className="px-3 py-1.5 rounded-xl bg-[#2E2E36] hover:bg-[#3A3A42] text-[#F5F5F7] text-xs font-bold font-mono border border-[#3A3A42] transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};
