import Link from 'next/link';
import { getBuyerStats, listBuyerSessions, listBuyerOrders } from '@/lib/server/services/buyer-service';
import { StatusBadge } from '@/components/buyer/status-badge';
import { Countdown } from '@/components/buyer/countdown';

export default async function AccountHome() {
  const [stats, sessions, orders] = await Promise.all([
    getBuyerStats(),
    listBuyerSessions('active'),
    listBuyerOrders(),
  ]);

  const recent = orders.slice(0, 5);

  const cards = [
    { label: 'طلباتي', value: stats.total_orders, href: '/account/orders' },
    { label: 'قيد المراجعة', value: stats.pending_orders, href: '/account/orders', color: 'text-yellow-600' },
    { label: 'أكواد نشطة', value: stats.active_codes, href: '/account/codes', color: 'text-blue-600' },
    { label: 'جلسات تنزيل نشطة', value: stats.active_sessions, href: '/account/downloads', color: 'text-green-600' },
  ];

  return (
    <main className="p-6 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">حسابي</h1>
        <p className="text-sm text-muted-foreground mt-1">مرحبًا بك</p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <Link
            key={c.label}
            href={c.href}
            className="border rounded-lg p-4 hover:shadow-sm transition"
          >
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color ?? ''}`}>{c.value}</p>
          </Link>
        ))}
      </section>

      {sessions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">تنزيلات نشطة</h2>
            <Link href="/account/downloads?status=active" className="text-sm text-primary">
              عرض الكل
            </Link>
          </div>
          <div className="space-y-2">
            {sessions.slice(0, 3).map(s => (
              <div key={s.session_id} className="border rounded p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.product_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.is_compensation ? 'جلسة تعويضية' : 'جلسة عادية'} • ينتهي بعد{' '}
                    <Countdown to={s.expires_at} />
                  </p>
                </div>
                <Link
                  href={`/account/downloads/${s.session_id}`}
                  className="bg-primary text-primary-foreground rounded px-3 py-1 text-xs whitespace-nowrap"
                >
                  تنزيل
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">آخر الطلبات</h2>
          <Link href="/account/orders" className="text-sm text-primary">
            عرض الكل
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="border rounded p-6 text-center text-muted-foreground text-sm">
            <p>لا توجد طلبات بعد.</p>
            <Link href="/products" className="text-primary mt-2 inline-block">تصفح المنتجات ←</Link>
          </div>
        ) : (
          <div className="border rounded divide-y">
            {recent.map(o => (
              <Link
                key={o.purchase_request_id}
                href={`/account/orders/${o.purchase_request_id}`}
                className="block p-3 hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {o.product_titles.join(', ') || 'طلب'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(o.created_at).toLocaleDateString('ar')} — {o.total_amount} {o.currency}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
