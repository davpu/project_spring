import { METRIC_UNITS, type Metric } from '@org/shared';

export const METRIC_LABELS: Record<Metric, string> = {
  soilHumidity: 'Soil moisture',
  airTemperature: 'Air temperature',
  airHumidity: 'Air humidity',
};

/** Decimals worth showing per metric; soil moisture is a whole number. */
const DECIMALS: Record<Metric, number> = {
  soilHumidity: 0,
  airTemperature: 1,
  airHumidity: 0,
};

export function formatValue(metric: Metric, value: number | undefined): string {
  if (value === undefined) return '–';
  return `${value.toFixed(DECIMALS[metric])} ${METRIC_UNITS[metric]}`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function formatDateTime(iso: string | number | Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(iso),
  );
}

export function formatTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(
    value,
  );
}

export function formatDay(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(value);
}
