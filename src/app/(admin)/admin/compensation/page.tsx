import { createClient } from '@/lib/supabase/server';
import { CompensationActions } from './compensation-actions';

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'قيد المراجعة', tone: 'amber' },
  approved: { label: 'معتمد', tone: 'green' },
  rejected: { label: 'مرفوض', tone: 'red' },
  completed: { label: 'مكتمل', tone: 'green' },
  expired: { label: 'منتهي', tone: 'red' },
};

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

  const rows: any[] = data ?? [];
  const pendingCount = rows.filter(r => r.status === 'pending').length;
  const approvedCount = rows.filter(r => r.status === 'approved' || r.status === 'completed').length;
  const rejectedCount = rows.filter(r => r.status === 'rejected' || r.status === 'expired').length;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المبيعات</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">طلبات التعويض</h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة طلبات الجلسات التعويضية والبتّ فيها ضمن الحدود المسموحة.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{rows.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">طلبات في هذه القائمة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{pendingCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">بانتظار القرار</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{approvedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">معتمدة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{rejectedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">مرفوضة</p>
          </div>
        </div>
      </header>

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">المنتج</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الكود</th>
              <th className="text-right font-semibold px-3.5 py-2.5">التسلسل</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">السبب</th>
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
                    {row.purchase_codes.order_items.products.title}
                  </td>
                  <td className="px-3.5 py-3 text-xs font-medium text-foreground font-mono ui-num">
                    {row.purchase_codes.code_prefix}
                  </td>
                  <td className="px-3.5 py-3 text-sm text-foreground ui-num">{row.sequence_number}/3</td>
                  <td className="px-3.5 py-3">
                    <span className={`ui-badge ui-badge-${meta.tone}`}>{meta.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground max-w-xs truncate" title={row.reason}>
                    {row.reason}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(row.requested_at).toLocaleDateString('ar')}
                  </td>
                  <td className="px-3.5 py-3 text-left">
                    {row.status === 'pending' && <CompensationActions requestId={row.id} />}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد طلبات تعويض لعرضها.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
