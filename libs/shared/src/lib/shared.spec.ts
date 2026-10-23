import { describe, expect, it } from 'vitest';
import {
  PAIRING_CODE_ALPHABET,
  PairRequestSchema,
  TelemetryPayloadSchema,
  formatPairingCode,
  nodeTopics,
  parseNodeTelemetryTopic,
  parseStatusTopic,
  parseTelemetryTopic,
  telemetryToReadings,
  topics,
} from '../index.js';

const gatewayId = '2f1c9a52-5e5b-4d5c-9a43-6d2f3c1b7a10';

describe('telemetry payload', () => {
  it('accepts the agreed gateway format', () => {
    expect(
      TelemetryPayloadSchema.safeParse({
        airTemperature: 20.4,
        airHumidity: 30,
        soilHumidity: 40,
      }).success,
    ).toBe(true);
  });

  it('accepts a subset of measurements', () => {
    expect(
      TelemetryPayloadSchema.safeParse({ airTemperature: 21.5 }).success,
    ).toBe(true);
  });

  it('leaves air temperature unbounded', () => {
    expect(
      TelemetryPayloadSchema.safeParse({ airTemperature: -273.1 }).success,
    ).toBe(true);
    expect(
      TelemetryPayloadSchema.safeParse({ airTemperature: 1200 }).success,
    ).toBe(true);
  });

  it('rejects empty payloads, unknown keys and out-of-range values', () => {
    expect(TelemetryPayloadSchema.safeParse({}).success).toBe(false);
    expect(TelemetryPayloadSchema.safeParse({ temp: 20 }).success).toBe(false);
    expect(TelemetryPayloadSchema.safeParse({ airHumidity: 120 }).success).toBe(
      false,
    );
    expect(TelemetryPayloadSchema.safeParse({ soilHumidity: -1 }).success).toBe(
      false,
    );
  });

  it('does not police decimal resolution, only whole-number metrics', () => {
    // Resolution is a producer concern (METRIC_RESOLUTION, applied by the
    // firmware), not a schema rule: `multipleOf` on a non-integer is checked
    // float-safely by Zod but not by the ajv build inside Node-RED, so the two
    // validators would disagree on a third of all one-decimal values. Integers
    // are exact in both.
    expect(
      TelemetryPayloadSchema.safeParse({ airHumidity: 30.7 }).success,
    ).toBe(true);
    expect(
      TelemetryPayloadSchema.safeParse({ airHumidity: 30.75 }).success,
    ).toBe(true);
    expect(TelemetryPayloadSchema.safeParse({ soilHumidity: 40 }).success).toBe(
      true,
    );
    expect(
      TelemetryPayloadSchema.safeParse({ soilHumidity: 40.5 }).success,
    ).toBe(false);
  });

  it('flattens measurements, using ts when present and receive time otherwise', () => {
    const receivedAt = new Date('2026-01-01T00:00:00Z');
    const withTs = TelemetryPayloadSchema.parse({
      ts: '2025-12-31T23:00:00+00:00',
      airHumidity: 30,
    });
    expect(telemetryToReadings(withTs, receivedAt)).toEqual([
      {
        time: new Date('2025-12-31T23:00:00Z'),
        metric: 'airHumidity',
        value: 30,
      },
    ]);
    const withoutTs = TelemetryPayloadSchema.parse({
      airTemperature: 0,
      soilHumidity: 40,
    });
    expect(telemetryToReadings(withoutTs, receivedAt)).toEqual([
      { time: receivedAt, metric: 'airTemperature', value: 0 },
      { time: receivedAt, metric: 'soilHumidity', value: 40 },
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

  it('round-trips the local node -> gateway leg', () => {
    expect(parseNodeTelemetryTopic(nodeTopics.telemetry('balcony-1'))).toEqual({
      sensorKey: 'balcony-1',
    });
  });

  it('rejects malformed local topics', () => {
    expect(parseNodeTelemetryTopic('planters/balcony-1')).toBeNull();
    expect(parseNodeTelemetryTopic('planters/A+B/telemetry')).toBeNull();
    expect(parseNodeTelemetryTopic('planters/a/b/telemetry')).toBeNull();
    expect(
      parseNodeTelemetryTopic(topics.telemetry(gatewayId, 'balcony-1')),
    ).toBeNull();
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
