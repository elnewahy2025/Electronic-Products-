import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

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

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function cryptoRandomString(len: number): string {
  return require('node:crypto').randomBytes(len).toString('base64url').slice(0, len);
}