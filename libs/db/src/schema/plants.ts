import {
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { planters } from './planters.js';

export const plantLifecycle = pgEnum('plant_lifecycle', [
  'annual',
  'biennial',
  'perennial',
]);

/** Business model only: what is growing in a planter. */
export const plants = pgTable('plants', {
  id: uuid().primaryKey().defaultRandom(),
  planterId: uuid('planter_id')
    .notNull()
    .references(() => planters.id, { onDelete: 'cascade' }),
  species: text().notNull(),
  lifecycle: plantLifecycle().notNull(),
  plantedAt: date('planted_at'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
