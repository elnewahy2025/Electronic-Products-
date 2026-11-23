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

  // `store_members` → `role_permissions` is only related through `roles`, so
  // ask PostgREST for the membership's role_id, then walk role_permissions
  // from that table directly. The previous nested join could not be inferred
  // and silently yielded no permissions.
  const { data: membership } = await supabase
    .from('store_members')
    .select('role_id')
    .eq('profile_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  const [{ data: rolePerms }, { data: memberPerms }] = await Promise.all([
    membership?.role_id
      ? supabase
          .from('role_permissions')
          .select('permissions!inner(code)')
          .eq('role_id', membership.role_id)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from('member_permissions')
      .select('permissions!inner(code), expires_at')
      .eq('member_id', user.id),
  ]);

  const codes = new Set<string>();
  rolePerms?.forEach((rp: any) => codes.add(rp.permissions.code));
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