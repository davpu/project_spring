import { formatRelative, formatValue } from './format';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('formatValue', () => {
  it('uses each metric unit and precision', () => {
    expect(formatValue('airTemperature', 21.44)).toBe('21.4 °C');
    expect(formatValue('airHumidity', 45.4)).toBe('45 %');
    expect(formatValue('soilHumidity', 37)).toBe('37 %');
  });

  it('shows a dash when there is no value', () => {
    expect(formatValue('soilHumidity', undefined)).toBe('–');
  });
});

describe('formatRelative', () => {
  it('reads naturally from seconds to days', () => {
    expect(formatRelative(null, NOW)).toBe('never');
    expect(formatRelative(ago(10_000), NOW)).toBe('just now');
    expect(formatRelative(ago(5 * 60_000), NOW)).toBe('5 min ago');
    expect(formatRelative(ago(3 * 3_600_000), NOW)).toBe('3 h ago');
    expect(formatRelative(ago(3 * 24 * 3_600_000), NOW)).toBe('3 d ago');
  });

  it('never goes negative when the clock is slightly off', () => {
    expect(formatRelative(ago(-5000), NOW)).toBe('just now');
  });
});
