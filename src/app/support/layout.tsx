import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/storefront/site-header';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { SellerSidebar } from '@/components/seller/seller-sidebar';
import { AccountSidebar } from '@/components/buyer/account-sidebar';

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/support');

  if (user.accountType === 'staff') {
    return (
      <div className="flex min-h-[100dvh] bg-background">
        <AdminSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
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
        <>
          <SiteHeader />
          <div className="flex">
            <SellerSidebar email={user.email} displayName={seller.display_name} />
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        </>
      );
    }
  }

  return (
    <>
      <SiteHeader />
      <div className="flex">
        <AccountSidebar email={user.email} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </>
  );
}
