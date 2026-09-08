/**
 * VOXSHIELD Data Adapters & Fail-Closed Severity Formatters
 * 
 * STRICT SECURITY PRINCIPLE:
 * Missing data or unavailable AI services must NEVER be displayed as Green / Safe.
 * AI Unavailable, Inconclusive, Disconnected, or Incomplete must be formatted as GRAY.
 */

export type ThreatSeverityLevel = 'SAFE' | 'LOW' | 'GUARDED' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'SUSPICIOUS' | 'INCONCLUSIVE' | 'NOT_AVAILABLE' | 'UNAVAILABLE';

export interface SeverityBadgeConfig {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  dotColor: string;
  textColor: string;
  badgeClass: string;
  isFailClosed: boolean;
}

/**
 * Returns fail-closed badge configuration for any risk level
 */
export function getSeverityBadgeConfig(level?: string | null): SeverityBadgeConfig {
  if (!level) {
    return {
      label: 'AI UNAVAILABLE',
      colorClass: 'text-[#A0A4AE]',
      bgClass: 'bg-[#24242B]',
      borderClass: 'border-[#3A3A42]',
      dotColor: 'bg-[#A0A4AE]',
      textColor: 'text-[#A0A4AE]',
      badgeClass: 'bg-[#24242B] text-[#A0A4AE] border-[#3A3A42]',
      isFailClosed: true,
    };
  }

  const normalized = level.toUpperCase().trim();

  switch (normalized) {
    case 'CRITICAL':
      return {
        label: 'CRITICAL THREAT',
        colorClass: 'text-[#D94A5A]',
        bgClass: 'bg-[#D94A5A]/15',
        borderClass: 'border-[#D94A5A]/40',
        dotColor: 'bg-[#D94A5A]',
        textColor: 'text-[#D94A5A]',
        badgeClass: 'bg-[#D94A5A]/15 text-[#D94A5A] border-[#D94A5A]/40',
        isFailClosed: false,
      };

    case 'HIGH':
      return {
        label: 'HIGH RISK',
        colorClass: 'text-[#C87524]',
        bgClass: 'bg-[#C87524]/15',
        borderClass: 'border-[#C87524]/40',
        dotColor: 'bg-[#C87524]',
        textColor: 'text-[#C87524]',
        badgeClass: 'bg-[#C87524]/15 text-[#C87524] border-[#C87524]/40',
        isFailClosed: false,
      };

    case 'ELEVATED':
    case 'GUARDED':
    case 'SUSPICIOUS':
    case 'MEDIUM':
      return {
        label: 'SUSPICIOUS / ATTENTION REQUIRED',
        colorClass: 'text-[#C87524]',
        bgClass: 'bg-[#C87524]/12',
        borderClass: 'border-[#C87524]/35',
        dotColor: 'bg-[#C87524]',
        textColor: 'text-[#C87524]',
        badgeClass: 'bg-[#C87524]/12 text-[#C87524] border-[#C87524]/35',
        isFailClosed: false,
      };

    case 'SAFE':
    case 'LOW':
    case 'AUTHENTIC':
      return {
        label: 'VERIFIED AUTHENTIC / LOW RISK',
        colorClass: 'text-[#168F86]',
        bgClass: 'bg-[#168F86]/15',
        borderClass: 'border-[#168F86]/40',
        dotColor: 'bg-[#168F86]',
        textColor: 'text-[#168F86]',
        badgeClass: 'bg-[#168F86]/15 text-[#168F86] border-[#168F86]/40',
        isFailClosed: false,
      };

    case 'INCONCLUSIVE':
      return {
        label: 'INCONCLUSIVE (EVALUATING)',
        colorClass: 'text-[#A0A4AE]',
        bgClass: 'bg-[#24242B]',
        borderClass: 'border-[#3A3A42]',
        dotColor: 'bg-[#A0A4AE]',
        textColor: 'text-[#A0A4AE]',
        badgeClass: 'bg-[#24242B] text-[#A0A4AE] border-[#3A3A42]',
        isFailClosed: true,
      };

    case 'NOT_AVAILABLE':
    case 'UNAVAILABLE':
    case 'WAITING':
    default:
      return {
        label: 'AI UNAVAILABLE / PENDING',
        colorClass: 'text-[#A0A4AE]',
        bgClass: 'bg-[#24242B]',
        borderClass: 'border-[#3A3A42]',
        dotColor: 'bg-[#A0A4AE]',
        textColor: 'text-[#A0A4AE]',
        badgeClass: 'bg-[#24242B] text-[#A0A4AE] border-[#3A3A42]',
        isFailClosed: true,
      };
  }
}

/**
 * Formats a confidence score (0-1) safely without fabrication
 */
export function formatConfidence(score?: number | null): string {
  if (score === null || score === undefined || isNaN(score)) {
    return 'N/A';
  }
  return `${(Math.max(0, Math.min(1, score)) * 100).toFixed(0)}%`;
}

/**
 * Formats a risk score (0-100) safely
 */
export function formatRiskScore(score?: number | null): string {
  if (score === null || score === undefined || isNaN(score)) {
    return 'N/A';
  }
  return score.toFixed(1);
}

/**
 * Formats duration in seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
