import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { gateways } from './gateways.js';
import { users } from './users.js';

/**
 * Short-lived, single-use code a user generates in the web app and enters into
 * the gateway. Only a hash of the code is stored. `gatewayId` is filled in on
 * redemption so the web app can see that pairing finished.
 */
export const pairingCodes = pgTable(
  'pairing_codes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    gatewayName: text('gateway_name').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    gatewayId: uuid('gateway_id').references(() => gateways.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('pairing_codes_user_id_idx').on(t.userId)],
);
