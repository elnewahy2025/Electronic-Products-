/**
 * Signed, per-login MFA satisfaction marker.
 *
 * Supabase's own session cookie only proves "password/OAuth succeeded"
 * (aal1). This token is issued by the server only after a valid TOTP code
 * and is bound to that Supabase session_id, so a cookie from an earlier
 * login cannot satisfy a later one.
 *
 * This module intentionally has no `server-only` import: it is used by
 * both Next API routes (Node runtime) and the root middleware (edge
 * runtime), so it only uses Web Crypto / Web APIs.
 */

export const MFA_COOKIE = 'mfa_session';
const MAX_AGE_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type MfaSessionPayload = {
  v: 1;
  sub: string;
  sid: string;
  exp: number;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPadding);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function signingKey(): Promise<CryptoKey> {
  // Derive a dedicated key; ENCRYPTION_KEY is also used for AES-GCM.
  const material = process.env.ENCRYPTION_KEY;
  if (!material) throw new Error('ENCRYPTION_KEY not set');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`electronic-products:mfa-session:${material}`)
  );
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function createMfaSessionToken(sub: string, sid: string): Promise<string> {
  const payload: MfaSessionPayload = {
    v: 1,
    sub,
    sid,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function readMfaSessionToken(
  value: string | null | undefined
): Promise<MfaSessionPayload | null> {
  if (!value) return null;
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      new Uint8Array(fromBase64Url(signature)),
      encoder.encode(body)
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as MfaSessionPayload;
    if (payload.v !== 1 || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      return null;
    }
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Extract the Supabase session_id claim from an already-verified access token. */
export function sessionIdFromJwt(accessToken: string): string | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(parts[1]))) as {
      session_id?: string;
    };
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}

export function mfaCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}

export function clearMfaCookieOptions() {
  return { path: '/', maxAge: 0 };
}
