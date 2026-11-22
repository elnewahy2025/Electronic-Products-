import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { InstantSearch } from './instant-search';
import { NotificationBell } from '@/components/shared/notification-bell';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { LogoutButton } from '@/components/shared/logout-button';

export async function SiteHeader() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  let accountType: string | null = null;
  if (user) {
    const { data: profile } = await db
      .from('profiles')
      .select('account_type')
      .eq('id', user.id)
      .single();
    accountType = profile?.account_type ?? null;
  }

  return (
    <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur z-40">
      <div className="container flex items-center gap-3 py-3">
        <Link href="/" className="text-xl font-bold whitespace-nowrap text-foreground">
          {process.env.NEXT_PUBLIC_APP_NAME ?? 'المنصة'}
        </Link>
        <div className="flex-1">
          <InstantSearch />
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <ThemeToggle />
          {user && <NotificationBell />}
          {!user && (
            <>
              <Link href="/login" className="px-2.5 py-1.5 rounded-lg hover:bg-muted/60">
                دخول
              </Link>
              <Link
                href="/register"
                className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 font-medium hover:bg-primary/90"
              >
                إنشاء حساب
              </Link>
            </>
          )}
          {user && accountType === 'buyer' && (
            <Link href="/account" className="px-2.5 py-1.5 rounded-lg hover:bg-muted/60 font-medium">
              حسابي
            </Link>
          )}
          {user && accountType === 'seller' && (
            <Link href="/seller" className="px-2.5 py-1.5 rounded-lg hover:bg-muted/60 font-medium">
              لوحة البائع
            </Link>
          )}
          {user && accountType === 'staff' && (
            <Link href="/admin" className="px-2.5 py-1.5 rounded-lg hover:bg-muted/60 font-medium">
              الإدارة
            </Link>
          )}
          {user && <LogoutButton variant="header" />}
        </nav>
      </div>
    </header>
  );
}
