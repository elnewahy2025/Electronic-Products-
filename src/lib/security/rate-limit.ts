import 'server-only';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

function sanitizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.split(',')[0]?.trim();
  if (!candidate || candidate.length > 64) return null;
  if (IPV4_RE.test(candidate) || (candidate.includes(':') && IPV6_RE.test(candidate))) {
    return candidate;
  }
  return null;
}

/**
 * Extracts client IP preferring platform-injected headers that cannot be
 * spoofed behind Vercel / Cloudflare edges before falling back to XFF.
 */
export function getTrustedClientIp(req: NextRequest | Request): string | null {
  return (
    sanitizeIp(req.headers.get('x-vercel-forwarded-for')) ??
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

// Per-instance concurrency guard to prevent parallel expensive job storms
const activeSlots = new Map<string, number>();

export function acquireConcurrencySlot(key: string, maxConcurrent = 1): (() => void) | null {
  const current = activeSlots.get(key) ?? 0;
  if (current >= maxConcurrent) return null;
  activeSlots.set(key, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (activeSlots.get(key) ?? 1) - 1;
    if (next <= 0) activeSlots.delete(key);
    else activeSlots.set(key, next);
  };
}
