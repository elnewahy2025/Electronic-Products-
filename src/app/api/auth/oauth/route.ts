import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin } from '@/lib/security/origin';
import {
  consumeRateLimit,
  getLoginRateLimitPerHour,
  getTrustedClientIp,
  logSecurityEvent,
} from '@/lib/security/rate-limit';

const bodySchema = z.object({
  provider: z.literal('google'),
  next: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const ip = getTrustedClientIp(req);
  const userAgent = req.headers.get('user-agent');
  const perHourLimit = await getLoginRateLimitPerHour();

  if (ip) {
    const ipDecision = await consumeRateLimit({
      scope: 'auth:oauth:ip',
      key: ip,
      limit: perHourLimit,
      windowSeconds: 3600,
      ip,
    });
    if (!ipDecision.allowed) {
      await logSecurityEvent({
        type: 'oauth_rate_limited',
        ip,
        userAgent,
        severity: 'high',
        details: { provider: parsed.data.provider, limit_per_hour: perHourLimit },
      });
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح لمحاولات الدخول. يرجى المحاولة لاحقاً.' },
        { status: 429, headers: { 'Retry-After': String(ipDecision.retryAfterSeconds) } },
      );
    }
  }

  const rawNext = parsed.data.next ?? '/';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data.provider,
    options: {
      redirectTo: `${appOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.json({ error: 'تعذر بدء تسجيل الدخول عبر Google.' }, { status: 400 });
  }

  return NextResponse.json({ url: data.url });
}
