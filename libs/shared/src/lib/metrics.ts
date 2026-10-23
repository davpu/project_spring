import { z } from 'zod';

/**
 * Metric ids as stored in `readings.metric`. These are also the payload keys a
 * node puts on the wire, so the same name identifies a quantity from the sensor
 * all the way to the database and there is nothing to translate in between.
 */
export const METRICS = [
  'airTemperature',
  'airHumidity',
  'soilHumidity',
] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_UNITS: Record<Metric, string> = {
  airTemperature: '°C',
  airHumidity: '%',
  soilHumidity: '%',
};

/**
 * Resolution each sensor actually delivers, in the metric's own unit. A
 * producer rounds to this before publishing; it is deliberately **not** a
 * JSON Schema `multipleOf`.
 *
 * `multipleOf` with a non-integer is not portable. Zod checks it float-safely
 * and accepts every value with one decimal, while the ajv build inside
 * Node-RED rejects about a third of them (0.3, 0.6, 1.2, ...) because it
 * divides in binary floating point. Putting it in the schema made the gateway
 * drop valid readings and, worse, made the generated validator disagree with
 * the Zod one it is generated from.
 */
export const METRIC_RESOLUTION: Record<Metric, number> = {
  airTemperature: 0.1,
  airHumidity: 0.1,
  soilHumidity: 1,
};

/**
 * Body of a telemetry message from a gateway, e.g.
 * `{ "airTemperature": 20.4, "airHumidity": 30, "soilHumidity": 40 }`. At least
 * one measurement is required. Unknown keys are rejected so typos surface
 * instead of silently losing data. `ts` is optional and defaults to the receive
 * time on the server.
 */
export const TelemetryPayloadSchema = z
  .strictObject({
    ts: z.iso.datetime({ offset: true }).optional(),
    /** Unbounded on purpose: there is no sane ceiling to assert here. */
    airTemperature: z.number().optional(),
    airHumidity: z.number().min(0).max(100).optional(),
    soilHumidity: z.int().min(0).max(100).optional(),
  })
  .refine((p) => METRICS.some((metric) => p[metric] !== undefined), {
    message: 'At least one measurement is required',
  });
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
  return METRICS.flatMap((metric) => {
    const value = payload[metric];
    return value === undefined ? [] : [{ time, metric, value }];
  });
}
