import { createHash } from 'node:crypto';
import { adminDb } from './db';

const BASE = process.env.TEST_APP_URL ?? 'http://localhost:3000';

export async function apiRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  cookieHeader?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; headers: Headers; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(extraHeaders ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }

  return { status: res.status, headers: res.headers, json };
}

/** Claims a token exactly as the internal resolver does. */
export async function claimDownloadToken(token: string): Promise<void> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { error } = await adminDb.rpc('claim_download_token', { p_token_hash: tokenHash });
  if (error) throw new Error(error.message);
}

/**
 * Stands in for the first-party streaming worker in application E2E tests.
 * Real byte streaming is covered by workers/download tests; this helper only
 * drives the app's internal completion contract with the same single-use token
 * ledger and internal secret the worker uses.
 */
export async function completeDownloadAsWorker(
  sessionId: string,
  token: string,
  files: Array<{ file_version_id: string; bytes_sent: number; checksum: string }>,
): Promise<{ status: number; json: any }> {
  await claimDownloadToken(token);

  const secret = process.env.DOWNLOAD_SERVICE_TOKEN;
  if (!secret) throw new Error('Missing DOWNLOAD_SERVICE_TOKEN in .env.test');

  const res = await apiRequest(
    'POST',
    `/api/download/${sessionId}/complete`,
    { token, files },
    undefined,
    { 'x-internal-secret': secret }
  );
  return { status: res.status, json: res.json };
}
