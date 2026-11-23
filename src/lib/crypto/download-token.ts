import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type DownloadTokenPayload = {
  sid: string;                 // session_id
  fid?: string;                // file_version_id (for single)
  typ: 'single' | 'zip';
  exp: number;                 // unix seconds
  n: string;                   // nonce
};

function getSecret(): string {
  const s = process.env.DOWNLOAD_SERVICE_TOKEN;
  if (!s) throw new Error('DOWNLOAD_SERVICE_TOKEN not set');
  return s;
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url');
}

export function createDownloadToken(payload: Omit<DownloadTokenPayload, 'n' | 'exp'> & { ttlSec?: number }): string {
  const full: DownloadTokenPayload = {
    ...payload,
    n: cryptoRandomString(12),
    exp: Math.floor(Date.now() / 1000) + (payload.ttlSec ?? 15 * 60),
  };
  // strip ttlSec if present
  const { ttlSec: _t, ...clean } = full as DownloadTokenPayload & { ttlSec?: number };
  const encoded = Buffer.from(JSON.stringify(clean)).toString('base64url');
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expected = sign(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: DownloadTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (typeof payload.n !== 'string' || payload.n.length < 8) return null;
  if (!isUuid(payload.sid)) return null;
  if (payload.typ !== 'single' && payload.typ !== 'zip') return null;
  if (payload.typ === 'single' && !payload.fid) return null;
  if (payload.fid !== undefined && !isUuid(payload.fid)) return null;
  return payload;
}

/** Stable hash used by the single-use download_tokens ledger. */
export function hashDownloadToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cryptoRandomString(len: number): string {
  return require('node:crypto').randomBytes(len).toString('base64url').slice(0, len);
}