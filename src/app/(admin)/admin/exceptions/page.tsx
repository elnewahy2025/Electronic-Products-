import { createClient } from '@/lib/supabase/server';
import { IssueExceptionForm } from './issue-form';

export default async function ExceptionsPage() {
  const db = await createClient();

  // Only Super Admin reaches here (guarded below in API and layout)
  const { data } = await db
    .from('attempt_exception_requests')
    .select(`
      id, status, reason, granted_attempts, created_at,
      purchase_codes!inner(code_prefix, order_items!inner(products!inner(title)))
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">استثناءات المحاولات</h1>

      <IssueExceptionForm />

      <section>
        <h2 className="font-semibold mb-2">الطلبات السابقة</h2>
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-right p-3">المنتج</th>
                <th className="text-right p-3">الكود</th>
                <th className="text-right p-3">المحاولات الممنوحة</th>
                <th className="text-right p-3">السبب</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row: any) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">{row.purchase_codes.order_items.products.title}</td>
                  <td className="p-3 font-mono text-xs">{row.purchase_codes.code_prefix}</td>
                  <td className="p-3">{row.granted_attempts ?? '—'}</td>
                  <td className="p-3 text-xs">{row.reason}</td>
                  <td className="p-3 text-xs">{row.status}</td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString('ar')}</td>
                </tr>
              ))}
              {!data?.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد طلبات</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}