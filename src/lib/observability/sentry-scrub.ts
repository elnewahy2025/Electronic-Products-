import type { Breadcrumb, ErrorEvent, Event } from '@sentry/nextjs';

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

const SENSITIVE_KEYS = new Set([
  'code',
  'state',
  'token',
  'captchatoken',
  'captcha_token',
  'access_token',
  'refresh_token',
  'key',
  'secret',
  'password',
  'email',
  'phone',
  'cookie',
  'authorization',
]);

export function scrubUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl, 'https://redacted.local');
    for (const k of [...u.searchParams.keys()]) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        u.searchParams.set(k, '[REDACTED]');
      }
    }
    return rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? u.toString()
      : `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return rawUrl.split('?')[0] ?? rawUrl;
  }
}

function scrubRecord(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.includes('?') && (value.startsWith('http') || value.startsWith('/'))) {
      return scrubUrl(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubRecord(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase()) || SENSITIVE_HEADERS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = scrubRecord(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function scrubCommonEvent<T extends Event>(event: T): T {
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

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((b) => scrubSentryBreadcrumb(b))
      .filter((b): b is Breadcrumb => b !== null);
  }

  if (event.extra) {
    event.extra = scrubRecord(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = scrubRecord(event.contexts) as typeof event.contexts;
  }

  return event;
}

/**
 * Strip cookies, authorization/secret headers, request bodies, sensitive query
 * parameters, breadcrumbs, extra/contexts, and user PII before sending to Sentry.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  return scrubCommonEvent(event);
}

export function scrubSentryTransaction<T extends Event>(event: T): T {
  if (typeof event.transaction === 'string' && event.transaction.includes('?')) {
    event.transaction = scrubUrl(event.transaction);
  }
  return scrubCommonEvent(event);
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const next: Breadcrumb = { ...breadcrumb };
  if (typeof next.message === 'string' && next.message.includes('?')) {
    next.message = scrubUrl(next.message);
  }
  if (next.data && typeof next.data === 'object') {
    next.data = scrubRecord(next.data) as Record<string, unknown>;
    if (typeof next.data.url === 'string') {
      next.data.url = scrubUrl(next.data.url);
    }
  }
  return next;
}
