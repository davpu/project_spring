export * from './client.js';
export * from './schema/index.js';

// Query operators (`eq`, `and`, `sql`, ...) are re-exported on purpose.
// drizzle-orm ships separate `.d.ts` and `.d.cts` declarations, and a CommonJS
// consumer such as the API would otherwise type them against the CJS copy while
// the schema here is typed against the ESM one, making the two incompatible.
// Importing everything drizzle-related from this package keeps one copy.
export * from 'drizzle-orm';
