import { createClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/types/database';
import Link from 'next/link';

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  created: { label: 'منشأ', tone: 'blue' },
  pending: { label: 'قيد المراجعة', tone: 'amber' },
  approved: { label: 'معتمد', tone: 'green' },
  rejected: { label: 'مرفوض', tone: 'red' },
  cancelled: { label: 'ملغى', tone: 'neutral' },
  completed: { label: 'مكتمل', tone: 'green' },
};

export default async function RequestsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const db = await createClient();

  let q = db
    .from('purchase_requests')
    .select(`
      id, status, total_amount, currency, amount_in_usd,
      customer_email, customer_phone, created_at,
      purchase_request_items(id, product_id, products(title))
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.status === 'open') {
    q = q.in('status', ['created', 'pending']);
  } else if (
    searchParams.status &&
    ['created', 'pending', 'approved', 'rejected', 'cancelled', 'completed'].includes(searchParams.status)
  ) {
    q = q.eq('status', searchParams.status as Enums<'purchase_request_status_enum'>);
  }

  const { data } = await q;
  const rows: any[] = data ?? [];
  const activeStatus = searchParams.status ?? '';
  const pendingCount = rows.filter(r => r.status === 'created' || r.status === 'pending').length;
  const approvedCount = rows.filter(r => r.status === 'approved').length;
  const completedCount = rows.filter(r => r.status === 'completed').length;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المبيعات</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">طلبات الشراء</h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة طلبات الشراء الواردة واعتمادها أو رفضها ومتابعة حالاتها.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{rows.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">طلبات في هذه القائمة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{pendingCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">بانتظار المراجعة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{approvedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">معتمدة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{completedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">مكتملة</p>
          </div>
        </div>
      </header>

      <section className="ui-box flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية طلبات الشراء">
          <Link href="/admin/requests" className={`ui-chip ${activeStatus === '' ? 'ui-chip-active' : ''}`}>
            الكل
          </Link>
          <Link
            href="/admin/requests?status=pending"
            className={`ui-chip ${activeStatus === 'pending' ? 'ui-chip-active' : ''}`}
          >
            قيد المراجعة
          </Link>
          <Link
            href="/admin/requests?status=approved"
            className={`ui-chip ${activeStatus === 'approved' ? 'ui-chip-active' : ''}`}
          >
            معتمد
          </Link>
        </nav>
      </section>

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">المنتج</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المشتري</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المبلغ</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">التاريخ</th>
              <th className="px-3.5 py-2.5"><span className="sr-only">إجراءات</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row: any) => {
              const meta = STATUS_META[row.status] ?? { label: 'غير معروف', tone: 'neutral' as const };
              return (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-sm text-foreground">
                    {row.purchase_request_items?.[0]?.products?.title ?? '—'}
                    {row.purchase_request_items && row.purchase_request_items.length > 1 && (
                      <span className="text-xs text-muted-foreground ui-num">
                        {' '}+{row.purchase_request_items.length - 1}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground" dir="ltr">
                    {row.customer_email ?? row.customer_phone ?? '—'}
                  </td>
                  <td className="px-3.5 py-3 text-sm font-medium text-foreground ui-num">
                    {row.total_amount} {row.currency}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={`ui-badge ui-badge-${meta.tone}`}>{meta.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(row.created_at).toLocaleDateString('ar')}
                  </td>
                  <td className="px-3.5 py-3 text-left">
                    <Link
                      href={`/admin/requests/${row.id}`}
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
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد طلبات شراء لعرضها في هذه القائمة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
