import {
  doublePrecision,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { planters } from './planters.js';

/**
 * Time-series measurements, one row per metric. Turned into a TimescaleDB
 * hypertable by a custom migration. The primary key includes `time` (required
 * for hypertables) and makes redelivered MQTT messages idempotent.
 */
export const readings = pgTable(
  'readings',
  {
    time: timestamp({ withTimezone: true }).notNull(),
    planterId: uuid('planter_id')
      .notNull()
      .references(() => planters.id, { onDelete: 'cascade' }),
    metric: text().notNull(),
    value: doublePrecision().notNull(),
  },
  (t) => [primaryKey({ columns: [t.planterId, t.metric, t.time] })],
);
