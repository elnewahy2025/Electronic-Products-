import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { InstantSearch } from './instant-search';
import { NotificationBell } from '@/components/shared/notification-bell';

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

  // Where the bell should link, per account type
  const bellHref =
    accountType === 'staff' ? '/account/notifications'
    : accountType === 'seller' ? '/account/notifications'
    : '/account/notifications';

  return (
    <header className="border-b sticky top-0 bg-background z-40">
      <div className="container flex items-center gap-3 py-3">
        <Link href="/" className="text-xl font-bold whitespace-nowrap">
          {process.env.NEXT_PUBLIC_APP_NAME ?? 'المنصة'}
        </Link>
        <div className="flex-1">
          <InstantSearch />
        </div>
        <nav className="flex items-center gap-2 text-sm">
          {user && <NotificationBell />}
          {!user && (
            <>
              <Link href="/login" className="hover:underline">دخول</Link>
              <Link href="/register" className="bg-primary text-primary-foreground rounded px-3 py-1.5">
                إنشاء حساب
              </Link>
            </>
          )}
          {user && accountType === 'buyer' && (
            <Link href="/account" className="hover:underline">حسابي</Link>
          )}
          {user && accountType === 'seller' && (
            <Link href="/seller" className="hover:underline">لوحة البائع</Link>
          )}
          {user && accountType === 'staff' && (
            <Link href="/admin" className="hover:underline">الإدارة</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
