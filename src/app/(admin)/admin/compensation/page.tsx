import { createClient } from '@/lib/supabase/server';
import { CompensationActions } from './compensation-actions';

export default async function CompensationPage() {
  const db = await createClient();
  const { data } = await db
    .from('compensation_requests')
    .select(`
      id, status, reason, admin_reason, sequence_number, requested_at, decided_at,
      code_id,
      purchase_codes!inner(code_prefix, order_items!inner(products!inner(title)))
    `)
    .order('requested_at', { ascending: false })
    .limit(100);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">طلبات التعويض</h1>
      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">الكود</th>
              <th className="text-right p-3">التسلسل</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">السبب</th>
              <th className="text-right p-3">التاريخ</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row: any) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.purchase_codes.order_items.products.title}</td>
                <td className="p-3 font-mono text-xs">{row.purchase_codes.code_prefix}</td>
                <td className="p-3">{row.sequence_number}/3</td>
                <td className="p-3 text-xs">{row.status}</td>
                <td className="p-3 text-xs max-w-xs truncate">{row.reason}</td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(row.requested_at).toLocaleDateString('ar')}</td>
                <td className="p-3">
                  {row.status === 'pending' && <CompensationActions requestId={row.id} />}
                </td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">لا توجد طلبات</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}