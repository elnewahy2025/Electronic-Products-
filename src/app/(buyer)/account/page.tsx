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
  const nextSession = sessions[0] ?? null;

  const cards = [
    { label: 'أكواد نشطة', value: stats.active_codes, href: '/account/codes' },
    { label: 'جلسات تنزيل نشطة', value: stats.active_sessions, href: '/account/downloads' },
    { label: 'طلبات قيد المراجعة', value: stats.pending_orders, href: '/account/orders' },
    { label: 'إجمالي الطلبات', value: stats.total_orders, href: '/account/orders' },
  ];

  return (
    <main className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-[23px] font-bold text-foreground">حسابي</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          هذا ملخص طلباتك وأكوادك وجلسات التنزيل النشطة.
        </p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <Link
            key={c.label}
            href={c.href}
            className="ui-stat hover:border-primary block"
          >
            <div className="text-[28px] font-bold leading-tight text-foreground ui-num">
              {c.value}
            </div>
            <span className="text-[13.5px] text-muted-foreground mt-1 block">{c.label}</span>
          </Link>
        ))}
      </section>

      {/* Highlighted Next Action banner (.todo pattern) */}
      {nextSession && (
        <section className="rounded-[14px] border border-success bg-success-soft p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 space-y-0.5">
            <p className="font-bold text-base text-foreground truncate">
              {nextSession.product_title}
            </p>
            <p className="text-xs text-muted-foreground">
              {nextSession.is_compensation ? 'جلسة تعويضية نشطة' : 'كودك فعّال وجاهز للتنزيل'} — ينتهي بعد{' '}
              <Countdown to={nextSession.expires_at} />
            </p>
          </div>
          <Link
            href={`/account/downloads/${nextSession.session_id}`}
            className="rounded-[9px] bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-95 transition whitespace-nowrap"
          >
            نزّل ملفاتك الآن
          </Link>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-foreground">آخر الطلبات</h2>
          <Link href="/account/orders" className="text-xs font-medium text-primary hover:underline">
            عرض الكل ←
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="ui-box py-10 text-center text-muted-foreground text-sm">
            <p>لا توجد طلبات بعد.</p>
            <Link href="/products" className="text-primary font-semibold mt-2 inline-block hover:underline">
              تصفح المنتجات ←
            </Link>
          </div>
        ) : (
          <div className="ui-box p-2 sm:px-4 divide-y divide-border">
            {recent.map(o => (
              <Link
                key={o.purchase_request_id}
                href={`/account/orders/${o.purchase_request_id}`}
                className="flex items-center justify-between gap-3 py-3 px-1 hover:bg-muted/60 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {o.product_titles.join('، ') || 'طلب شراء'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(o.created_at).toLocaleDateString('ar')} —{' '}
                    <span className="ui-num font-medium">
                      {o.total_amount} {o.currency}
                    </span>
                  </p>
                </div>
                <StatusBadge status={o.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
