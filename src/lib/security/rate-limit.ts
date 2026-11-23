import 'server-only';
import { isIP } from 'node:net';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function sanitizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.split(',')[0]?.trim();
  if (!candidate || candidate.length > 64) return null;
  // RFC-accurate IPv4 (0-255 octets) and IPv6 validation via node:net
  return isIP(candidate) !== 0 ? candidate : null;
}

/**
 * Extracts client IP from trusted edge headers.
 * - On Vercel (`VERCEL=1`), trusts ONLY `x-vercel-forwarded-for`, which Vercel's
 *   edge overwrites and clients cannot spoof.
 * - Outside Vercel (e.g. Cloudflare / local dev), checks `cf-connecting-ip`,
 *   `x-real-ip`, then `x-forwarded-for`.
 */
export function getTrustedClientIp(req: NextRequest | Request): string | null {
  if (process.env.VERCEL === '1') {
    return sanitizeIp(req.headers.get('x-vercel-forwarded-for'));
  }
  return (
    sanitizeIp(req.headers.get('cf-connecting-ip')) ??
    sanitizeIp(req.headers.get('x-real-ip')) ??
    sanitizeIp(req.headers.get('x-forwarded-for'))
  );
}

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Persistent PostgreSQL rate-limit check backed by `consume_rate_limit()` RPC.
 * Fails closed on DB error so rate limits cannot be bypassed by transient errors.
 */
export async function consumeRateLimit(params: {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
  ip?: string | null;
}): Promise<RateLimitDecision> {
  const admin = createAdminClient();
  const { data, error } = await (admin.rpc as any)('consume_rate_limit', {
    p_scope: params.scope,
    p_bucket_key: params.key,
    p_limit: params.limit,
    p_window_seconds: params.windowSeconds,
    p_ip: params.ip ?? null,
  });

  if (error) {
    console.error('[rate-limit] rpc failed', { scope: params.scope, code: error.code });
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    remaining: Number(row?.remaining ?? 0),
    retryAfterSeconds: Number(row?.retry_after_seconds ?? 60),
  };
}

/**
 * Reads `security_settings.login_rate_limit_per_hour` (clamped to sane bounds).
 */
export async function getLoginRateLimitPerHour(): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('security_settings')
    .select('login_rate_limit_per_hour')
    .eq('id', 1)
    .maybeSingle();

  const configured = Number(data?.login_rate_limit_per_hour ?? 20);
  if (!Number.isFinite(configured) || configured < 3) return 20;
  return Math.min(Math.floor(configured), 200);
}

/**
 * Reads `security_settings.code_rate_limit_per_hour` (used for recovery/code throttling).
 */
export async function getCodeRateLimitPerHour(): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('security_settings')
    .select('code_rate_limit_per_hour')
    .eq('id', 1)
    .maybeSingle();

  const configured = Number(data?.code_rate_limit_per_hour ?? 10);
  if (!Number.isFinite(configured) || configured < 3) return 10;
  return Math.min(Math.floor(configured), 100);
}

export async function logSecurityEvent(params: {
  type: string;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('security_events').insert({
      type: params.type,
      actor_id: params.actorId ?? null,
      ip: params.ip ?? null,
      user_agent: params.userAgent ? params.userAgent.slice(0, 500) : null,
      severity: params.severity ?? 'medium',
      details: (params.details ?? {}) as any,
    });
  } catch {
    // Non-fatal: never block response formatting on telemetry write failure
  }
}

export type ConcurrencyLease = {
  acquired: boolean;
  retryAfterSeconds: number;
  release: () => Promise<void>;
};

/**
 * Distributed PostgreSQL concurrency lock backed by `acquire_concurrency_lock()`
 * and `release_concurrency_lock()` RPCs. Works across all Vercel serverless instances
 * and auto-expires after `ttlSeconds` if a worker crashes.
 */
export async function acquireConcurrencyLock(
  key: string,
  ttlSeconds = 120,
): Promise<ConcurrencyLease> {
  const admin = createAdminClient();
  const { data, error } = await (admin.rpc as any)('acquire_concurrency_lock', {
    p_key: key,
    p_ttl_seconds: ttlSeconds,
  });

  if (error) {
    console.error('[concurrency-lock] acquire failed', { key, code: error.code });
    return { acquired: false, retryAfterSeconds: 10, release: async () => {} };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.acquired || !row?.owner_token) {
    return {
      acquired: false,
      retryAfterSeconds: Number(row?.retry_after_seconds ?? 10),
      release: async () => {},
    };
  }

  const ownerToken = String(row.owner_token);
  let released = false;
  return {
    acquired: true,
    retryAfterSeconds: 0,
    release: async () => {
      if (released) return;
      released = true;
      try {
        await (admin.rpc as any)('release_concurrency_lock', {
          p_key: key,
          p_owner_token: ownerToken,
        });
      } catch {
        // TTL will auto-expire if release fails
      }
    },
  };
}
