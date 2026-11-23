import 'server-only';
import { constantTimeEqual } from '@/lib/crypto/constant-time';

/**
 * Cron endpoints are authenticated only by a server-side secret.
 * `x-vercel-cron` is spoofable by any caller and is never accepted here.
 */
export function isAuthorizedCron(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET || process.env.WORKER_SECRET;
  if (!secret) return false;

  const authorization = headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  return constantTimeEqual(token, secret);
}
