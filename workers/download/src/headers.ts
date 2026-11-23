import { sanitizeZipName } from './zip';
import type { ResolvedFile } from './resolve';

const SAFE_MIME_RE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[^\r\n]{1,100})?$/;

function canonicalOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function applyCors(headers: Headers, request: Request, allowedOrigin?: string): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const normalized = canonicalOrigin(origin);
  const expected = canonicalOrigin(allowedOrigin);
  if (!normalized || !expected || normalized !== expected) return;
  headers.set('Access-Control-Allow-Origin', normalized);
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
  headers.set('Vary', 'Origin');
}

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function safeMime(mime: string | undefined): string {
  return mime && SAFE_MIME_RE.test(mime) ? mime : 'application/octet-stream';
}

export function preflight(request: Request, allowedOrigin?: string): Response {
  const headers = new Headers();
  applyCors(headers, request, allowedOrigin);
  headers.set('Access-Control-Max-Age', '600');
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(null, { status: 204, headers });
}

export function jsonError(status: number, code: string, request: Request, allowedOrigin?: string): Response {
  const headers = new Headers();
  applyCors(headers, request, allowedOrigin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(JSON.stringify({ error: code }), { status, headers });
}

export function downloadHeaders(
  request: Request,
  type: 'single' | 'zip',
  file?: ResolvedFile,
  allowedOrigin?: string
): Headers {
  const headers = new Headers();
  if (type === 'single') {
    const name = sanitizeZipName(file?.filename ?? 'download', 0, new Set<string>());
    headers.set('Content-Type', safeMime(file?.mime));
    headers.set('Content-Disposition', contentDisposition(name));
    if (file && Number.isSafeInteger(file.size_bytes) && file.size_bytes >= 0) {
      headers.set('Content-Length', String(file.size_bytes));
    }
  } else {
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', contentDisposition('download.zip'));
  }

  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  applyCors(headers, request, allowedOrigin);
  return headers;
}
