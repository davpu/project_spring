import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  /** Signs session cookies. Anyone who knows it can mint a session for any user. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** How this process reaches the broker. */
  MQTT_URL: z.string().default('mqtt://localhost:1883'),
  /** How a gateway reaches the broker; handed out when pairing. */
  MQTT_PUBLIC_URL: z.string().optional(),
  /** Dynamic-security admin; the API provisions gateway clients through it. */
  MQTT_ADMIN_USER: z.string().min(1),
  MQTT_ADMIN_PASSWORD: z.string().min(1),
});

export interface AppConfig {
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  mqttUrl: string;
  mqttPublicUrl: string;
  mqttAdminUser: string;
  mqttAdminPassword: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Fails fast with every problem listed, instead of one at a time at first use. */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  return {
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    mqttUrl: e.MQTT_URL,
    mqttPublicUrl: e.MQTT_PUBLIC_URL ?? e.MQTT_URL,
    mqttAdminUser: e.MQTT_ADMIN_USER,
    mqttAdminPassword: e.MQTT_ADMIN_PASSWORD,
  };
}
