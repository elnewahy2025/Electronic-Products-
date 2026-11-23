import type { NextRequest } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Normalise a configured URL to a full origin (scheme + host + port).
 * Path, query and credentials are deliberately discarded.
 */
function canonicalOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Fixed allowlist. `x-forwarded-host` is intentionally NOT trusted: an edge or
 * proxy must overwrite/strip forwarded headers, and any additional tunnel or
 * custom origin must be listed explicitly in CSRF_ALLOWED_ORIGINS.
 */
export function allowedOrigins(): Set<string> {
  const configured = [
    process.env.NEXT_PUBLIC_APP_URL ?? '',
    process.env.CSRF_ALLOWED_ORIGINS ?? '',
  ].join(',');

  return new Set(
    configured
      .split(',')
      .map((value) => canonicalOrigin(value.trim()))
      .filter((value): value is string => value !== null),
  );
}

/**
 * Reject cross-site cookie-authenticated mutations.
 *
 * Checks `Origin` first, falling back to the browser-asserted
 * `Sec-Fetch-Site` when a client omits `Origin`. Forwarded headers from the
 * request are never used to expand the allowlist.
 */
export function assertSameOrigin(req: NextRequest): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;

  const allowed = allowedOrigins();

  const origin = req.headers.get('origin');
  if (origin) {
    const normalized = canonicalOrigin(origin);
    if (!normalized || allowed.size === 0 || !allowed.has(normalized)) {
      throw new Error('CSRF_INVALID_ORIGIN');
    }
    return;
  }

  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite) {
    if (!['same-origin', 'none'].includes(secFetchSite.toLowerCase())) {
      throw new Error('CSRF_INVALID_ORIGIN');
    }
    return;
  }

  throw new Error('CSRF_ORIGIN_REQUIRED');
}
