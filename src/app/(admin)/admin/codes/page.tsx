import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  issued: { label: 'صادر', tone: 'blue' },
  delivered: { label: 'تم التسليم', tone: 'green' },
  redeemed: { label: 'مُفعّل', tone: 'green' },
  expired: { label: 'منتهي', tone: 'red' },
  revoked: { label: 'ملغى', tone: 'red' },
};

export default async function CodesPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const db = await createClient();
  let q = db
    .from('purchase_codes')
    .select(`
      id, code_prefix, status, issued_at, delivered_at, expires_at, redeemed_at,
      delivery_confirmation_method,
      order_items!inner(
        products!inner(title),
        orders!inner(purchase_requests!inner(customer_email, buyer_id))
      )
    `)
    .order('issued_at', { ascending: false })
    .limit(100);

  if (searchParams.status) q = q.eq('status', searchParams.status);

  const { data } = await q;
  const rows: any[] = data ?? [];
  const activeStatus = searchParams.status ?? '';
  const activeCodesCount = rows.filter(r => r.status === 'delivered' || r.status === 'redeemed').length;
  const issuedCount = rows.filter(r => r.status === 'issued').length;
  const stoppedCount = rows.filter(r => r.status === 'expired' || r.status === 'revoked').length;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المبيعات</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">أكواد الشراء</h1>
        <p className="text-sm text-muted-foreground mt-1">
          تتبّع أكواد الشراء المصدرة وحالات تسليمها وتفعيلها.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{rows.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">أكواد في هذه القائمة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{activeCodesCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">مُسلّمة أو مفعّلة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{issuedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">بانتظار التسليم</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{stoppedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">منتهية أو ملغاة</p>
          </div>
        </div>
      </header>

      <section className="ui-box flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية أكواد الشراء">
          <Link href="/admin/codes" className={`ui-chip ${activeStatus === '' ? 'ui-chip-active' : ''}`}>
            الكل
          </Link>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <Link
              key={k}
              href={`/admin/codes?status=${k}`}
              className={`ui-chip ${activeStatus === k ? 'ui-chip-active' : ''}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </section>

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">البادئة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المنتج</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المشتري</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">أُصدر</th>
              <th className="text-right font-semibold px-3.5 py-2.5">ينتهي</th>
              <th className="px-3.5 py-2.5"><span className="sr-only">إجراءات</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row: any) => {
              const meta = STATUS_META[row.status] ?? { label: 'غير معروف', tone: 'neutral' as const };
              return (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-sm font-medium text-foreground font-mono ui-num">
                    {row.code_prefix}••••
                  </td>
                  <td className="px-3.5 py-3 text-sm text-foreground">{row.order_items.products.title}</td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground" dir="ltr">
                    {row.order_items.orders.purchase_requests.customer_email ?? '—'}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={`ui-badge ui-badge-${meta.tone}`}>{meta.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(row.issued_at).toLocaleString('ar')}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(row.expires_at).toLocaleString('ar')}
                  </td>
                  <td className="px-3.5 py-3 text-left">
                    <Link
                      href={`/admin/codes/${row.id}`}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      عرض
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد أكواد شراء لعرضها في هذه القائمة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
