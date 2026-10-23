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

/** Topic segments for the node -> gateway leg, shared with the firmware. */
export const NODE_TELEMETRY_TOPIC = {
  prefix: 'planters',
  suffix: 'telemetry',
} as const;

/**
 * Node -> gateway on the local broker. A node does not know its `gatewayId`,
 * so it publishes under its own sensor key only and the gateway republishes the
 * message upstream under its own identity. The payload is not rewritten on the
 * way, so both legs carry exactly the same telemetry body.
 */
export const nodeTopics = {
  telemetry: (sensorKey: string) =>
    `${NODE_TELEMETRY_TOPIC.prefix}/${sensorKey}/${NODE_TELEMETRY_TOPIC.suffix}`,
  /** Gateway-side subscription. */
  telemetryFilter: `${NODE_TELEMETRY_TOPIC.prefix}/+/${NODE_TELEMETRY_TOPIC.suffix}`,
} as const;

export function parseNodeTelemetryTopic(
  topic: string,
): { sensorKey: string } | null {
  const [prefix, sensorKey, suffix, ...rest] = topic.split('/');
  if (
    prefix !== NODE_TELEMETRY_TOPIC.prefix ||
    suffix !== NODE_TELEMETRY_TOPIC.suffix ||
    rest.length > 0
  )
    return null;
  if (!SensorKeySchema.safeParse(sensorKey).success) return null;
  return { sensorKey: sensorKey as string };
}

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
