import type { PlanterDto } from '@org/shared';
import {
  DEFAULT_THRESHOLD,
  STALE_AFTER_MS,
  gatewayOnline,
  getThreshold,
  lastUpdate,
  setThreshold,
  soilStatus,
} from './moisture';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const planter = (latest: PlanterDto['latest']) => ({ latest });

describe('soilStatus', () => {
  it('has no data before the first soil reading', () => {
    expect(soilStatus(planter({}), 30, NOW)).toBe('no-data');
    expect(
      soilStatus(
        planter({ airTemperature: { value: 20, time: ago(1000) } }),
        30,
        NOW,
      ),
    ).toBe('no-data');
  });

  it('is dry below the limit and ok at or above it', () => {
    const at = (value: number) =>
      planter({ soilHumidity: { value, time: ago(60_000) } });
    expect(soilStatus(at(29), 30, NOW)).toBe('dry');
    expect(soilStatus(at(30), 30, NOW)).toBe('ok');
    expect(soilStatus(at(80), 30, NOW)).toBe('ok');
  });

  it('is stale when the newest soil reading is old, even if it was dry', () => {
    const old = planter({
      soilHumidity: { value: 5, time: ago(STALE_AFTER_MS + 1000) },
    });
    expect(soilStatus(old, 30, NOW)).toBe('stale');
  });
});

describe('gatewayOnline', () => {
  it('is offline when it never reported', () => {
    expect(gatewayOnline({ lastSeenAt: null }, NOW)).toBe(false);
  });

  it('is online within the window and offline after it', () => {
    expect(gatewayOnline({ lastSeenAt: ago(60_000) }, NOW)).toBe(true);
    expect(gatewayOnline({ lastSeenAt: ago(STALE_AFTER_MS + 1000) }, NOW)).toBe(
      false,
    );
  });
});

describe('lastUpdate', () => {
  it('is the newest time across metrics, or null', () => {
    expect(lastUpdate(planter({}))).toBeNull();
    expect(
      lastUpdate(
        planter({
          airTemperature: { value: 20, time: ago(5000) },
          soilHumidity: { value: 40, time: ago(1000) },
          airHumidity: { value: 50, time: ago(9000) },
        }),
      ),
    ).toBe(ago(1000));
  });
});

describe('threshold storage', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to the default and remembers a saved limit per planter', () => {
    expect(getThreshold('a')).toBe(DEFAULT_THRESHOLD);
    setThreshold('a', 45);
    expect(getThreshold('a')).toBe(45);
    expect(getThreshold('b')).toBe(DEFAULT_THRESHOLD);
  });

  it('ignores a stored value that is not a percentage', () => {
    localStorage.setItem('spring:threshold:a', 'banana');
    expect(getThreshold('a')).toBe(DEFAULT_THRESHOLD);
    localStorage.setItem('spring:threshold:a', '140');
    expect(getThreshold('a')).toBe(DEFAULT_THRESHOLD);
  });
});
