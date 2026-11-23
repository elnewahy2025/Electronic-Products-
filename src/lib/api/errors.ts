import 'server-only';

/**
 * Return a client-safe error code.
 *
 * App errors and DB RPC sentinels are simple `snake_case` / `SCREAMING_SNAKE`
 * tokens and are safe to surface. Raw PostgREST/Postgres messages contain
 * sentences, schema names and constraint names, so they are replaced with a
 * stable fallback instead of leaking internals.
 */
export function publicError(error: unknown, fallback = 'REQUEST_FAILED'): string {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : '';

  return /^[A-Za-z][A-Za-z0-9_]*$/.test(message) ? message : fallback;
}
