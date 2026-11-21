import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type PermissionRow = {
  code: string;
  description: string | null;
  from_role: boolean;
  has_override: boolean;
  effective: boolean;
};

export type StaffDetail = {
  profile_id: string;
  email: string;
  full_name: string | null;
  account_type: 'staff' | 'buyer' | 'seller';
  status: 'active' | 'suspended' | 'deleted';
  role_code: 'super_admin' | 'admin' | 'staff' | null;
  role_name: string | null;
  member_status: 'active' | 'suspended' | 'revoked' | null;
  granted_at: string | null;
  is_self: boolean;
  permissions: PermissionRow[];
};

export type RoleOption = { code: string; name: string };

export async function listRoles(): Promise<RoleOption[]> {
  const db = await createClient();
  const { data } = await db
    .from('roles')
    .select('code, name')
    .order('code');
  return data ?? [];
}

export async function getStaffDetail(profileId: string): Promise<StaffDetail | null> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  // Profile
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, account_type, status')
    .eq('id', profileId)
    .maybeSingle();

  if (!profile) return null;

  // Membership + role
  const { data: membership } = await db
    .from('store_members')
    .select('status, granted_at, roles!inner(code, name)')
    .eq('profile_id', profileId)
    .maybeSingle();

  const roleCode = (membership?.roles as any)?.code ?? null;
  const roleName = (membership?.roles as any)?.name ?? null;

  // All permissions
  const { data: allPerms } = await db
    .from('permissions')
    .select('code, description')
    .order('code');

  // Role's permissions
  const rolePermSet = new Set<string>();
  if (roleCode) {
    const { data: rps } = await db
      .from('role_permissions')
      .select('permissions!inner(code), roles!inner(code)')
      .eq('roles.code', roleCode);
    rps?.forEach((rp: any) => {
      if (rp.permissions?.code) rolePermSet.add(rp.permissions.code);
    });
  }

  // Individual overrides (only active)
  const overrideSet = new Set<string>();
  {
    const { data: mps } = await db
      .from('member_permissions')
      .select('permissions!inner(code), expires_at')
      .eq('member_id', profileId);
    const now = Date.now();
    mps?.forEach((mp: any) => {
      if (!mp.expires_at || new Date(mp.expires_at).getTime() > now) {
        if (mp.permissions?.code) overrideSet.add(mp.permissions.code);
      }
    });
  }

  const permissions: PermissionRow[] = (allPerms ?? []).map((p: any) => ({
    code: p.code,
    description: p.description,
    from_role: rolePermSet.has(p.code),
    has_override: overrideSet.has(p.code),
    effective: rolePermSet.has(p.code) || overrideSet.has(p.code),
  }));

  return {
    profile_id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    account_type: profile.account_type,
    status: profile.status,
    role_code: roleCode,
    role_name: roleName,
    member_status: (membership?.status as any) ?? null,
    granted_at: membership?.granted_at ?? null,
    is_self: user.id === profileId,
    permissions,
  };
}