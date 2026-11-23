import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { AdminShell } from '@/components/admin/admin-shell';
import { SellerSidebar } from '@/components/seller/seller-sidebar';
import { AccountSidebar } from '@/components/buyer/account-sidebar';
import { SiteHeader } from '@/components/storefront/site-header';

export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/notifications');

  if (user.accountType === 'staff') {
    return <AdminShell email={user.email}>{children}</AdminShell>;
  }

  if (user.accountType === 'seller') {
    const db = await createClient();
    const { data: seller } = await db
      .from('seller_profiles')
      .select('display_name')
      .eq('profile_id', user.id)
      .maybeSingle();

    return (
      <div>
        <SiteHeader />
        <div className="flex min-h-[calc(100dvh-64px)] bg-background">
          <SellerSidebar email={user.email} displayName={seller?.display_name ?? user.email} />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SiteHeader />
      <div className="flex min-h-[calc(100dvh-64px)] bg-background">
        <AccountSidebar email={user.email} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
