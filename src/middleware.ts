// Next.js loads middleware from `src` in this app. The root module owns the
// session guards and the rest of the CSP; this wrapper corrects one source
// expression without duplicating any of that behavior.
import type { NextRequest } from 'next/server';
import { middleware as rootMiddleware, config } from '../middleware';

export { config };

function downloadSources(): { origin: string; legacy: string } | null {
  const configured = process.env.DOWNLOAD_SERVICE_URL;
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    return { origin: parsed.origin, legacy: `https://${parsed.host}` };
  } catch {
    return null;
  }
}

function patchConnectSrc(csp: string, origin: string, legacy: string): string {
  return csp.replace(/connect-src ([^;]*)/, (_match: string, sources: string) => {
    const corrected = sources.split(legacy).join(origin);
    if (corrected.split(/\s+/).includes(origin)) return `connect-src ${corrected}`;
    return `connect-src ${corrected} ${origin}`;
  });
}

function sentryOrigin(): string | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    const parsed = new URL(dsn);
    return parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

function appendConnectSrc(csp: string, origin: string): string {
  return csp.replace(/connect-src ([^;]*)/, (_match: string, sources: string) => {
    if (sources.split(/\s+/).includes(origin)) return `connect-src ${sources}`;
    return `connect-src ${sources} ${origin}`;
  });
}

export async function middleware(request: NextRequest) {
  const response = await rootMiddleware(request);
  const csp = response.headers.get('content-security-policy');
  if (!csp) return response;

  let patched = csp;
  const sources = downloadSources();
  if (sources) {
    patched = patchConnectSrc(patched, sources.origin, sources.legacy);
  }
  const sentry = sentryOrigin();
  if (sentry) {
    patched = appendConnectSrc(patched, sentry);
  }

  if (patched !== csp) response.headers.set('content-security-policy', patched);
  return response;
}
