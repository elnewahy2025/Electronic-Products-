import 'server-only';

const SAFE_TOKEN_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const SAFE_CODE_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export interface ServerErrorLogMeta {
  status?: number;
  code?: string;
}

function extractRawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return '';
}

function extractSafeCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const raw = (error as { code?: unknown }).code;
  if (typeof raw === 'string' && SAFE_CODE_RE.test(raw)) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return undefined;
}

function extractErrorName(error: unknown): string {
  if (error instanceof Error && typeof error.name === 'string' && SAFE_CODE_RE.test(error.name)) {
    return error.name;
  }
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    typeof (error as { name?: unknown }).name === 'string' &&
    SAFE_CODE_RE.test((error as { name: string }).name)
  ) {
    return (error as { name: string }).name;
  }
  return typeof error;
}

/**
 * Emit a structured, privacy-safe server error log entry (JSON line).
 *
 * Records ONLY `scope`, `errorName`, safe `errorCode` (e.g. Postgres/PostgREST/Node
 * code), `publicToken`, `sanitized`, optional HTTP `status`, and ISO `ts`.
 * Never logs request bodies, headers, cookies, tokens, or raw SQL/user strings.
 */
export function logServerError(
  scope: string,
  error: unknown,
  meta?: ServerErrorLogMeta,
): void {
  const rawMessage = extractRawMessage(error);
  const isSafeToken = SAFE_TOKEN_RE.test(rawMessage);
  const publicToken = isSafeToken ? rawMessage : 'REQUEST_FAILED';
  const errorCode =
    meta?.code && SAFE_CODE_RE.test(meta.code)
      ? meta.code
      : extractSafeCode(error);

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: 'error',
    scope,
    errorName: extractErrorName(error),
    publicToken,
    sanitized: !isSafeToken,
  };
  if (errorCode) entry.errorCode = errorCode;
  if (typeof meta?.status === 'number') entry.status = meta.status;

  console.error(JSON.stringify(entry));
}

/**
 * Return a client-safe error code.
 *
 * App errors and DB RPC sentinels are simple `snake_case` / `SCREAMING_SNAKE`
 * tokens and are safe to surface. Raw PostgREST/Postgres messages contain
 * sentences, schema names and constraint names, so they are replaced with a
 * stable fallback instead of leaking internals — and automatically logged via
 * `logServerError` so unexpected failures are never silently swallowed.
 */
export function publicError(
  error: unknown,
  fallback = 'REQUEST_FAILED',
  scope?: string,
): string {
  const message = extractRawMessage(error);
  if (SAFE_TOKEN_RE.test(message)) {
    return message;
  }
  logServerError(scope ?? 'api.publicError', error);
  return fallback;
}
