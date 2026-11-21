import Link from 'next/link';
import type { SellerSalesStats } from '@/lib/server/services/seller-order-service';

export function OrdersStats({ stats }: { stats: SellerSalesStats }) {
  if (stats.total_sales === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        <p className="text-3xl mb-2">📦</p>
        <p>لم تبع أي منتج بعد.</p>
        <p className="text-xs mt-2">
          انشر منتجًا وشارك رابطه — ستظهر مبيعاتك هنا عند أول عملية شراء.
        </p>
      </div>
    );
  }

  const cur = stats.currency;
  const multi = stats.has_multiple_currencies;
  const approx = multi ? '~' : '';

  const cards = [
    {
      label: 'إجمالي المبيعات',
      value: stats.total_sales.toLocaleString('ar'),
      sub: `آخر 30 يوم: ${stats.sales_last_30d}`,
      href: '/seller/orders',
      color: 'text-foreground',
    },
    {
      label: 'إجمالي المبلغ',
      value: `${approx}${stats.total_gross.toFixed(2)} ${cur}`,
      sub: multi ? 'مبالغ بعملات مختلفة' : `العمولة: ${(stats.commission_rate * 100).toFixed(0)}%`,
      href: '/seller/orders',
      color: 'text-foreground',
    },
    {
      label: 'صافي بعد العمولة',
      value: `${approx}${stats.total_net.toFixed(2)} ${cur}`,
      sub: `آخر 30 يوم: ${approx}${stats.revenue_last_30d.toFixed(2)}`,
      href: '/seller/wallet',
      color: 'text-green-700',
    },
    {
      label: 'بانتظار التفعيل',
      value: stats.pending_count.toLocaleString('ar'),
      sub: `نشط: ${stats.active_count} · مكتمل: ${stats.completed_count}`,
      href: '/seller/orders?status=pending',
      color: stats.pending_count > 0 ? 'text-yellow-700' : 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => (
        <Link
          key={c.label}
          href={c.href}
          className="border rounded-lg p-4 hover:shadow-sm transition"
        >
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
          <p className="text-xs text-muted-foreground mt-2">{c.sub}</p>
        </Link>
      ))}
    </div>
  );
}
