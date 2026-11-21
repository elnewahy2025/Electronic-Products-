import { createClient } from '@/lib/supabase/server';
import { PayoutActions } from './payout-actions';

export default async function PayoutsPage() {
  const db = await createClient();
  const { data } = await db
    .from('seller_payouts')
    .select('id, seller_id, amount, currency, status, method, requested_at, reference, seller_profiles!inner(display_name)')
    .order('requested_at', { ascending: false })
    .limit(100);

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">طلبات السحب</h1>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">البائع</th>
              <th className="text-right p-3">المبلغ</th>
              <th className="text-right p-3">الطريقة</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">التاريخ</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.seller_profiles.display_name}</td>
                <td className="p-3">{Number(p.amount).toFixed(2)} {p.currency}</td>
                <td className="p-3 text-xs">{p.method}</td>
                <td className="p-3 text-xs">{p.status}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(p.requested_at).toLocaleDateString('ar')}
                </td>
                <td className="p-3">
                  <PayoutActions payoutId={p.id} status={p.status} />
                </td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد طلبات</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}