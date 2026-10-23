import { describe, expect, it } from 'vitest';
import {
  PAIRING_CODE_ALPHABET,
  PairRequestSchema,
  TelemetryPayloadSchema,
  formatPairingCode,
  parseStatusTopic,
  parseTelemetryTopic,
  telemetryToReadings,
  topics,
} from '../index.js';

const gatewayId = '2f1c9a52-5e5b-4d5c-9a43-6d2f3c1b7a10';

describe('telemetry payload', () => {
  it('accepts the agreed gateway format', () => {
    expect(
      TelemetryPayloadSchema.safeParse({ temp: 20, hum: 30, soil: 40 }).success,
    ).toBe(true);
  });

  it('accepts a subset of measurements', () => {
    expect(TelemetryPayloadSchema.safeParse({ temp: 21.5 }).success).toBe(true);
  });

  it('rejects empty payloads, unknown keys and out-of-range values', () => {
    expect(TelemetryPayloadSchema.safeParse({}).success).toBe(false);
    expect(TelemetryPayloadSchema.safeParse({ temperature: 20 }).success).toBe(
      false,
    );
    expect(TelemetryPayloadSchema.safeParse({ hum: 120 }).success).toBe(false);
  });

  it('maps short keys to metric ids, using ts when present and receive time otherwise', () => {
    const receivedAt = new Date('2026-01-01T00:00:00Z');
    const withTs = TelemetryPayloadSchema.parse({
      ts: '2025-12-31T23:00:00+00:00',
      hum: 30,
    });
    expect(telemetryToReadings(withTs, receivedAt)).toEqual([
      { time: new Date('2025-12-31T23:00:00Z'), metric: 'humidity', value: 30 },
    ]);
    const withoutTs = TelemetryPayloadSchema.parse({ temp: 0, soil: 40 });
    expect(telemetryToReadings(withoutTs, receivedAt)).toEqual([
      { time: receivedAt, metric: 'temperature', value: 0 },
      { time: receivedAt, metric: 'soil_moisture', value: 40 },
    ]);
  });
});

describe('topics', () => {
  it('round-trips telemetry topics', () => {
    expect(
      parseTelemetryTopic(topics.telemetry(gatewayId, 'balcony-1')),
    ).toEqual({
      gatewayId,
      sensorKey: 'balcony-1',
    });
  });

  it('rejects malformed topics', () => {
    expect(
      parseTelemetryTopic(`gateways/${gatewayId}/planters/a/b/telemetry`),
    ).toBeNull();
    expect(
      parseTelemetryTopic('gateways/not-a-uuid/planters/a/telemetry'),
    ).toBeNull();
    expect(
      parseTelemetryTopic(`gateways/${gatewayId}/planters/A+B/telemetry`),
    ).toBeNull();
    expect(parseTelemetryTopic(`gateways/${gatewayId}/status`)).toBeNull();
  });

  it('parses status topics', () => {
    expect(parseStatusTopic(topics.status(gatewayId))).toEqual({ gatewayId });
    expect(parseStatusTopic(`gateways/${gatewayId}/status/extra`)).toBeNull();
  });
});

describe('pairing code', () => {
  it('normalizes user input before validating', () => {
    expect(PairRequestSchema.parse({ code: ' abcd-2345 ' }).code).toBe(
      'ABCD2345',
    );
  });

  it('rejects wrong length and ambiguous characters', () => {
    expect(PairRequestSchema.safeParse({ code: 'ABCD234' }).success).toBe(
      false,
    );
    expect(PairRequestSchema.safeParse({ code: 'ABCD0OIL' }).success).toBe(
      false,
    );
  });

  it('formats codes for display', () => {
    expect(formatPairingCode('ABCD2345')).toBe('ABCD-2345');
    expect(PAIRING_CODE_ALPHABET).toHaveLength(31);
  });
});
