import { createClient } from '@/lib/supabase/server';
import { IssueExceptionForm } from './issue-form';

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'قيد المراجعة', className: 'ui-badge ui-badge-amber' },
  approved: { label: 'معتمد', className: 'ui-badge ui-badge-green' },
  fulfilled: { label: 'تم التنفيذ', className: 'ui-badge ui-badge-green' },
  rejected: { label: 'مرفوض', className: 'ui-badge ui-badge-red' },
};

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
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">الأمان والتنزيل</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">استثناءات المحاولات</h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة طلبات زيادة محاولات التنزيل وإصدار استثناءات يدوية موثّقة في سجل التدقيق.
        </p>
      </header>

      <IssueExceptionForm />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">الطلبات السابقة</h2>
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-right font-semibold px-3.5 py-2.5">المنتج</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الكود</th>
                <th className="text-right font-semibold px-3.5 py-2.5">المحاولات الممنوحة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">السبب</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {(data ?? []).map((row: any) => {
                const meta = STATUS_META[row.status] ?? {
                  label: row.status ?? '—',
                  className: 'ui-badge ui-badge-neutral',
                };
                return (
                  <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3.5 py-3 text-sm text-foreground">
                      {row.purchase_codes.order_items.products.title}
                    </td>
                    <td className="px-3.5 py-3 text-sm text-foreground">
                      <span className="ui-num font-mono text-xs">{row.purchase_codes.code_prefix}</span>
                    </td>
                    <td className="px-3.5 py-3 text-sm text-foreground">
                      <span className="ui-num">{row.granted_attempts ?? '—'}</span>
                    </td>
                    <td className="px-3.5 py-3 text-sm text-muted-foreground">{row.reason}</td>
                    <td className="px-3.5 py-3">
                      <span className={meta.className}>{meta.label}</span>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground">
                      <span className="ui-num">{new Date(row.created_at).toLocaleDateString('ar')}</span>
                    </td>
                  </tr>
                );
              })}
              {!data?.length && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                    لا توجد طلبات استثناء بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
