import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';
import { CommissionManager, ExpireCommissionButton } from './commission-manager';

export default async function AdminCommissionsPage() {
  await requirePerm('commission.seller.override');
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
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المالية</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">عمولات البائعين المخصصة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          النسبة الافتراضية للمنصة:{' '}
          <b className="ui-num font-semibold text-foreground">
            {(Number(settings?.default_rate ?? 0.1) * 100).toFixed(1)}%
          </b>
          {' '}— تُثبَّت النسبة الفعّالة تلقائياً وقت كل عملية بيع.
        </p>
      </header>

      <CommissionManager
        sellers={(sellers ?? []) as any}
        categories={(categories ?? []) as any}
      />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">العمولات المسجّلة</h2>
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-right font-semibold px-3.5 py-2.5">البائع</th>
                <th className="text-right font-semibold px-3.5 py-2.5">النطاق</th>
                <th className="text-right font-semibold px-3.5 py-2.5">النسبة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">تبدأ من</th>
                <th className="text-right font-semibold px-3.5 py-2.5">تنتهي في</th>
                <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
                <th className="text-right font-semibold px-3.5 py-2.5">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {(overrides ?? []).map((o: any) => {
                const active = !o.effective_to || new Date(o.effective_to).getTime() > now;
                return (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3.5 py-3 text-sm font-medium text-foreground">
                      {o.seller_profiles?.display_name ?? o.seller_id}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground">
                      {o.scope === 'global'
                        ? 'عام'
                        : `تصنيف: ${catMap.get(o.reference_id) ?? o.reference_id ?? '—'}`}
                    </td>
                    <td className="px-3.5 py-3 text-sm text-foreground">
                      <span className="ui-num font-semibold">{(Number(o.rate) * 100).toFixed(2)}%</span>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground">
                      <span className="ui-num">{new Date(o.effective_from).toLocaleDateString('ar')}</span>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted-foreground">
                      {o.effective_to ? (
                        <span className="ui-num">{new Date(o.effective_to).toLocaleDateString('ar')}</span>
                      ) : (
                        'مفتوحة'
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      <span className={`ui-badge ${active ? 'ui-badge-green' : 'ui-badge-neutral'}`}>
                        {active ? 'نشطة' : 'منتهية'}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-left">
                      {active && <ExpireCommissionButton id={o.id} />}
                    </td>
                  </tr>
                );
              })}
              {!overrides?.length && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                    لا توجد عمولات مخصصة بعد (تُطبَّق النسبة الافتراضية على الجميع).
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
