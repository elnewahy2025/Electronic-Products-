import { createClient } from '@/lib/supabase/server';
import { CommissionManager, ExpireCommissionButton } from './commission-manager';

export default async function AdminCommissionsPage() {
  const db = await createClient();
  const [{ data: settings }, { data: overrides }, { data: sellers }, { data: categories }] =
    await Promise.all([
      db.from('commission_settings').select('default_rate').eq('id', 1).single(),
      db.from('seller_commissions')
        .select(`
          id, seller_id, scope, reference_id, rate, effective_from, effective_to,
          seller_profiles!seller_commissions_seller_id_fkey(display_name)
        `)
        .order('effective_from', { ascending: false })
        .limit(100),
      db.from('seller_profiles')
        .select('profile_id, display_name')
        .eq('status', 'approved')
        .order('display_name'),
      db.from('categories').select('id, name').eq('is_active', true).order('name'),
    ]);

  const catMap = new Map((categories ?? []).map((c: any) => [c.id, c.name]));
  const now = Date.now();

  return (
    <main className="p-6 max-w-6xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">عمولات البائعين المخصصة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            النسبة الافتراضية للمنصة:{' '}
            <b className="font-mono text-foreground" dir="ltr">
              {(Number(settings?.default_rate ?? 0.1) * 100).toFixed(1)}%
            </b>
            — تُثبَّت النسبة الفعّالة تلقائياً وقت كل عملية بيع.
          </p>
        </div>
      </div>

      <CommissionManager
        sellers={(sellers ?? []) as any}
        categories={(categories ?? []) as any}
      />

      <section className="rounded-2xl border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/70">
            <tr>
              <th className="text-right p-3">البائع</th>
              <th className="text-right p-3">النطاق</th>
              <th className="text-right p-3">النسبة</th>
              <th className="text-right p-3">تبدأ من</th>
              <th className="text-right p-3">تنتهي في</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(overrides ?? []).map((o: any) => {
              const active = !o.effective_to || new Date(o.effective_to).getTime() > now;
              return (
                <tr key={o.id} className="border-t border-border">
                  <td className="p-3 font-medium">
                    {o.seller_profiles?.display_name ?? o.seller_id}
                  </td>
                  <td className="p-3 text-xs">
                    {o.scope === 'global'
                      ? 'عام'
                      : `تصنيف: ${catMap.get(o.reference_id) ?? o.reference_id ?? '—'}`}
                  </td>
                  <td className="p-3 font-mono font-semibold tabular-nums" dir="ltr">
                    {(Number(o.rate) * 100).toFixed(2)}%
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(o.effective_from).toLocaleDateString('ar')}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {o.effective_to ? new Date(o.effective_to).toLocaleDateString('ar') : 'مفتوحة'}
                  </td>
                  <td className="p-3 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full border ${
                        active
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {active ? 'نشطة' : 'منتهية'}
                    </span>
                  </td>
                  <td className="p-3 text-left">
                    {active && <ExpireCommissionButton id={o.id} />}
                  </td>
                </tr>
              );
            })}
            {!overrides?.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">
                  لا توجد عمولات مخصصة بعد (تُطبَّق النسبة الافتراضية على الجميع).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
