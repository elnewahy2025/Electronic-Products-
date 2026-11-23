import 'server-only';
import { getCurrentUser } from './session';
import { can } from './permissions';

export async function requireAdmin(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.status !== 'active' || user.accountType !== 'staff') throw new Error('FORBIDDEN');
  if (!user.role) throw new Error('FORBIDDEN');
}

export async function requireSuperAdmin(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.status !== 'active' || user.role !== 'super_admin') throw new Error('FORBIDDEN');
}

export async function requirePerm(permission: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  if (user.status !== 'active') throw new Error('FORBIDDEN');
  if (user.role === 'super_admin') return;
  if (!(await can(permission))) throw new Error('FORBIDDEN');
}