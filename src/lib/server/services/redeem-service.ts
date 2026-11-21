import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashCode } from '@/lib/crypto/code-generator';

export type RedeemResult =
  | { ok: true; sessionId: string }
  | { ok: false; code: string; message: string; status: number; retryAfter?: number };

const ERROR_MESSAGES: Record<string, { message: string; status: number }> = {
  UNAUTHENTICATED: { message: 'يجب تسجيل الدخول لتفعيل الكود.', status: 401 },
  INVALID_BODY: { message: 'بيانات غير صالحة.', status: 400 },
  INVALID_CODE_FORMAT: { message: 'صيغة الكود غير صحيحة.', status: 400 },
  not_found: { message: 'الكود غير صحيح. تحقق من الأحرف وحاول مجددًا.', status: 404 },
  code_not_found: { message: 'الكود غير صحيح.', status: 404 },
  code_revoked: { message: 'هذا الكود ملغى.', status: 400 },
  code_expired: { message: 'انتهت صلاحية هذا الكود (72 ساعة).', status: 400 },
  code_already_redeemed: { message: 'هذا الكود مُفعّل من قبل.', status: 400 },
  code_not_delivered: { message: 'لم يؤكد النظام تسليم هذا الكود بعد. تواصل مع الإدارة.', status: 400 },
  not_owner: { message: 'هذا الكود غير مسجّل لبريدك. إذا اشتريت ببريد آخر، سجّل دخولك به.', status: 403 },
  user_rate_limited: { message: 'تجاوزت الحد المسموح من المحاولات. حاول بعد قليل.', status: 429 },
  ip_rate_limited: { message: 'تجاوزت الحد المسموح. حاول لاحقًا.', status: 429 },
};

function getClientIp(req: Request): string | undefined {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (fwd) return fwd;
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return undefined;
}

export async function redeemCode(
  rawCode: string,
  req: Request
): Promise<RedeemResult> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      message: ERROR_MESSAGES.UNAUTHENTICATED.message,
      status: 401,
    };
  }

  const ip = getClientIp(req) ?? null;
  const email = user.email?.toLowerCase() ?? null;
  const admin = createAdminClient();

  // ── 1. Rate limit check ──────────────────────────────────
  const { data: rlRaw } = await admin.rpc('check_redeem_rate_limit', {
    p_ip: ip,
    p_user_id: user.id,
  });
  const rl = Array.isArray(rlRaw) ? rlRaw[0] : rlRaw;

  if (!rl?.allowed) {
    // Log the rejection (does not count toward rate limit itself)
    await admin.rpc('log_redeem_attempt', {
      p_ip: ip,
      p_user_id: user.id,
      p_email: email,
      p_result: 'rate_limited',
      p_code_hash_prefix: null,
      p_reason: rl?.reason ?? null,
    });
    const m = ERROR_MESSAGES[rl?.reason ?? 'user_rate_limited'] ?? ERROR_MESSAGES.user_rate_limited;
    return {
      ok: false,
      code: rl?.reason ?? 'user_rate_limited',
      message: m.message,
      status: m.status,
      retryAfter: rl?.retry_after_seconds ?? 60,
    };
  }

  // ── 2. Normalize input ────────────────────────────────────
  const normalized = rawCode.trim().toUpperCase().replace(/\s+/g, '');
  // Accept with or without hyphens; if not hyphenated, re-insert
  const formatted = normalized.includes('-')
    ? normalized
    : normalized.replace(/^(.{4})(.{4})(.{4})(.{4})$/, '$1-$2-$3-$4');

  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(formatted)) {
    return {
      ok: false,
      code: 'INVALID_CODE_FORMAT',
      message: ERROR_MESSAGES.INVALID_CODE_FORMAT.message,
      status: 400,
    };
  }

  const hash = hashCode(formatted);
  const prefix = hash.slice(0, 8);

  // ── 3. Lookup by hash (admin client → bypasses RLS) ──────
  const { data: code } = await admin
    .from('purchase_codes')
    .select('id, status, expires_at, delivered_at, redeemed_at')
    .eq('code_hash', hash)
    .maybeSingle();

  if (!code) {
    await admin.rpc('log_redeem_attempt', {
      p_ip: ip,
      p_user_id: user.id,
      p_email: email,
      p_result: 'not_found',
      p_code_hash_prefix: prefix,
      p_reason: null,
    });
    return {
      ok: false,
      code: 'not_found',
      message: ERROR_MESSAGES.not_found.message,
      status: 404,
    };
  }

  // ── 4. Pre-checks (for clean UX, RPC re-verifies) ────────
  if (code.status === 'revoked') {
    await admin.rpc('log_redeem_attempt', {
      p_ip: ip, p_user_id: user.id, p_email: email,
      p_result: 'revoked', p_code_hash_prefix: prefix, p_reason: null,
    });
    return {
      ok: false,
      code: 'code_revoked',
      message: ERROR_MESSAGES.code_revoked.message,
      status: 400,
    };
  }

  if (code.redeemed_at) {
    await admin.rpc('log_redeem_attempt', {
      p_ip: ip, p_user_id: user.id, p_email: email,
      p_result: 'already_redeemed', p_code_hash_prefix: prefix, p_reason: null,
    });
    return {
      ok: false,
      code: 'code_already_redeemed',
      message: ERROR_MESSAGES.code_already_redeemed.message,
      status: 400,
    };
  }

  if (new Date(code.expires_at).getTime() < Date.now()) {
    await admin.rpc('log_redeem_attempt', {
      p_ip: ip, p_user_id: user.id, p_email: email,
      p_result: 'expired', p_code_hash_prefix: prefix, p_reason: null,
    });
    return {
      ok: false,
      code: 'code_expired',
      message: ERROR_MESSAGES.code_expired.message,
      status: 400,
    };
  }

  if (code.status === 'issued' && !code.delivered_at) {
    await admin.rpc('log_redeem_attempt', {
      p_ip: ip, p_user_id: user.id, p_email: email,
      p_result: 'not_delivered', p_code_hash_prefix: prefix, p_reason: null,
    });
    return {
      ok: false,
      code: 'code_not_delivered',
      message: ERROR_MESSAGES.code_not_delivered.message,
      status: 400,
    };
  }

  // ── 5. Ownership check ───────────────────────────────────
  const { data: owns } = await db.rpc('buyer_owns_code', { p_code_id: code.id });
  if (!owns) {
    await admin.rpc('log_redeem_attempt', {
      p_ip: ip, p_user_id: user.id, p_email: email,
      p_result: 'forbidden', p_code_hash_prefix: prefix, p_reason: 'not_owner',
    });
    return {
      ok: false,
      code: 'not_owner',
      message: ERROR_MESSAGES.not_owner.message,
      status: 403,
    };
  }

  // ── 6. Atomic redeem (RPC re-verifies everything) ────────
  const { data: sessionId, error } = await db.rpc('redeem_code', {
    p_code_id: code.id,
  });

  if (error) {
    const raw = error.message ?? '';
    const key = Object.keys(ERROR_MESSAGES).find(k => raw.includes(k));
    const m = key ? ERROR_MESSAGES[key] : { message: 'تعذر تفعيل الكود. حاول مجددًا.', status: 400 };

    await admin.rpc('log_redeem_attempt', {
      p_ip: ip, p_user_id: user.id, p_email: email,
      p_result: key ?? 'error', p_code_hash_prefix: prefix, p_reason: raw.slice(0, 200),
    });

    return { ok: false, code: key ?? 'error', message: m.message, status: m.status };
  }

  // ── 7. Log success ────────────────────────────────────────
  await admin.rpc('log_redeem_attempt', {
    p_ip: ip, p_user_id: user.id, p_email: email,
    p_result: 'success', p_code_hash_prefix: prefix, p_reason: null,
  });

  return { ok: true, sessionId: sessionId as string };
}