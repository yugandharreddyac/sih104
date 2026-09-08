'use client';

import React from 'react';
import {
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  AlertCircle,
  RefreshCw,
  Cpu,
  Volume2,
} from 'lucide-react';

export type VoiceAuthStatus =
  | 'DETECTED'
  | 'NOT_DETECTED'
  | 'INCONCLUSIVE'
  | 'NOT_AVAILABLE'
  | 'ERROR'
  | 'ANALYZING';

interface VoiceAuthenticityProps {
  status: VoiceAuthStatus;
  artifacts?: string[];
  explainability?: string[];
  confidence?: number | null;
  uncertainty?: number | null;
  compact?: boolean;
}

export const VoiceAuthenticity: React.FC<VoiceAuthenticityProps> = ({
  status,
  artifacts = [],
  explainability = [],
  confidence,
  uncertainty,
  compact = false,
}) => {
  const getDisplayConfig = () => {
    switch (status) {
      case 'DETECTED':
        return {
          title: 'Synthetic Voice Detected',
          subtitle: 'Acoustic patterns indicate AI voice synthesis or cloned speech',
          badgeText: 'SYNTHETIC SPEECH',
          badgeColor: 'bg-[#D94A5A]/20 text-[#D94A5A] border-[#D94A5A]/40',
          bgColor: 'bg-[#D94A5A]/10',
          borderColor: 'border-[#D94A5A]/35',
          iconColor: 'text-[#D94A5A]',
          iconBg: 'bg-[#D94A5A]/20',
          icon: ShieldAlert,
          alertMessage: 'Caution: The speaker voice exhibits acoustic artifacts typical of generative AI cloning or vocoder manipulation.',
        };
      case 'NOT_DETECTED':
        return {
          title: 'Natural Voice Verified',
          subtitle: 'Acoustic patterns are consistent with natural human speech',
          badgeText: 'NATURAL VOICE',
          badgeColor: 'bg-[#168F86]/20 text-[#168F86] border-[#168F86]/40',
          bgColor: 'bg-[#168F86]/10',
          borderColor: 'border-[#168F86]/35',
          iconColor: 'text-[#168F86]',
          iconBg: 'bg-[#168F86]/20',
          icon: ShieldCheck,
          alertMessage: 'No synthetic audio artifacts or vocoder anomalies detected in the analyzed audio stream.',
        };
      case 'INCONCLUSIVE':
        return {
          title: 'Authenticity Inconclusive',
          subtitle: 'Audio sample length or background noise limits definitive scoring',
          badgeText: 'INCONCLUSIVE',
          badgeColor: 'bg-[#2E2E36] text-[#A0A4AE] border-[#3A3A42]',
          bgColor: 'bg-[#24242B]',
          borderColor: 'border-[#3A3A42]',
          iconColor: 'text-[#A0A4AE]',
          iconBg: 'bg-[#2E2E36]',
          icon: HelpCircle,
          alertMessage: 'Acoustic signals are insufficient to verify or refute voice authenticity. Maintain normal caution.',
        };
      case 'NOT_AVAILABLE':
        return {
          title: 'Voice Inspection Offline',
          subtitle: 'AI voice verification engine is currently unreachable',
          badgeText: 'OFFLINE',
          badgeColor: 'bg-[#C87524]/20 text-[#C87524] border-[#C87524]/40',
          bgColor: 'bg-[#C87524]/10',
          borderColor: 'border-[#C87524]/35',
          iconColor: 'text-[#C87524]',
          iconBg: 'bg-[#C87524]/20',
          icon: AlertCircle,
          alertMessage: 'Voice authenticity analysis is currently unavailable. Safety cannot be guaranteed.',
        };
      case 'ERROR':
        return {
          title: 'Analysis Interrupted',
          subtitle: 'An unexpected processing error occurred during acoustic feature extraction',
          badgeText: 'ERROR',
          badgeColor: 'bg-[#D94A5A]/20 text-[#D94A5A] border-[#D94A5A]/30',
          bgColor: 'bg-[#D94A5A]/10',
          borderColor: 'border-[#D94A5A]/35',
          iconColor: 'text-[#D94A5A]',
          iconBg: 'bg-[#D94A5A]/20',
          icon: AlertCircle,
          alertMessage: 'Unable to analyze caller voice acoustics.',
        };
      case 'ANALYZING':
      default:
        return {
          title: 'Checking Voice Authenticity...',
          subtitle: 'Continuously extracting spectral acoustics and neural artifacts',
          badgeText: 'CHECKING VOICE',
          badgeColor: 'bg-[#2E2E36] text-[#F5F5F7] border-[#3A3A42]',
          bgColor: 'bg-[#24242B]',
          borderColor: 'border-[#3A3A42]',
          iconColor: 'text-[#7A1F3D]',
          iconBg: 'bg-[#2E2E36]',
          icon: RefreshCw,
          spin: true,
          alertMessage: 'Continuous neural voice inspection in progress...',
        };
    }
  };

  const config = getDisplayConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <div
        className={`p-3 rounded-xl border transition-all ${config.bgColor} ${config.borderColor}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center ${config.iconBg} ${config.iconColor}`}
            >
              <Icon
                className={`w-3.5 h-3.5 ${config.spin ? 'animate-spin' : ''}`}
              />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#A0A4AE]">
                Voice Authenticity
              </p>
              <p className="text-xs font-semibold text-[#F5F5F7]">
                {config.title}
              </p>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${config.badgeColor}`}
          >
            {config.badgeText}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-2xl border transition-all ${config.bgColor} ${config.borderColor} shadow-glass-card`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg} ${config.iconColor} border ${config.borderColor} shadow-sm`}
          >
            <Icon
              className={`w-5 h-5 ${config.spin ? 'animate-spin' : ''}`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#A0A4AE] flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-[#7A1F3D]" />
                VOICE AUTHENTICITY
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border ${config.badgeColor}`}
              >
                {config.badgeText}
              </span>
            </div>
            <h4 className="text-sm font-bold text-[#F5F5F7] mt-1">
              {config.title}
            </h4>
            <p className="text-xs text-[#A0A4AE] mt-0.5 leading-relaxed">
              {config.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Advisory Message */}
      <div className="mt-3 p-2.5 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] text-xs text-[#F5F5F7] leading-relaxed">
        {config.alertMessage}
      </div>

      {/* Acoustic Clues if any */}
      {artifacts.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-[#3A3A42]">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#A0A4AE] mb-1.5">
            Detected Indicators:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {artifacts.map((art, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md bg-[#D94A5A]/15 border border-[#D94A5A]/30 text-[#D94A5A] text-[11px] font-medium font-mono"
              >
                {art}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Human explainability summary if provided */}
      {explainability.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {explainability.map((exp, idx) => (
            <p key={idx} className="text-[11px] text-[#A0A4AE] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#168F86] shrink-0" />
              <span className="text-[#F5F5F7]">{exp}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
