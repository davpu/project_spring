import { z } from 'zod';

/** Gateway-chosen planter identifier; safe to embed in an MQTT topic. */
export const SensorKeySchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,63}$/,
    'Use lowercase letters, digits, "-" and "_" (max 64 characters)',
  );

export const GatewayStatusSchema = z.enum(['online', 'offline']);
export type GatewayStatus = z.infer<typeof GatewayStatusSchema>;

export const topics = {
  telemetry: (gatewayId: string, sensorKey: string) =>
    `gateways/${gatewayId}/planters/${sensorKey}/telemetry`,
  /** Plain-text `online`/`offline`; `offline` is the MQTT last will. */
  status: (gatewayId: string) => `gateways/${gatewayId}/status`,
  /** Server-side subscriptions. */
  telemetryFilter: 'gateways/+/planters/+/telemetry',
  statusFilter: 'gateways/+/status',
} as const;

const UuidSchema = z.uuid();

export function parseTelemetryTopic(
  topic: string,
): { gatewayId: string; sensorKey: string } | null {
  const [root, gatewayId, planters, sensorKey, leaf, ...rest] =
    topic.split('/');
  if (
    root !== 'gateways' ||
    planters !== 'planters' ||
    leaf !== 'telemetry' ||
    rest.length > 0
  )
    return null;
  if (
    !UuidSchema.safeParse(gatewayId).success ||
    !SensorKeySchema.safeParse(sensorKey).success
  )
    return null;
  return { gatewayId: gatewayId as string, sensorKey: sensorKey as string };
}

export function parseStatusTopic(topic: string): { gatewayId: string } | null {
  const [root, gatewayId, leaf, ...rest] = topic.split('/');
  if (root !== 'gateways' || leaf !== 'status' || rest.length > 0) return null;
  if (!UuidSchema.safeParse(gatewayId).success) return null;
  return { gatewayId: gatewayId as string };
}
