import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { SellerSidebar } from '@/components/seller/seller-sidebar';
import { BrandLogo } from '@/components/shared/brand-logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { LogoutButton } from '@/components/shared/logout-button';
import { NotificationBell } from '@/components/shared/notification-bell';

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
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="bg-brand text-brand-foreground sticky top-0 z-30 border-b border-white/10">
        <div className="container h-[58px] flex items-center gap-4">
          <BrandLogo href="/seller" subtitle="لوحة البائع" inverted />
          <div className="flex-1" />
          <Link
            href="/"
            className="hidden sm:inline-block text-xs text-[#9ccbbd] hover:text-white transition-colors"
          >
            المتجر
          </Link>
          <span className="hidden md:inline-block text-sm text-[#b4d3c8] font-medium">
            {seller.display_name}
          </span>
          <NotificationBell />
          <ThemeToggle className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white" />
          <LogoutButton
            variant="header"
            redirectTo="/"
            className="text-[#e8f5f0] hover:text-white hover:bg-white/10"
          />
        </div>
      </header>

      <div className="container flex flex-1 gap-6 py-6">
        <SellerSidebar email={user.email} displayName={seller.display_name} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
