import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { gateways } from './gateways.js';

/** A flower pot with its own sensors. Measurements belong to a planter. */
export const planters = pgTable(
  'planters',
  {
    id: uuid().primaryKey().defaultRandom(),
    gatewayId: uuid('gateway_id')
      .notNull()
      .references(() => gateways.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /** Identifier the gateway uses for this planter in MQTT topics. */
    sensorKey: text('sensor_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('planters_gateway_sensor_key_uq').on(t.gatewayId, t.sensorKey),
  ],
);
