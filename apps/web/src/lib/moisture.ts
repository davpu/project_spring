import type { GatewayDto, PlanterDto } from '@org/shared';

/**
 * "Needs water" is decided in the browser: the API stores readings, not
 * thresholds. Each planter's limit lives in this browser's localStorage and
 * defaults to `DEFAULT_THRESHOLD`.
 */
export const DEFAULT_THRESHOLD = 30;

/**
 * No data for this long means something stopped reporting: a planter is
 * "stale" and a gateway is "offline". One window for both, so a quiet gateway
 * and its planters change state together. The gateway downsamples to about
 * one reading every 5 minutes, so 15 minutes is three missed reports.
 */
export const STALE_AFTER_MS = 15 * 60 * 1000;

const storageKey = (planterId: string) => `spring:threshold:${planterId}`;

export function getThreshold(planterId: string): number {
  try {
    const raw = localStorage.getItem(storageKey(planterId));
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}

export function setThreshold(planterId: string, value: number): void {
  try {
    localStorage.setItem(storageKey(planterId), String(value));
  } catch {
    // Private mode or storage disabled: the threshold just will not stick.
  }
}

export type SoilStatus = 'no-data' | 'stale' | 'dry' | 'ok';

export function soilStatus(
  planter: Pick<PlanterDto, 'latest'>,
  threshold: number,
  now = Date.now(),
): SoilStatus {
  const soil = planter.latest.soilHumidity;
  if (!soil) return 'no-data';
  if (now - Date.parse(soil.time) > STALE_AFTER_MS) return 'stale';
  return soil.value < threshold ? 'dry' : 'ok';
}

export function gatewayOnline(
  gateway: Pick<GatewayDto, 'lastSeenAt'>,
  now = Date.now(),
): boolean {
  return (
    gateway.lastSeenAt !== null &&
    now - Date.parse(gateway.lastSeenAt) <= STALE_AFTER_MS
  );
}

/** Newest reading time across all metrics, or null if nothing arrived yet. */
export function lastUpdate(planter: Pick<PlanterDto, 'latest'>): string | null {
  const times = Object.values(planter.latest).map((reading) => reading.time);
  if (times.length === 0) return null;
  return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}
