/**
 * Safe formatting utilities for VOXSHIELD SOC interface.
 * Prevents "Invalid Date" errors, handles missing timestamps,
 * and maintains clean professional presentation.
 */

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

export function formatSafeTime(value: any, fallback = 'Time unavailable'): string {
  const date = parseValidDate(value);
  if (!date) return fallback;
  try {
    return date.toLocaleTimeString();
  } catch {
    return fallback;
  }
}

export function formatSafeDateTime(value: any, fallback = 'Time unavailable'): string {
  const date = parseValidDate(value);
  if (!date) return fallback;
  try {
    return date.toLocaleString();
  } catch {
    return fallback;
  }
}

export function formatPercentage(value: number | null | undefined, fallback = '—'): string {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return fallback;
  }
  return `${(value * 100).toFixed(0)}%`;
}
