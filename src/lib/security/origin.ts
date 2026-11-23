import type { NextRequest } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Reject cross-site cookie-authenticated mutations.
 *
 * Checks `Origin` first, falling back to `Sec-Fetch-Site` when a browser
 * omits `Origin`. The allowed host set is the configured app URL plus the
 * current request host (including forwarded host for tunneled dev).
 */
export function assertSameOrigin(req: NextRequest): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;

  const allowed = new Set<string>();
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    const host = hostOf(configured);
    if (host) allowed.add(host);
  }
  allowed.add(req.nextUrl.host.toLowerCase());

  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    allowed.add(forwardedHost.split(',')[0]!.trim().toLowerCase());
  }

  const origin = req.headers.get('origin');
  if (origin) {
    const originHost = hostOf(origin);
    if (!originHost || !allowed.has(originHost)) {
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
