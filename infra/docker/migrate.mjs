// Applies the Drizzle migrations. It runs from the API image, which does not
// carry drizzle-kit, so this uses the migrator from drizzle-orm directly.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: new URL('./libs/db/migrations', import.meta.url).pathname,
  });
  console.log('Migrations applied');
} finally {
  await pool.end();
}
