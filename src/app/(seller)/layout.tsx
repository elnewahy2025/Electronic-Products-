import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { SiteHeader } from '@/components/storefront/site-header';
import { SellerSidebar } from '@/components/seller/seller-sidebar';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/seller');
  if (user.accountType === 'staff') redirect('/admin');

  const db = await createClient();
  const { data: seller } = await db
    .from('seller_profiles')
    .select('status, display_name')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!seller) redirect('/register?as=seller');
  if (seller.status !== 'approved') redirect('/seller/pending');

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