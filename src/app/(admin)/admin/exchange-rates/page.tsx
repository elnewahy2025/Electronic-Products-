import { createClient } from '@/lib/supabase/server';
import { ExchangeRateForm } from './rate-form';

export default async function AdminExchangeRatesPage() {
  const db = await createClient();
  const { data: rates } = await db
    .from('exchange_rates')
    .select('id, base_currency, quote_currency, rate, effective_at, set_at, profiles!exchange_rates_set_by_fkey(email)')
    .order('effective_at', { ascending: false })
    .limit(100);

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المالية</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">أسعار الصرف</h1>
        <p className="text-sm text-muted-foreground mt-1">
          سجل أسعار الصرف التاريخية المستخدمة لحساب قيمة الطلبات بالعملات المختلفة.
        </p>
      </header>

      <ExchangeRateForm />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">الأسعار المسجّلة</h2>
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-right font-semibold px-3.5 py-2.5">الزوج</th>
                <th className="text-right font-semibold px-3.5 py-2.5">السعر</th>
                <th className="text-right font-semibold px-3.5 py-2.5">تاريخ السريان</th>
                <th className="text-right font-semibold px-3.5 py-2.5">بواسطة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {(rates ?? []).map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-sm text-foreground">
                    <span className="ui-num font-semibold">{r.base_currency} / {r.quote_currency}</span>
                  </td>
                  <td className="px-3.5 py-3 text-sm text-foreground">
                    <span className="ui-num font-semibold">{Number(r.rate).toFixed(4)}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground">
                    <span className="ui-num">{new Date(r.effective_at).toLocaleString('ar')}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground" dir="ltr">
                    {r.profiles?.email ?? 'system'}
                  </td>
                </tr>
              ))}
              {!rates?.length && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-sm text-muted-foreground">
                    لا توجد أسعار صرف مسجّلة بعد.
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
