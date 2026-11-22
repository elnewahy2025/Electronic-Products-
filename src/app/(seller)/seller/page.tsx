import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getMyWallets } from '@/lib/server/services/seller-wallet-service';
import { listSellerProducts } from '@/lib/server/services/seller-product-service';
import { ProductStatusBadge } from '@/components/shared/product-status-badge';

export default async function SellerHome() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const [wallets, products, { data: driveAccounts }] = await Promise.all([
    getMyWallets(),
    listSellerProducts(user.id),
    db
      .from('seller_drive_accounts')
      .select('id, status, store_folder_id')
      .eq('seller_id', user.id)
      .eq('status', 'active'),
  ]);

  const [{ count: pendingPayouts }] = await Promise.all([
    db.from('seller_payouts')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', user.id)
      .eq('status', 'requested'),
  ]);

  const publishedCount = products.filter(p => p.status === 'published').length;
  const draftCount = products.filter(p => p.status === 'draft').length;
  const wallet = wallets.find(w => w.currency === 'USD') ?? wallets[0];

  const hasDrive = (driveAccounts?.length ?? 0) > 0;
  const hasStoreFolder = (driveAccounts ?? []).some((a: any) => Boolean(a.store_folder_id));
  const hasPublishedProduct = publishedCount > 0;
  const showOnboarding = !(hasDrive && hasStoreFolder && hasPublishedProduct);

  const onboardingSteps = [
    { done: hasDrive, label: 'ربط حساب Google Drive', href: '/seller/drive-accounts' },
    { done: hasStoreFolder, label: 'تحديد مجلد Store للمتجر', href: '/seller/upload' },
    { done: hasPublishedProduct, label: 'نشر أول منتج رقمي', href: '/seller/products/new' },
  ];

  const cards = [
    { label: 'المنتجات المنشورة', value: publishedCount, href: '/seller/products', color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'المسودات', value: draftCount, href: '/seller/products', color: 'text-amber-600 dark:text-amber-400' },
    { label: 'طلبات سحب معلقة', value: pendingPayouts ?? 0, href: '/seller/wallet', color: 'text-primary' },
    { label: 'الرصيد المتاح', value: `${wallet?.balance.toFixed(2) ?? '0.00'} ${wallet?.currency ?? 'USD'}`, href: '/seller/wallet', color: 'text-primary' },
  ];

  return (
    <main className="w-full space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">لوحة البائع</h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة منتجاتك الرقمية ومبيعاتك من مكان واحد</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/seller/products/new" className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-95 transition">
            + منتج جديد
          </Link>
          <Link href="/seller/upload" className="border border-border bg-card rounded-xl px-4 py-2 text-sm font-medium hover:bg-muted transition">
            رفع / استيراد ملف
          </Link>
          <Link href="/seller/wallet" className="border border-border bg-card rounded-xl px-4 py-2 text-sm font-medium hover:bg-muted transition">
            طلب سحب مستحقات
          </Link>
        </div>
      </div>

      {showOnboarding && (
        <section className="rounded-[14px] border border-primary/30 bg-primary/[0.04] dark:bg-primary/[0.08] p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-bold">دليل البداية السريعة (3 خطوات)</h2>
            <span className="text-xs text-muted-foreground ui-num">
              {onboardingSteps.filter(s => s.done).length} / 3 مكتملة
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {onboardingSteps.map((step, i) => (
              <Link
                key={step.label}
                href={step.href}
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium transition ${
                  step.done
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-border bg-card hover:border-primary'
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span>{i + 1}. {step.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="ui-stat hover:border-primary block">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ui-num ${c.color}`}>{c.value}</p>
          </Link>
        ))}
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">آخر منتجاتك</h2>
          <Link href="/seller/products" className="text-sm text-primary hover:underline">عرض الكل</Link>
        </div>
        {products.length === 0 ? (
          <div className="ui-box text-center text-muted-foreground text-sm py-8">
            لا توجد منتجات بعد.{' '}
            <Link href="/seller/products/new" className="text-primary font-semibold hover:underline">أضف أول منتج ←</Link>
          </div>
        ) : (
          <div className="ui-table-wrap divide-y divide-border">
            {products.slice(0, 5).map(p => (
              <Link key={p.id} href={`/seller/products/${p.id}`} className="block p-3.5 hover:bg-muted/30 transition">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{p.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 ui-num">
                      {p.price_amount} {p.price_currency} — {p.versions_count} إصدار
                    </p>
                  </div>
                  <ProductStatusBadge status={p.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}