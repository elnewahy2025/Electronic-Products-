import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PayoutActions } from './payout-actions';

const STATUS_META: Record<string, { label: string; className: string }> = {
  requested: { label: 'مطلوب', className: 'ui-badge ui-badge-amber' },
  approved: { label: 'معتمد', className: 'ui-badge ui-badge-blue' },
  paid: { label: 'تم الصرف', className: 'ui-badge ui-badge-green' },
  rejected: { label: 'مرفوض', className: 'ui-badge ui-badge-red' },
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  vodafone_cash: 'فودافون كاش',
  paypal: 'PayPal',
  wise: 'Wise',
};

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const db = await createClient();
  let q = db
    .from('seller_payouts')
    .select('id, seller_id, amount, currency, status, method, requested_at, reference, seller_profiles!inner(display_name)')
    .order('requested_at', { ascending: false })
    .limit(100);

  const st = searchParams.status === 'pending' ? 'requested' : searchParams.status;
  if (st && ['requested', 'approved', 'rejected', 'paid'].includes(st)) {
    q = q.eq('status', st as any);
  }

  const { data } = await q;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المالية</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">طلبات السحب</h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة طلبات سحب البائعين واعتمادها وتأكيد تحويل المبالغ.
        </p>
      </header>

      <section className="ui-box">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية طلبات السحب">
          {[
            { k: '', label: 'الكل' },
            { k: 'requested', label: 'مطلوب' },
            { k: 'approved', label: 'معتمد' },
            { k: 'paid', label: 'تم الصرف' },
            { k: 'rejected', label: 'مرفوض' },
          ].map(f => (
            <Link
              key={f.k}
              href={f.k ? `/admin/payouts?status=${f.k}` : '/admin/payouts'}
              className={`ui-chip ${(st ?? '') === f.k ? 'ui-chip-active' : ''}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </section>

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">البائع</th>
              <th className="text-right font-semibold px-3.5 py-2.5">المبلغ</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الطريقة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">التاريخ</th>
              <th className="text-right font-semibold px-3.5 py-2.5">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {(data ?? []).map((p: any) => {
              const meta = STATUS_META[p.status] ?? {
                label: p.status ?? '—',
                className: 'ui-badge ui-badge-neutral',
              };
              return (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-sm text-foreground">
                    {p.seller_profiles.display_name}
                  </td>
                  <td className="px-3.5 py-3 text-sm text-foreground">
                    <span className="ui-num font-semibold">{Number(p.amount).toFixed(2)}</span>{' '}
                    <span className="text-xs text-muted-foreground">{p.currency}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground">
                    {METHOD_LABELS[p.method] ?? p.method ?? '—'}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={meta.className}>{meta.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground">
                    <span className="ui-num">{new Date(p.requested_at).toLocaleDateString('ar')}</span>
                  </td>
                  <td className="px-3.5 py-3">
                    <PayoutActions payoutId={p.id} status={p.status} />
                  </td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد طلبات سحب لعرضها.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
