import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * A paired gateway (Node-RED instance). Its id doubles as the MQTT username;
 * the credentials themselves live in the broker (dynamic-security plugin).
 */
export const gateways = pgTable(
  'gateways',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('gateways_user_id_idx').on(t.userId)],
);
