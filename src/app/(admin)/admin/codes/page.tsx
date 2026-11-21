import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  issued: 'صادر',
  delivered: 'تم التسليم',
  redeemed: 'مُفعّل',
  expired: 'منتهي',
  revoked: 'ملغى',
};

export default async function CodesPage({ searchParams }: { searchParams: { status?: string } }) {
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

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">أكواد الشراء</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/codes" className="border rounded px-3 py-1">الكل</Link>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <Link
              key={k}
              href={`/admin/codes?status=${k}`}
              className={`border rounded px-3 py-1 ${searchParams.status === k ? 'bg-accent' : ''}`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">البادئة</th>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">المشتري</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">أُصدر</th>
              <th className="text-right p-3">ينتهي</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row: any) => (
              <tr key={row.id} className="border-t">
                <td className="p-3 font-mono">{row.code_prefix}••••</td>
                <td className="p-3">{row.order_items.products.title}</td>
                <td className="p-3 text-xs">{row.order_items.orders.purchase_requests.customer_email ?? '—'}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    row.status === 'redeemed' ? 'bg-green-100 text-green-800'
                    : row.status === 'delivered' ? 'bg-blue-100 text-blue-800'
                    : row.status === 'issued' ? 'bg-yellow-100 text-yellow-800'
                    : row.status === 'revoked' ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                  }`}>{STATUS_LABELS[row.status]}</span>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(row.issued_at).toLocaleString('ar')}</td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(row.expires_at).toLocaleString('ar')}</td>
                <td className="p-3"><Link href={`/admin/codes/${row.id}`} className="text-primary text-sm">عرض</Link></td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">لا توجد أكواد</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}