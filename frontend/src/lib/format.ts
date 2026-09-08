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
      textClass: 'text-slate-400',
      badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
      barColor: 'bg-slate-700',
    };
  }
  const normalized = score > 1 ? score : score * 100;
  if (normalized >= 70) {
    return {
      level: 'CRITICAL',
      textClass: 'text-rose-400',
      badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
      barColor: 'bg-rose-500',
    };
  }
  if (normalized >= 50) {
    return {
      level: 'HIGH',
      textClass: 'text-orange-400',
      badgeClass: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
      barColor: 'bg-orange-500',
    };
  }
  if (normalized >= 30) {
    return {
      level: 'ELEVATED',
      textClass: 'text-amber-300',
      badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
      barColor: 'bg-amber-500',
    };
  }
  if (normalized > 0) {
    return {
      level: 'LOW',
      textClass: 'text-cyan-300',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
      barColor: 'bg-cyan-500',
    };
  }
  return {
    level: 'NEUTRAL',
    textClass: 'text-slate-300',
    badgeClass: 'bg-slate-900 text-slate-400 border border-slate-800',
    barColor: 'bg-slate-700',
  };
}
