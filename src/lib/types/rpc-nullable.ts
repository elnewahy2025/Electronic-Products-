/**
 * Supabase's TypeScript generator drops SQL NULL from RPC argument types even
 * when the PL/pgSQL parameter and its DEFAULT are nullable. This helper makes
 * those call sites explicit without weakening the rest of the generated
 * schema types. It also normalizes `undefined` to SQL `NULL`: Supabase omits
 * undefined keys from the RPC body, which turns a nullable argument into a
 * "function does not match" error when the SQL parameter has no DEFAULT.
 */
export function rpcNullable<T>(value: T | null | undefined): T {
  return (value ?? null) as T;
}
