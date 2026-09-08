export function parseValidDate(value: any): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function formatSafeTime(value: any, fallback = 'NO TELEMETRY'): string {
  const date = parseValidDate(value);
  if (!date) return fallback;
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return fallback;
  }
}

export function formatSafeDateTime(value: any, fallback = 'NO TELEMETRY'): string {
  const date = parseValidDate(value);
  if (!date) return fallback;
  try {
    return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return fallback;
  }
}

export function formatPercentage(value: number | null | undefined, fallback = '—'): string {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return fallback;
  }
  const pct = value > 1 ? Math.min(100, Math.max(0, value)) : Math.min(100, Math.max(0, value * 100));
  return `${pct.toFixed(0)}%`;
}

export function formatLatency(latencyMs: number | null | undefined): string {
  if (typeof latencyMs !== 'number' || isNaN(latencyMs) || !isFinite(latencyMs) || latencyMs <= 0) {
    return '—';
  }
  return `${latencyMs.toFixed(1)}ms`;
}

export function getRiskSeverity(score: number | null | undefined): {
  level: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'LOW' | 'NEUTRAL' | 'UNKNOWN';
  textClass: string;
  badgeClass: string;
  barColor: string;
} {
  if (score === null || score === undefined || !isFinite(score)) {
    return {
      level: 'UNKNOWN',
      textClass: 'text-mutedText',
      badgeClass: 'bg-surface-elevated text-mutedText border border-border',
      barColor: 'bg-border',
    };
  }
  const normalized = score > 1 ? score : score * 100;
  if (normalized >= 70) {
    return {
      level: 'CRITICAL',
      textClass: 'text-danger',
      badgeClass: 'badge-danger',
      barColor: 'bg-danger',
    };
  }
  if (normalized >= 50) {
    return {
      level: 'HIGH',
      textClass: 'text-danger',
      badgeClass: 'badge-danger',
      barColor: 'bg-danger',
    };
  }
  if (normalized >= 30) {
    return {
      level: 'ELEVATED',
      textClass: 'text-warning',
      badgeClass: 'badge-warning',
      barColor: 'bg-warning',
    };
  }
  if (normalized > 0) {
    return {
      level: 'LOW',
      textClass: 'text-success',
      badgeClass: 'badge-success',
      barColor: 'bg-success',
    };
  }
  return {
    level: 'NEUTRAL',
    textClass: 'text-secondaryText',
    badgeClass: 'badge-neutral',
    barColor: 'bg-border',
  };
}
