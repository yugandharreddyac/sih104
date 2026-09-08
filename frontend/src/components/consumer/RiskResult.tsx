'use client';

import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  AlertCircle,
  Activity,
} from 'lucide-react';

export type ConsumerRiskLevel =
  | 'SAFE'
  | 'LOW'
  | 'LOW_RISK'
  | 'GUARDED'
  | 'ELEVATED'
  | 'SUSPICIOUS'
  | 'HIGH'
  | 'HIGH_RISK'
  | 'CRITICAL'
  | 'INCONCLUSIVE'
  | 'NOT_AVAILABLE'
  | 'ANALYZING';

interface RiskResultProps {
  score: number | null;
  riskLevel: ConsumerRiskLevel;
  threatClassification?: string | null;
  confidence?: number | null;
  compact?: boolean;
}

export const RiskResult: React.FC<RiskResultProps> = ({
  score,
  riskLevel,
  threatClassification,
  confidence,
  compact = false,
}) => {
  const normalizeLevel = (): {
    displayLevel: string;
    description: string;
    theme: 'emerald' | 'amber' | 'rose' | 'slate';
    icon: any;
  } => {
    switch (riskLevel) {
      case 'SAFE':
      case 'LOW':
      case 'LOW_RISK':
        return {
          displayLevel: 'LOW RISK',
          description: 'No known fraudulent cues detected',
          theme: 'emerald',
          icon: ShieldCheck,
        };
      case 'GUARDED':
      case 'ELEVATED':
      case 'SUSPICIOUS':
        return {
          displayLevel: 'SUSPICIOUS',
          description: 'Suspicious conversational or acoustic patterns detected',
          theme: 'amber',
          icon: AlertTriangle,
        };
      case 'HIGH':
      case 'HIGH_RISK':
        return {
          displayLevel: 'HIGH RISK',
          description: 'High probability of fraud or social engineering',
          theme: 'rose',
          icon: ShieldAlert,
        };
      case 'CRITICAL':
        return {
          displayLevel: 'CRITICAL THREAT',
          description: 'Imminent security risk / deepfake impersonation detected',
          theme: 'rose',
          icon: ShieldAlert,
        };
      case 'INCONCLUSIVE':
        return {
          displayLevel: 'INCONCLUSIVE',
          description: 'Signals insufficient to verify call safety',
          theme: 'slate',
          icon: HelpCircle,
        };
      case 'NOT_AVAILABLE':
      default:
        return {
          displayLevel: 'ANALYSIS UNAVAILABLE',
          description: 'Voice & fraud analysis currently unreachable',
          theme: 'slate',
          icon: AlertCircle,
        };
    }
  };

  const info = normalizeLevel();
  const Icon = info.icon;

  const colorStyles = {
    emerald: {
      bg: 'bg-[#168F86]/10',
      border: 'border-[#168F86]/35',
      text: 'text-[#168F86]',
      badgeBg: 'bg-[#168F86]/20',
      badgeBorder: 'border-[#168F86]/40',
      badgeText: 'text-[#168F86]',
      bar: 'bg-[#168F86]',
      glow: 'shadow-sm',
    },
    amber: {
      bg: 'bg-[#C87524]/10',
      border: 'border-[#C87524]/35',
      text: 'text-[#C87524]',
      badgeBg: 'bg-[#C87524]/20',
      badgeBorder: 'border-[#C87524]/40',
      badgeText: 'text-[#C87524]',
      bar: 'bg-[#C87524]',
      glow: 'shadow-sm',
    },
    rose: {
      bg: 'bg-[#D94A5A]/10',
      border: 'border-[#D94A5A]/35',
      text: 'text-[#D94A5A]',
      badgeBg: 'bg-[#D94A5A]/20',
      badgeBorder: 'border-[#D94A5A]/40',
      badgeText: 'text-[#D94A5A]',
      bar: 'bg-[#D94A5A]',
      glow: 'shadow-sm',
    },
    slate: {
      bg: 'bg-[#24242B]',
      border: 'border-[#3A3A42]',
      text: 'text-[#A0A4AE]',
      badgeBg: 'bg-[#2E2E36]',
      badgeBorder: 'border-[#3A3A42]',
      badgeText: 'text-[#A0A4AE]',
      bar: 'bg-[#3A3A42]',
      glow: '',
    },
  }[info.theme];

  const hasScore = score !== null && score !== undefined && Number.isFinite(score);
  const displayScore = hasScore ? Math.round(score) : null;

  if (compact) {
    return (
      <div
        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${colorStyles.bg} ${colorStyles.border}`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${colorStyles.text}`} />
          <span className="text-xs font-bold text-[#F5F5F7] font-mono">
            {info.displayLevel}
          </span>
        </div>
        {hasScore ? (
          <div className="text-right font-mono">
            <span className={`text-base font-bold ${colorStyles.text}`}>
              {displayScore}
            </span>
            <span className="text-[#A0A4AE] text-xs">/100</span>
          </div>
        ) : (
          <span className="text-[11px] text-[#A0A4AE] font-mono">--</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`p-5 rounded-2xl border transition-all ${colorStyles.bg} ${colorStyles.border} ${colorStyles.glow}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#A0A4AE] font-semibold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#7A1F3D]" />
              VOXSHIELD FRAUD RISK SCORE
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1.5">
            {hasScore ? (
              <>
                <span className={`text-4xl font-bold font-mono tracking-tight ${colorStyles.text}`}>
                  {displayScore}
                </span>
                <span className="text-sm font-mono text-[#A0A4AE] font-medium">/ 100</span>
              </>
            ) : (
              <span className="text-xl font-bold font-mono text-[#A0A4AE]">
                N/A
              </span>
            )}
          </div>
        </div>

        <div className="text-right space-y-1">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono border ${colorStyles.badgeBg} ${colorStyles.badgeBorder} ${colorStyles.badgeText} shadow-sm`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{info.displayLevel}</span>
          </span>
          <p className="text-[11px] text-[#A0A4AE] max-w-[160px] text-right truncate">
            {info.description}
          </p>
        </div>
      </div>

      {/* Visual Risk Progress Bar */}
      <div className="mt-4 pt-1">
        <div className="w-full h-2.5 rounded-full bg-[#1A1A1F] border border-[#3A3A42] overflow-hidden relative">
          {hasScore ? (
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${colorStyles.bar} shadow-sm`}
              style={{ width: `${Math.min(100, Math.max(0, displayScore!))}%` }}
            />
          ) : (
            <div className="w-full h-full bg-[#2E2E36]" />
          )}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-[#A0A4AE] mt-1.5 font-medium">
          <span>0 (SAFE)</span>
          <span>50 (SUSPICIOUS)</span>
          <span>100 (HIGH RISK)</span>
        </div>
      </div>

      {/* Threat Classification if provided */}
      {threatClassification && (
        <div className="mt-3.5 pt-3 border-t border-[#3A3A42] flex items-center justify-between">
          <span className="text-[11px] text-[#A0A4AE] font-mono">
            Threat Classification:
          </span>
          <span className="text-xs font-semibold font-mono text-[#D94A5A] truncate ml-2">
            {threatClassification}
          </span>
        </div>
      )}
    </div>
  );
};
