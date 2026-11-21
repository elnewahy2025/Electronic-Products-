import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMyWallets } from '@/lib/server/services/seller-wallet-service';
import { listSellerProducts } from '@/lib/server/services/seller-product-service';

export default async function SellerHome() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const [wallets, products] = await Promise.all([
    getMyWallets(),
    listSellerProducts(user.id),
  ]);

  const [{ count: activeVersions }, { count: pendingPayouts }] = await Promise.all([
    db.from('product_versions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .in('product_id', products.map(p => p.id)),
    db.from('seller_payouts')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', user.id)
      .eq('status', 'requested'),
  ]);

  const publishedCount = products.filter(p => p.status === 'published').length;
  const draftCount = products.filter(p => p.status === 'draft').length;
  const wallet = wallets.find(w => w.currency === 'USD') ?? wallets[0];

  const cards = [
    { label: 'المنتجات المنشورة', value: publishedCount, href: '/seller/products', color: 'text-green-600' },
    { label: 'المسودات', value: draftCount, href: '/seller/products', color: 'text-yellow-600' },
    { label: 'طلبات سحب معلقة', value: pendingPayouts ?? 0, href: '/seller/wallet', color: 'text-blue-600' },
    { label: 'الرصيد المتاح', value: `${wallet?.balance.toFixed(2) ?? '0.00'} ${wallet?.currency ?? 'USD'}`, href: '/seller/wallet', color: 'text-primary' },
  ];

  return (
    <main className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">لوحة البائع</h1>
        <p className="text-sm text-muted-foreground mt-1">مرحبًا بك</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="border rounded-lg p-4 hover:shadow-sm transition">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          </Link>
        ))}
      </div>

      <section className="flex flex-wrap gap-2">
        <Link href="/seller/products/new" className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm">
          + منتج جديد
        </Link>
        <Link href="/seller/upload" className="border rounded px-4 py-2 text-sm">
          رفع ملف
        </Link>
        <Link href="/seller/wallet" className="border rounded px-4 py-2 text-sm">
          طلب سحب مستحقات
        </Link>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">آخر منتجاتك</h2>
          <Link href="/seller/products" className="text-sm text-primary">عرض الكل</Link>
        </div>
        {products.length === 0 ? (
          <div className="border rounded p-6 text-center text-muted-foreground text-sm">
            لا توجد منتجات بعد.{' '}
            <Link href="/seller/products/new" className="text-primary">أضف أول منتج ←</Link>
          </div>
        ) : (
          <div className="border rounded divide-y">
            {products.slice(0, 5).map(p => (
              <Link key={p.id} href={`/seller/products/${p.id}`} className="block p-3 hover:bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{p.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.price_amount} {p.price_currency} — {p.versions_count} إصدار
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    p.status === 'published' ? 'bg-green-100 text-green-800'
                    : p.status === 'draft' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                  }`}>{p.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}