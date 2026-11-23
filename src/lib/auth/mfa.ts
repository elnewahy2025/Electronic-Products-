import 'server-only';
import { cookies } from 'next/headers';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt, encrypt } from '@/lib/crypto/encryption';
import { logAudit } from '@/lib/audit/logger';
import {
  MFA_COOKIE,
  createMfaSessionToken,
  readMfaSessionToken,
  sessionIdFromJwt,
} from './mfa-session';

const ENROLLMENT_TTL_SECONDS = 10 * 60;
const MAX_FAILURES = 5;
const LOCKOUT_SECONDS = 15 * 60;

export type MfaStatus = {
  required: boolean;
  enrolled: boolean;
  satisfied: boolean;
};

type MfaContext = {
  userId: string;
  email: string;
  sessionId: string | null;
  required: boolean;
  enrolled: boolean;
  satisfied: boolean;
};

async function getContext(): Promise<MfaContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_type, mfa_enabled, mfa_enforced')
    .eq('id', user.id)
    .single();

  const required = Boolean(
    profile?.mfa_enforced || profile?.mfa_enabled || profile?.account_type === 'staff'
  );

  // The secret column must never be exposed to a client role. Read it with
  // the service-role client only (RLS is bypassed there).
  const admin = createAdminClient();
  const { data: secureProfile } = await admin
    .from('profiles')
    .select('mfa_secret_encrypted')
    .eq('id', user.id)
    .maybeSingle();
  const enrolled = Boolean(secureProfile?.mfa_secret_encrypted);

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionId = sessionIdFromJwt(sessionData.session?.access_token ?? '');

  const cookieStore = await cookies();
  const token = await readMfaSessionToken(cookieStore.get(MFA_COOKIE)?.value);
  const satisfied = Boolean(
    required && sessionId && token && token.sub === user.id && token.sid === sessionId
  );

  return {
    userId: user.id,
    email: user.email ?? '',
    sessionId,
    required,
    enrolled,
    satisfied,
  };
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const ctx = await getContext();
  return { required: ctx.required, enrolled: ctx.enrolled, satisfied: ctx.satisfied };
}

async function scrubLegacyMetadata(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  const metadata = { ...(data.user?.user_metadata ?? {}) };
  if (!('pending_mfa_secret' in metadata) && !('mfa_secret' in metadata)) return;
  delete metadata.pending_mfa_secret;
  delete metadata.mfa_secret;
  await admin.auth.admin.updateUserById(userId, { user_metadata: metadata });
}

async function assertNotLocked(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('mfa_attempts')
    .select('locked_until')
    .eq('profile_id', userId)
    .maybeSingle();
  if (data?.locked_until && new Date(data.locked_until).getTime() > Date.now()) {
    throw new Error('MFA_TOO_MANY_ATTEMPTS');
  }
}

async function recordFailure(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('mfa_attempts')
    .select('failed_count, first_failed_at')
    .eq('profile_id', userId)
    .maybeSingle();

  const now = Date.now();
  const first = data?.first_failed_at ? new Date(data.first_failed_at).getTime() : now;
  const windowExpired = now - first > LOCKOUT_SECONDS * 1000;
  const failedCount = windowExpired ? 1 : (data?.failed_count ?? 0) + 1;
  const lockedUntil =
    failedCount >= MAX_FAILURES ? new Date(now + LOCKOUT_SECONDS * 1000).toISOString() : null;

  await admin.from('mfa_attempts').upsert({
    profile_id: userId,
    failed_count: failedCount,
    first_failed_at: windowExpired ? new Date(now).toISOString() : (data?.first_failed_at ?? new Date(now).toISOString()),
    locked_until: lockedUntil,
  });
}

async function clearFailures(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from('mfa_attempts').delete().eq('profile_id', userId);
}

export async function startMfaSetup(): Promise<{ secret: string; qr: string }> {
  const ctx = await getContext();
  if (ctx.enrolled) throw new Error('MFA_ALREADY_ENROLLED');

  // Remove the legacy plaintext secret from an older, broken enrollment.
  await scrubLegacyMetadata(ctx.userId);

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(ctx.email || ctx.userId, 'ElectronicProducts', secret);
  const qr = await QRCode.toDataURL(otpauth);

  const admin = createAdminClient();
  const { error } = await admin.from('mfa_enrollments').upsert({
    profile_id: ctx.userId,
    secret_encrypted: encrypt(secret),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ENROLLMENT_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error('MFA_SETUP_FAILED');

  await logAudit({
    action: 'auth.mfa.enrollment_started',
    entityType: 'profiles',
    entityId: ctx.userId,
  });

  return { secret, qr };
}

export async function verifyMfaAndEnable(code: string): Promise<string> {
  const ctx = await getContext();
  if (ctx.enrolled) throw new Error('MFA_ALREADY_ENROLLED');
  if (!ctx.sessionId) throw new Error('MFA_NO_SESSION');

  await assertNotLocked(ctx.userId);

  const admin = createAdminClient();
  const { data: enrollment } = await admin
    .from('mfa_enrollments')
    .select('secret_encrypted, expires_at')
    .eq('profile_id', ctx.userId)
    .maybeSingle();
  if (!enrollment) throw new Error('MFA_SETUP_NOT_STARTED');
  if (new Date(enrollment.expires_at).getTime() <= Date.now()) {
    throw new Error('MFA_SETUP_EXPIRED');
  }

  let secret: string;
  try {
    secret = decrypt(enrollment.secret_encrypted);
  } catch {
    throw new Error('MFA_SETUP_INVALID');
  }

  if (!authenticator.verify({ token: code, secret })) {
    await recordFailure(ctx.userId);
    throw new Error('INVALID_MFA_CODE');
  }

  // Service role is required: migration 042 protects both fields from
  // self-service writes.
  const { error } = await admin
    .from('profiles')
    .update({ mfa_secret_encrypted: enrollment.secret_encrypted, mfa_enabled: true })
    .eq('id', ctx.userId);
  if (error) throw new Error('MFA_ENABLE_FAILED');

  await admin.from('mfa_enrollments').delete().eq('profile_id', ctx.userId);
  await clearFailures(ctx.userId);
  await logAudit({
    action: 'auth.mfa.enabled',
    entityType: 'profiles',
    entityId: ctx.userId,
  });

  return createMfaSessionToken(ctx.userId, ctx.sessionId);
}

export async function verifyMfaLogin(code: string): Promise<string> {
  const ctx = await getContext();
  if (!ctx.required) throw new Error('MFA_NOT_REQUIRED');
  if (!ctx.enrolled) throw new Error('MFA_NOT_ENROLLED');
  if (!ctx.sessionId) throw new Error('MFA_NO_SESSION');

  await assertNotLocked(ctx.userId);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('mfa_secret_encrypted')
    .eq('id', ctx.userId)
    .maybeSingle();
  if (!profile?.mfa_secret_encrypted) throw new Error('MFA_NOT_ENROLLED');

  let secret: string;
  try {
    secret = decrypt(profile.mfa_secret_encrypted);
  } catch {
    throw new Error('MFA_SETUP_INVALID');
  }

  if (!authenticator.verify({ token: code, secret })) {
    await recordFailure(ctx.userId);
    await logAudit({
      action: 'auth.mfa.challenge_failed',
      entityType: 'profiles',
      entityId: ctx.userId,
    });
    throw new Error('INVALID_MFA_CODE');
  }

  await clearFailures(ctx.userId);
  await logAudit({
    action: 'auth.mfa.challenge_success',
    entityType: 'profiles',
    entityId: ctx.userId,
  });

  return createMfaSessionToken(ctx.userId, ctx.sessionId);
}
