import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from './session';
import { cache } from 'react';

/**
 * Fetch current user's permission codes (role + per-member overrides).
 * Cached per request.
 */
export const getMyPermissions = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser();
  if (!user || user.accountType !== 'staff') return new Set();

  const supabase = await createClient();

  const [{ data: rolePerms }, { data: memberPerms }] = await Promise.all([
    supabase
      .from('store_members')
      .select('role_permissions!inner(permissions!inner(code))')
      .eq('profile_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('member_permissions')
      .select('permissions!inner(code), expires_at')
      .eq('member_id', user.id),
  ]);

  const codes = new Set<string>();
  rolePerms?.forEach((rp: any) => codes.add(rp.role_permissions.permissions.code));
  memberPerms?.forEach((mp: any) => {
    if (!mp.expires_at || new Date(mp.expires_at) > new Date()) {
      codes.add(mp.permissions.code);
    }
  });

  return codes;
});

export async function can(permission: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const perms = await getMyPermissions();
  return perms.has(permission);
}

export async function requirePermission(permission: string): Promise<void> {
  if (!(await can(permission))) throw new Error('FORBIDDEN');
}