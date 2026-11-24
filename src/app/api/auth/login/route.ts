import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSameOrigin } from '@/lib/security/origin';
import {
  consumeRateLimit,
  getLoginRateLimitPerHour,
  getTrustedClientIp,
  logSecurityEvent,
} from '@/lib/security/rate-limit';
import { MFA_COOKIE, clearMfaCookieOptions } from '@/lib/auth/mfa-session';

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
  captchaToken: z.string().min(1).max(2048).optional(),
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
    return NextResponse.json({ error: 'بيانات الدخول غير صالحة.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const emailHash = hashIdentifier(email);
  const ip = getTrustedClientIp(req);
  const userAgent = req.headers.get('user-agent');
  const perHourLimit = await getLoginRateLimitPerHour();

  // Enforce BOTH per-email and per-IP hourly limits from `security_settings`
  const emailLimit = await consumeRateLimit({
    scope: 'auth:login:email',
    key: emailHash,
    limit: perHourLimit,
    windowSeconds: 3600,
    ip,
  });

  if (!emailLimit.allowed) {
    await logSecurityEvent({
      type: 'login_rate_limited',
      ip,
      userAgent,
      severity: 'high',
      details: { bucket: 'email', email_hash: emailHash, limit_per_hour: perHourLimit },
    });
    return NextResponse.json(
      { error: 'تم تجاوز الحد المسموح لمحاولات تسجيل الدخول. يرجى المحاولة لاحقاً.' },
      { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfterSeconds) } },
    );
  }

  if (ip) {
    const ipLimit = await consumeRateLimit({
      scope: 'auth:login:ip',
      key: ip,
      limit: perHourLimit * 2,
      windowSeconds: 3600,
      ip,
    });
    if (!ipLimit.allowed) {
      await logSecurityEvent({
        type: 'login_rate_limited',
        ip,
        userAgent,
        severity: 'high',
        details: { bucket: 'ip', email_hash: emailHash, limit_per_hour: perHourLimit * 2 },
      });
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح لمحاولات تسجيل الدخول. يرجى المحاولة لاحقاً.' },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } },
      );
    }
  }

  const supabase = await createClient();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
    ...(parsed.data.captchaToken ? { options: { captchaToken: parsed.data.captchaToken } } : {}),
  });

  if (signInError || !data.user) {
    await logSecurityEvent({
      type: 'login_failed',
      ip,
      userAgent,
      severity: 'low',
      details: { email_hash: emailHash, reason: signInError?.code ?? 'invalid_credentials' },
    });
    return NextResponse.json({ error: 'بيانات الدخول غير صحيحة.' }, { status: 401 });
  }

  // Check whether MFA is required for this account
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('account_type, status, mfa_enabled, mfa_enforced')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut({ scope: 'local' });
    return NextResponse.json({ error: 'تم إيقاف الحساب.' }, { status: 403 });
  }

  const mfaRequired = Boolean(
    profile.mfa_enforced || profile.mfa_enabled || profile.account_type === 'staff',
  );

  // Drop any stale MFA cookie from a previous session
  const res = NextResponse.json({ ok: true, mfaRequired });
  res.cookies.set(MFA_COOKIE, '', clearMfaCookieOptions());
  return res;
}
