import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { cache } from 'react';

export type CurrentUser = {
  id: string;
  email: string;
  accountType: 'buyer' | 'seller' | 'staff';
  status: 'active' | 'suspended' | 'deleted';
  mfaEnabled: boolean;
  mfaEnforced: boolean;
  role: 'super_admin' | 'admin' | 'staff' | null;
};

/**
 * Cached per-request. Use in Server Components and Server Actions.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, account_type, status, mfa_enabled, mfa_enforced')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  let role: CurrentUser['role'] = null;
  if (profile.account_type === 'staff') {
    const { data: m } = await supabase
      .from('store_members')
      .select('roles!inner(code)')
      .eq('profile_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    role = (m?.roles as unknown as { code: string } | null)?.code as CurrentUser['role'] ?? null;
  }

  return {
    id: profile.id,
    email: profile.email,
    accountType: profile.account_type as CurrentUser['accountType'],
    status: profile.status as CurrentUser['status'],
    mfaEnabled: profile.mfa_enabled,
    mfaEnforced: profile.mfa_enforced,
    role,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  if (user.status !== 'active') throw new Error('INACTIVE_USER');
  return user;
}