import type { ErrorEvent } from '@sentry/nextjs';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-internal-secret',
  'x-cron-secret',
  'x-worker-secret',
  'x-api-key',
  'x-supabase-auth',
  'x-csrf-token',
]);

const SENSITIVE_QUERY_KEYS = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'refresh_token',
  'key',
  'secret',
  'password',
  'email',
]);

function scrubUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const k of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(k.toLowerCase())) {
        u.searchParams.set(k, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return rawUrl.split('?')[0] ?? rawUrl;
  }
}

/**
 * Strip cookies, authorization/secret headers, request bodies, sensitive query
 * parameters, and user PII before any event leaves the application for Sentry.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;

    if (event.request.headers && typeof event.request.headers === 'object') {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(event.request.headers)) {
        if (!SENSITIVE_HEADERS.has(k.toLowerCase())) {
          cleaned[k] = v;
        }
      }
      event.request.headers = cleaned;
    }

    if (typeof event.request.url === 'string') {
      event.request.url = scrubUrl(event.request.url);
    }
    if (event.request.query_string) {
      delete event.request.query_string;
    }
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  return event;
}
