import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { AdminSidebar } from '@/components/admin/admin-sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.accountType !== 'staff') redirect('/login?next=/admin');
  if (!user.mfaEnabled) redirect('/verify-mfa');
  if (!user.role) redirect('/');

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
