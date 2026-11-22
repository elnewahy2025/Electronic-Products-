import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getClientId(): string {
  const id = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED');
  return secret;
}

function getRedirectUri(): string {
  return (
    process.env.GOOGLE_DRIVE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL}/api/seller/drive/callback`
  );
}

export function buildDriveAuthUrl(statePayload: { sellerId: string }): {
  url: string;
  state: string;
} {
  const state = signState({
    sid: statePayload.sellerId,
    nonce: randomBytes(12).toString('base64url'),
    ts: Math.floor(Date.now() / 1000),
  });

  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: DRIVE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  };
}

export function verifyState(state: string): { sellerId: string } | null {
  const [encoded, sig] = state.split('.');
  if (!encoded || !sig) return null;
  const secret = process.env.CODE_HASH_PEPPER!;
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    // Reject states older than 10 minutes
    if (Date.now() / 1000 - data.ts > 600) return null;
    return { sellerId: data.sid };
  } catch {
    return null;
  }
}

function signState(payload: { sid: string; nonce: string; ts: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', process.env.CODE_HASH_PEPPER!)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export async function exchangeDriveCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  scope: string;
}> {
  const params = new URLSearchParams({
    code,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAUTH_EXCHANGE_FAILED: ${body}`);
  }

  const data = await res.json();
  if (!data.refresh_token) {
    throw new Error('NO_REFRESH_TOKEN — user must consent each time or revoke prior grant');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
  };
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('USERINFO_FAILED');
  const data = await res.json();
  if (!data.email) throw new Error('USERINFO_NO_EMAIL');
  return data.email;
}