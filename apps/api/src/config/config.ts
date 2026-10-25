import { z } from 'zod';

/** An empty value in the environment, as compose passes for an unset variable, counts as unset. */
const unsetIfEmpty = (value: unknown) => (value === '' ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(unsetIfEmpty, schema.optional());

const EnvSchema = z
  .object({
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
    /** Where the web app is reached by users; the links in emails point here. */
    APP_URL: z.preprocess(
      unsetIfEmpty,
      z.url().default('http://localhost:4200'),
    ),
    /**
     * Outgoing mail. All of it is optional: without SMTP_HOST the API still runs,
     * and password reset emails are logged in development and not sent in production.
     */
    SMTP_HOST: optional(z.string().min(1)),
    SMTP_PORT: z.preprocess(
      unsetIfEmpty,
      z.coerce.number().int().min(1).max(65535).default(587),
    ),
    SMTP_USER: optional(z.string().min(1)),
    SMTP_PASSWORD: optional(z.string().min(1)),
    /** The sender, e.g. `Spring <noreply@example.com>`. */
    MAIL_FROM: optional(z.string().min(1)),
  })
  .superRefine((env, ctx) => {
    if (!env.SMTP_HOST) return;
    for (const key of ['SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'is required when SMTP_HOST is set',
        });
      }
    }
  });

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

export interface AppConfig {
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  mqttUrl: string;
  mqttPublicUrl: string;
  mqttAdminUser: string;
  mqttAdminPassword: string;
  /** Public address of the web app, without a trailing slash. */
  appUrl: string;
  /** `null` when no SMTP server is configured. */
  mail: MailConfig | null;
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
    appUrl: e.APP_URL.replace(/\/+$/, ''),
    mail:
      e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASSWORD && e.MAIL_FROM
        ? {
            host: e.SMTP_HOST,
            port: e.SMTP_PORT,
            user: e.SMTP_USER,
            password: e.SMTP_PASSWORD,
            from: e.MAIL_FROM,
          }
        : null,
  };
}
