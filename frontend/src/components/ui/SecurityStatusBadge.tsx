'use client';

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Clock,
  HelpCircle,
  XCircle,
  Radio,
  Lock,
  Ban,
  Activity,
} from 'lucide-react';

export type SecurityStatus =
  | 'SAFE'
  | 'AUTHENTIC'
  | 'NOT_DETECTED'
  | 'NOT_REPLAY'
  | 'MATCH'
  | 'HEALTHY'
  | 'ACTIVE'
  | 'ONLINE'
  | 'APPROVED'
  | 'VERIFIED'
  | 'READY'
  | 'STANDBY'
  | 'LISTENING'
  | 'ANALYZING'
  | 'PROCESSING'
  | 'EVALUATING'
  | 'PENDING'
  | 'INVESTIGATING'
  | 'REVIEW_REQUIRED'
  | 'INCONCLUSIVE'
  | 'INSUFFICIENT_AUDIO'
  | 'DEGRADED'
  | 'FALLBACK'
  | 'SUSPICIOUS'
  | 'DETECTED'
  | 'SPOOF'
  | 'MISMATCH'
  | 'HIGH_RISK'
  | 'CRITICAL'
  | 'THREAT_DETECTED'
  | 'CONTAINED'
  | 'BLOCKED'
  | 'REJECTED'
  | 'FAILED'
  | 'EXPIRED'
  | 'OFFLINE'
  | 'UNAVAILABLE'
  | 'NOT_AVAILABLE'
  | 'ERROR';

interface SecurityStatusBadgeProps {
  status: string | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const SecurityStatusBadge: React.FC<SecurityStatusBadgeProps> = ({
  status,
  size = 'sm',
  showIcon = true,
  className = '',
}) => {
  const norm = (status || 'UNKNOWN').toUpperCase().replace(/\s+/g, '_');

  // Green / Safe / Healthy
  const isSafe = [
    'SAFE',
    'AUTHENTIC',
    'NOT_DETECTED',
    'NOT_REPLAY',
    'MATCH',
    'HEALTHY',
    'ACTIVE',
    'ONLINE',
    'APPROVED',
    'VERIFIED',
  ].includes(norm);

  // Blue / Cyan / Info / Ready
  const isInfo = [
    'READY',
    'STANDBY',
    'LISTENING',
    'ANALYZING',
    'PROCESSING',
    'EVALUATING',
    'INITIALIZED',
    'CONNECTED',
  ].includes(norm);

  // Amber / Warning / Review
  const isWarning = [
    'PENDING',
    'INVESTIGATING',
    'REVIEW_REQUIRED',
    'INCONCLUSIVE',
    'INSUFFICIENT_AUDIO',
    'DEGRADED',
    'FALLBACK',
    'SUSPICIOUS',
  ].includes(norm);

  // Red / Critical / Threat / Blocked
  const isThreat = [
    'DETECTED',
    'SPOOF',
    'MISMATCH',
    'HIGH_RISK',
    'HIGH',
    'CRITICAL',
    'THREAT_DETECTED',
    'CONTAINED',
    'BLOCKED',
    'REJECTED',
    'FAILED',
    'EXPIRED',
    'ERROR',
  ].includes(norm);

  let badgeColor = 'bg-slate-800/80 text-slate-400 border-slate-700';
  let Icon = HelpCircle;

  if (isSafe) {
    badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
    Icon = ShieldCheck;
  } else if (isInfo) {
    badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25';
    Icon = Activity;
  } else if (isWarning) {
    badgeColor = 'bg-amber-500/10 text-amber-300 border-amber-500/25';
    Icon = AlertTriangle;
  } else if (isThreat) {
    badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/25';
    Icon = ShieldAlert;
  }

  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3 py-1.5 gap-2 font-semibold',
  };

  const displayText = norm.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded border ${badgeColor} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{displayText}</span>
    </span>
  );
};
