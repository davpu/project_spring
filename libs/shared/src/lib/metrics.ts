import { z } from 'zod';

/** Metric ids as stored in `readings.metric`. */
export const METRICS = ['temperature', 'humidity', 'soil_moisture'] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_UNITS: Record<Metric, string> = {
  temperature: '°C',
  humidity: '%',
  soil_moisture: '%',
};

/** Short keys used on the wire by the gateway -> stored metric id. */
export const PAYLOAD_KEY_TO_METRIC = {
  temp: 'temperature',
  hum: 'humidity',
  soil: 'soil_moisture',
} as const satisfies Record<string, Metric>;
export type PayloadKey = keyof typeof PAYLOAD_KEY_TO_METRIC;

/**
 * Body of a telemetry message from a gateway, e.g.
 * `{ "temp": 20, "hum": 30, "soil": 40 }`. At least one measurement is
 * required. Unknown keys are rejected so typos surface instead of silently
 * losing data. `ts` is optional and defaults to the receive time on the server.
 */
export const TelemetryPayloadSchema = z
  .strictObject({
    ts: z.iso.datetime({ offset: true }).optional(),
    temp: z.number().min(-50).max(100).optional(),
    hum: z.number().min(0).max(100).optional(),
    soil: z.number().min(0).max(100).optional(),
  })
  .refine(
    (p) =>
      Object.keys(PAYLOAD_KEY_TO_METRIC).some(
        (k) => p[k as PayloadKey] !== undefined,
      ),
    {
      message: 'At least one measurement is required',
    },
  );
export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

export interface ReadingInput {
  time: Date;
  metric: Metric;
  value: number;
}

/** Flattens a telemetry payload into one row per metric. */
export function telemetryToReadings(
  payload: TelemetryPayload,
  receivedAt: Date,
): ReadingInput[] {
  const time = payload.ts ? new Date(payload.ts) : receivedAt;
  return (Object.keys(PAYLOAD_KEY_TO_METRIC) as PayloadKey[]).flatMap((key) => {
    const value = payload[key];
    return value === undefined
      ? []
      : [{ time, metric: PAYLOAD_KEY_TO_METRIC[key], value }];
  });
}
