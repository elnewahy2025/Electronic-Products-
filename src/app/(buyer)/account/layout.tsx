import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { AccountSidebar } from '@/components/buyer/account-sidebar';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account');
  if (user.accountType === 'seller') redirect('/seller');
  if (user.accountType === 'staff') redirect('/admin');

  return (
    <div className="flex">
      <AccountSidebar email={user.email} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
