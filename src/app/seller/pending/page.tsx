import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/components/storefront/site-header';

export default async function PendingSellerPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login?next=/seller/pending');

  const { data: seller } = await db
    .from('seller_profiles')
    .select('status, display_name, rejection_reason, suspension_reason')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!seller) redirect('/seller/apply');
  if (seller.status === 'approved') redirect('/seller');

  return (
    // Static wrapper keeps Next's scroll/focus handler off the sticky header.
    <div>
      <SiteHeader />
      <main className="container max-w-lg py-16">
        <div className="ui-box p-8 text-center space-y-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-warning-soft text-warning mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-foreground">
              {seller.status === 'rejected'
                ? 'تم رفض طلب البائع'
                : seller.status === 'suspended'
                  ? 'حساب البائع موقوف مؤقتاً'
                  : 'حسابك قيد المراجعة'}
            </h1>
            <p className="text-sm text-muted-foreground">
              مرحباً <b className="text-foreground">{seller.display_name}</b> —{' '}
              {seller.status === 'pending'
                ? 'شكراً لتسجيلك كبائع. سيراجع فريق الإدارة طلبك ويصلك إشعار فور الاعتماد.'
                : 'يمكنك التواصل مع فريق الدعم الفني لمراجعة حالة حسابك.'}
            </p>
          </div>

          {seller.status === 'rejected' && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-right">
              <p className="font-semibold text-red-800 dark:text-red-300">تم رفض طلبك</p>
              {seller.rejection_reason && (
                <p className="text-red-700 dark:text-red-400 mt-1">
                  السبب: {seller.rejection_reason}
                </p>
              )}
            </div>
          )}

          {seller.status === 'suspended' && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-warning-soft p-4 text-sm text-right">
              <p className="font-semibold text-warning">تم إيقاف حسابك مؤقتاً</p>
              {seller.suspension_reason && (
                <p className="text-foreground/80 mt-1">
                  السبب: {seller.suspension_reason}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
            <Link
              href="/"
              className="rounded-[9px] bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-95 transition"
            >
              تصفح المتجر
            </Link>
            <Link
              href="/support"
              className="rounded-[9px] border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition"
            >
              التواصل مع الدعم
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
