import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * A pending "forgot password" link. The emailed token is random and single-use,
 * and only a hash of it is stored, so a leaked table holds nothing that can be
 * redeemed. `usedAt` is set when it is redeemed; an unused row past `expiresAt`
 * is dead and only kept until the user is deleted.
 */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('password_resets_user_id_idx').on(t.userId)],
);
