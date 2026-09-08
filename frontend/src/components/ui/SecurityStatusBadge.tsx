'use client';

import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  Activity,
  CheckCircle2,
} from 'lucide-react';

export type SecurityStatus =
  | 'ACTIVE'
  | 'VERIFYING'
  | 'WARNING'
  | 'CRITICAL'
  | 'COMPLETED'
  | 'SAFE'
  | 'AUTHENTIC'
  | 'NOT_DETECTED'
  | 'MATCH'
  | 'HEALTHY'
  | 'ONLINE'
  | 'APPROVED'
  | 'VERIFIED'
  | 'READY'
  | 'STANDBY'
  | 'EVALUATING'
  | 'PENDING'
  | 'INCONCLUSIVE'
  | 'DEGRADED'
  | 'DETECTED'
  | 'MISMATCH'
  | 'HIGH_RISK'
  | 'BLOCKED'
  | 'OFFLINE'
  | 'UNAVAILABLE'
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

  // Green / Safe / Active / Completed / Healthy
  const isSafe = [
    'ACTIVE',
    'SAFE',
    'AUTHENTIC',
    'NOT_DETECTED',
    'NOT_REPLAY',
    'MATCH',
    'HEALTHY',
    'ONLINE',
    'APPROVED',
    'VERIFIED',
    'COMPLETED',
    'RESOLVED',
  ].includes(norm);

  // Blue / Sky / Info / Verifying / Ready
  const isInfo = [
    'VERIFYING',
    'READY',
    'STANDBY',
    'LISTENING',
    'ANALYZING',
    'PROCESSING',
    'EVALUATING',
    'INITIALIZED',
    'CONNECTED',
  ].includes(norm);

  // Amber / Warning / Review / Degraded
  const isWarning = [
    'WARNING',
    'PENDING',
    'INVESTIGATING',
    'REVIEW_REQUIRED',
    'INCONCLUSIVE',
    'INSUFFICIENT_AUDIO',
    'DEGRADED',
    'FALLBACK',
    'SUSPICIOUS',
    'UNENROLLED',
  ].includes(norm);

  // Red / Critical / Threat / Blocked / Error
  const isThreat = [
    'CRITICAL',
    'DETECTED',
    'SPOOF',
    'MISMATCH',
    'HIGH_RISK',
    'HIGH',
    'THREAT_DETECTED',
    'CONTAINED',
    'BLOCKED',
    'REJECTED',
    'FAILED',
    'EXPIRED',
    'ERROR',
    'OFFLINE',
    'UNAVAILABLE',
  ].includes(norm);

  let badgeColor = 'bg-surface-elevated text-secondaryText border-border';
  let dotColor = 'bg-mutedText';
  let Icon = HelpCircle;

  if (isSafe) {
    badgeColor = 'bg-success/10 text-success border-success/25';
    dotColor = 'bg-success';
    Icon = ShieldCheck;
  } else if (isInfo) {
    badgeColor = 'bg-primary/10 text-primary border-primary/25';
    dotColor = 'bg-primary';
    Icon = Activity;
  } else if (isWarning) {
    badgeColor = 'bg-warning/10 text-warning border-warning/25';
    dotColor = 'bg-warning';
    Icon = AlertTriangle;
  } else if (isThreat) {
    badgeColor = 'bg-danger/10 text-danger border-danger/25';
    dotColor = 'bg-danger';
    Icon = ShieldAlert;
  }

  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
  };

  // Standardized natural case text representation
  const formatStatusText = (raw: string) => {
    switch (raw) {
      case 'ACTIVE':
        return 'Active';
      case 'VERIFYING':
        return 'Verifying';
      case 'WARNING':
        return 'Warning';
      case 'CRITICAL':
        return 'Critical';
      case 'COMPLETED':
        return 'Completed';
      case 'SAFE':
        return 'Safe';
      case 'AUTHENTIC':
        return 'Authentic';
      case 'MATCH':
        return 'Match';
      case 'MISMATCH':
        return 'Mismatch';
      case 'DETECTED':
        return 'Detected';
      case 'PENDING':
        return 'Pending';
      case 'HEALTHY':
        return 'Healthy';
      case 'DEGRADED':
        return 'Degraded';
      case 'OFFLINE':
        return 'Offline';
      default:
        return raw.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
    }
  };

  const displayText = formatStatusText(norm);

  return (
    <span
      role="status"
      className={`inline-flex items-center font-sans font-medium rounded border ${badgeColor} ${sizeClasses[size]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
      <span>{displayText}</span>
    </span>
  );
};
