import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { InstantSearch } from './instant-search';
import { NotificationBell } from '@/components/shared/notification-bell';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { LogoutButton } from '@/components/shared/logout-button';
import { BrandLogo } from '@/components/shared/brand-logo';

export async function SiteHeader() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  let accountType: string | null = null;
  let favCount = 0;
  if (user) {
    const [{ data: profile }, { count }] = await Promise.all([
      db.from('profiles').select('account_type').eq('id', user.id).single(),
      db.from('favorites').select('product_id', { count: 'exact', head: true }).eq('buyer_id', user.id),
    ]);
    accountType = profile?.account_type ?? null;
    favCount = count ?? 0;
  }

  return (
    <header className="border-b border-border sticky top-0 bg-card/95 backdrop-blur z-40">
      <div className="container flex items-center justify-between gap-2 sm:gap-4 h-[56px] sm:h-[60px]">
        <div className="min-w-0 shrink">
          <BrandLogo href="/" />
        </div>

        <nav className="hidden lg:flex items-center gap-1 text-sm ms-1 shrink-0">
          <Link href="/" className="px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground font-medium transition-colors">
            المتجر
          </Link>
          <Link href="/products" className="px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground font-medium transition-colors">
            كل المنتجات
          </Link>
          <Link href="/categories" className="px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground font-medium transition-colors">
            التصنيفات
          </Link>
          <Link href="/#how" className="px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground font-medium transition-colors">
            كيف أشتري؟
          </Link>
        </nav>

        <div className="hidden md:block flex-1 max-w-md ms-auto">
          <InstantSearch />
        </div>

        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm shrink-0">
          <ThemeToggle />
          {user && (
            <Link
              href="/account/favorites"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-[9px] border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
              title="المفضلة"
            >
              <span>المفضلة</span>
              <span className="ui-num text-muted-foreground">{favCount}</span>
            </Link>
          )}
          {user && <NotificationBell />}
          {!user && (
            <>
              <Link
                href="/login"
                className="rounded-[9px] border border-border px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-foreground hover:bg-muted transition whitespace-nowrap"
              >
                دخول
              </Link>
              <Link
                href="/register"
                className="rounded-[9px] bg-primary text-primary-foreground px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold hover:opacity-95 transition whitespace-nowrap"
              >
                حساب جديد
              </Link>
            </>
          )}
          {user && accountType === 'buyer' && (
            <Link href="/account" className="rounded-[9px] border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition">
              حسابي
            </Link>
          )}
          {user && accountType === 'seller' && (
            <Link href="/seller" className="rounded-[9px] border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition">
              لوحة البائع
            </Link>
          )}
          {user && accountType === 'staff' && (
            <Link href="/admin" className="rounded-[9px] border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition">
              الإدارة
            </Link>
          )}
          {user && <LogoutButton variant="header" />}
        </nav>
      </div>
    </header>
  );
}
