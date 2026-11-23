import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import {
  consumeRateLimit,
  getTrustedClientIp,
  logSecurityEvent,
} from '@/lib/security/rate-limit';

export async function enforceSellerThrottle(params: {
  req: NextRequest;
  sellerId: string;
  scope: string;
  sellerLimit: number;
  ipLimit: number;
  windowSeconds: number;
}): Promise<NextResponse | null> {
  const ip = getTrustedClientIp(params.req);
  const userAgent = params.req.headers.get('user-agent');

  const sellerDecision = await consumeRateLimit({
    scope: `${params.scope}:seller`,
    key: params.sellerId,
    limit: params.sellerLimit,
    windowSeconds: params.windowSeconds,
    ip,
  });

  if (!sellerDecision.allowed) {
    await logSecurityEvent({
      type: 'seller_endpoint_rate_limited',
      actorId: params.sellerId,
      ip,
      userAgent,
      severity: 'medium',
      details: {
        scope: params.scope,
        bucket: 'seller',
        limit: params.sellerLimit,
        window_seconds: params.windowSeconds,
      },
    });
    return NextResponse.json(
      { error: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(sellerDecision.retryAfterSeconds) } },
    );
  }

  if (ip) {
    const ipDecision = await consumeRateLimit({
      scope: `${params.scope}:ip`,
      key: ip,
      limit: params.ipLimit,
      windowSeconds: params.windowSeconds,
      ip,
    });
    if (!ipDecision.allowed) {
      await logSecurityEvent({
        type: 'seller_endpoint_rate_limited',
        actorId: params.sellerId,
        ip,
        userAgent,
        severity: 'medium',
        details: {
          scope: params.scope,
          bucket: 'ip',
          limit: params.ipLimit,
          window_seconds: params.windowSeconds,
        },
      });
      return NextResponse.json(
        { error: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(ipDecision.retryAfterSeconds) } },
      );
    }
  }

  return null;
}
