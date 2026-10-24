/**
 * Drizzle wraps driver errors, so the Postgres error code can sit on `cause`.
 * Returns the SQLSTATE of the underlying error, if there is one.
 */
export function pgErrorCode(error: unknown): string | undefined {
  for (let e = error as { code?: unknown; cause?: unknown } | undefined; e;) {
    if (typeof e.code === 'string') return e.code;
    e = e.cause as typeof e;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
