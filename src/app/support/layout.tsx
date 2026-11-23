import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/storefront/site-header';
import { AdminShell } from '@/components/admin/admin-shell';
import { SellerSidebar } from '@/components/seller/seller-sidebar';
import { AccountSidebar } from '@/components/buyer/account-sidebar';

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/support');

  if (user.accountType === 'staff') {
    return <AdminShell email={user.email}>{children}</AdminShell>;
  }

  if (user.accountType === 'seller') {
    const db = await createClient();
    const { data: seller } = await db
      .from('seller_profiles')
      .select('status, display_name')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (seller?.status === 'approved') {
      return (
        <div>
          <SiteHeader />
          <div className="flex">
            <SellerSidebar email={user.email} displayName={seller.display_name} />
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        </div>
      );
    }
  }

  return (
    <div>
      <SiteHeader />
      <div className="flex">
        <AccountSidebar email={user.email} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
