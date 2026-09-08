'use client';

import React from 'react';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ShieldX,
  RefreshCw,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export type ConsumerCallState =
  | 'INCOMING'
  | 'CALL_IN_PROGRESS'
  | 'PENDING'
  | 'ANALYZING'
  | 'LOW_RISK'
  | 'SUSPICIOUS'
  | 'HIGH_RISK'
  | 'BLOCKED'
  | 'AI_NOT_AVAILABLE'
  | 'INCONCLUSIVE'
  | 'ERROR'
  | 'DISCONNECTED'
  | 'COMPLETED';

interface CallStatusProps {
  state: ConsumerCallState;
  compact?: boolean;
}

export const CallStatus: React.FC<CallStatusProps> = ({ state, compact = false }) => {
  const getBadgeConfig = () => {
    switch (state) {
      case 'INCOMING':
        return {
          label: 'INCOMING CALL',
          description: 'Protected call ringing',
          bgColor: 'bg-[#7A1F3D]/20',
          borderColor: 'border-[#7A1F3D]/40',
          textColor: 'text-[#F5F5F7]',
          dotColor: 'bg-[#7A1F3D]',
          icon: PhoneIncoming,
          animatePulse: true,
        };
      case 'CALL_IN_PROGRESS':
        return {
          label: 'CALL IN PROGRESS',
          description: 'Live voice connection open • Monitoring active',
          bgColor: 'bg-[#168F86]/15',
          borderColor: 'border-[#168F86]/40',
          textColor: 'text-[#168F86]',
          dotColor: 'bg-[#168F86]',
          icon: PhoneCall,
          animatePulse: true,
        };
      case 'PENDING':
      case 'ANALYZING':
        return {
          label: 'ANALYZING CALL',
          description: 'Evaluating voice authenticity & fraud risk',
          bgColor: 'bg-[#2E2E36]',
          borderColor: 'border-[#3A3A42]',
          textColor: 'text-[#F5F5F7]',
          dotColor: 'bg-[#A0A4AE]',
          icon: RefreshCw,
          spin: true,
        };
      case 'LOW_RISK':
        return {
          label: 'LOW RISK',
          description: 'No known fraud patterns detected',
          bgColor: 'bg-[#168F86]/15',
          borderColor: 'border-[#168F86]/40',
          textColor: 'text-[#168F86]',
          dotColor: 'bg-[#168F86]',
          icon: ShieldCheck,
        };
      case 'SUSPICIOUS':
        return {
          label: 'SUSPICIOUS CALL',
          description: 'Elevated risk indicators observed',
          bgColor: 'bg-[#C87524]/15',
          borderColor: 'border-[#C87524]/40',
          textColor: 'text-[#C87524]',
          dotColor: 'bg-[#C87524]',
          icon: AlertTriangle,
          animatePulse: true,
        };
      case 'HIGH_RISK':
        return {
          label: 'HIGH RISK THREAT',
          description: 'Potentially fraudulent call detected',
          bgColor: 'bg-[#D94A5A]/15',
          borderColor: 'border-[#D94A5A]/40',
          textColor: 'text-[#D94A5A]',
          dotColor: 'bg-[#D94A5A]',
          icon: ShieldAlert,
          animatePulse: true,
        };
      case 'BLOCKED':
        return {
          label: 'CALL BLOCKED',
          description: 'Interaction terminated by security policy',
          bgColor: 'bg-[#D94A5A]/25',
          borderColor: 'border-[#D94A5A]/50',
          textColor: 'text-[#D94A5A]',
          dotColor: 'bg-[#D94A5A]',
          icon: ShieldX,
        };
      case 'AI_NOT_AVAILABLE':
        return {
          label: 'AI NOT AVAILABLE',
          description: 'Voice analysis is offline (Safety cannot be established)',
          bgColor: 'bg-[#C87524]/15',
          borderColor: 'border-[#C87524]/40',
          textColor: 'text-[#C87524]',
          dotColor: 'bg-[#C87524]',
          icon: AlertCircle,
        };
      case 'INCONCLUSIVE':
        return {
          label: 'INCONCLUSIVE',
          description: 'Insufficient audio signals to establish authenticity',
          bgColor: 'bg-[#2E2E36]',
          borderColor: 'border-[#3A3A42]',
          textColor: 'text-[#A0A4AE]',
          dotColor: 'bg-[#A0A4AE]',
          icon: HelpCircle,
        };
      case 'ERROR':
        return {
          label: 'ERROR',
          description: 'Unable to complete call analysis',
          bgColor: 'bg-[#D94A5A]/15',
          borderColor: 'border-[#D94A5A]/40',
          textColor: 'text-[#D94A5A]',
          dotColor: 'bg-[#D94A5A]',
          icon: AlertCircle,
        };
      case 'DISCONNECTED':
        return {
          label: 'DISCONNECTED',
          description: 'Call declined or dropped',
          bgColor: 'bg-[#2E2E36]',
          borderColor: 'border-[#3A3A42]',
          textColor: 'text-[#A0A4AE]',
          dotColor: 'bg-[#A0A4AE]',
          icon: PhoneOff,
        };
      case 'COMPLETED':
      default:
        return {
          label: 'CALL COMPLETED',
          description: 'Session ended successfully',
          bgColor: 'bg-[#2E2E36]',
          borderColor: 'border-[#3A3A42]',
          textColor: 'text-[#F5F5F7]',
          dotColor: 'bg-[#168F86]',
          icon: CheckCircle2,
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider font-mono border ${config.bgColor} ${config.borderColor} ${config.textColor} shadow-sm`}
      >
        <span
          className={`w-2 h-2 rounded-full ${config.dotColor} ${
            config.animatePulse ? 'animate-pulse' : ''
          }`}
        />
        <Icon className={`w-3.5 h-3.5 ${config.spin ? 'animate-spin' : ''}`} />
        <span>{config.label}</span>
      </span>
    );
  }

  return (
    <div
      className={`p-3.5 rounded-2xl border flex items-center gap-3.5 transition-all ${config.bgColor} ${config.borderColor} shadow-lg shadow-black/40`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.bgColor} ${config.textColor} border ${config.borderColor} shadow-sm`}
      >
        <Icon className={`w-5 h-5 ${config.spin ? 'animate-spin' : ''}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold font-mono tracking-wider ${config.textColor}`}>
            {config.label}
          </span>
          {config.animatePulse && (
            <span className="w-2 h-2 rounded-full bg-current animate-ping opacity-75" />
          )}
        </div>
        <p className="text-xs text-slate-300 mt-0.5 leading-tight truncate">
          {config.description}
        </p>
      </div>
    </div>
  );
};
