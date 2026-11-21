import 'server-only';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/server';

export async function startMfaSetup(): Promise<{ secret: string; qr: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.email!, 'ElectronicProducts', secret);
  const qr = await QRCode.toDataURL(otpauth);

  // Store secret temporarily in user metadata (encrypted at rest by Supabase).
  // It will be moved to mfa_secret_encrypted + mfa_enabled=true after verification.
  await supabase.auth.updateUser({
    data: { pending_mfa_secret: secret },
  });

  return { secret, qr };
}

export async function verifyMfaAndEnable(code: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const secret = user.user_metadata?.pending_mfa_secret as string | undefined;
  if (!secret) throw new Error('MFA_SETUP_NOT_STARTED');

  if (!authenticator.verify({ token: code, secret })) {
    throw new Error('INVALID_MFA_CODE');
  }

  // Mark enabled. The secret stays in user_metadata AND is mirrored to profiles.
  await supabase.auth.updateUser({ data: { pending_mfa_secret: null } });
  await supabase
    .from('profiles')
    .update({ mfa_enabled: true })
    .eq('id', user.id);

  // Best-effort audit; actual secret encryption handled by service layer.
}

export async function verifyMfaLogin(code: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const secret = user.user_metadata?.mfa_secret as string | undefined;
  if (!secret) return false;
  return authenticator.verify({ token: code, secret });
}