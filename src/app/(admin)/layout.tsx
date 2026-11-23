import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { AdminShell } from '@/components/admin/admin-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.accountType !== 'staff') redirect('/login?next=/admin');
  if (!user.mfaEnabled) redirect('/verify-mfa');
  if (!user.role) redirect('/');

  return <AdminShell email={user.email}>{children}</AdminShell>;
}
