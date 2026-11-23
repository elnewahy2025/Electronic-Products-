import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin } from '@/lib/security/origin';
import {
  consumeRateLimit,
  getCodeRateLimitPerHour,
  getTrustedClientIp,
  logSecurityEvent,
} from '@/lib/security/rate-limit';

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
});

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 16);
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'البريد الإلكتروني غير صالح.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const emailHash = hashIdentifier(email);
  const ip = getTrustedClientIp(req);
  const userAgent = req.headers.get('user-agent');
  const codePerHour = await getCodeRateLimitPerHour();
  const resetEmailLimit = codePerHour;
  const resetIpLimit = codePerHour * 2;

  const emailDecision = await consumeRateLimit({
    scope: 'auth:forgot_password:email',
    key: emailHash,
    limit: resetEmailLimit,
    windowSeconds: 3600,
    ip,
  });

  if (!emailDecision.allowed) {
    await logSecurityEvent({
      type: 'password_reset_rate_limited',
      ip,
      userAgent,
      severity: 'medium',
      details: { bucket: 'email', email_hash: emailHash, limit_per_hour: resetEmailLimit },
    });
    return NextResponse.json(
      { error: 'تم تجاوز الحد المسموح لطلبات استعادة كلمة المرور. يرجى المحاولة لاحقاً.' },
      { status: 429, headers: { 'Retry-After': String(emailDecision.retryAfterSeconds) } },
    );
  }

  if (ip) {
    const ipDecision = await consumeRateLimit({
      scope: 'auth:forgot_password:ip',
      key: ip,
      limit: resetIpLimit,
      windowSeconds: 3600,
      ip,
    });
    if (!ipDecision.allowed) {
      await logSecurityEvent({
        type: 'password_reset_rate_limited',
        ip,
        userAgent,
        severity: 'medium',
        details: { bucket: 'ip', email_hash: emailHash, limit_per_hour: resetIpLimit },
      });
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح لطلبات استعادة كلمة المرور. يرجى المحاولة لاحقاً.' },
        { status: 429, headers: { 'Retry-After': String(ipDecision.retryAfterSeconds) } },
      );
    }
  }

  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
  const supabase = await createClient();
  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appOrigin}/auth/callback?next=/reset-password`,
  });

  if (resetErr) {
    // Log internally but return enumeration-safe 200 OK
    console.warn('[auth] password reset error', { code: resetErr.code ?? 'reset_error' });
  }

  return NextResponse.json({ ok: true });
}
