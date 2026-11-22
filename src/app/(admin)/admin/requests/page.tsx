import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  created: 'منشأ',
  pending: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
  completed: 'مكتمل',
};

export default async function RequestsPage({ searchParams }: { searchParams: { status?: string } }) {
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
    q = q.eq('status', searchParams.status);
  }

  const { data } = await q;

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">طلبات الشراء</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/requests" className="border rounded px-3 py-1">الكل</Link>
          <Link href="/admin/requests?status=pending" className="border rounded px-3 py-1">قيد المراجعة</Link>
          <Link href="/admin/requests?status=approved" className="border rounded px-3 py-1">معتمد</Link>
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">المشتري</th>
              <th className="text-right p-3">المبلغ</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">التاريخ</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row: any) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">
                  {row.purchase_request_items?.[0]?.products?.title ?? '—'}
                  {row.purchase_request_items && row.purchase_request_items.length > 1 && (
                    <span className="text-xs text-muted-foreground">
                      {' '}+{row.purchase_request_items.length - 1}
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs">{row.customer_email ?? row.customer_phone ?? '—'}</td>
                <td className="p-3">{row.total_amount} {row.currency}</td>
                <td className="p-3 text-xs">{STATUS_LABELS[row.status] ?? row.status}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString('ar')}
                </td>
                <td className="p-3">
                  <Link href={`/admin/requests/${row.id}`} className="text-primary text-sm">عرض</Link>
                </td>
              </tr>
            ))}
            {!data?.length && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد طلبات</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
