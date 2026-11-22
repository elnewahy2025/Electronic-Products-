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
    <main className="p-6 max-w-5xl space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-foreground">أسعار الصرف</h1>
        <p className="text-sm text-muted-foreground mt-1">
          سجل أسعار الصرف التاريخية المستخدمة لحساب قيمة الطلبات بالعملات المختلفة.
        </p>
      </div>

      <ExchangeRateForm />

      <section className="rounded-2xl border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/70">
            <tr>
              <th className="text-right p-3">الزوج</th>
              <th className="text-right p-3">السعر</th>
              <th className="text-right p-3">تاريخ السريان</th>
              <th className="text-right p-3">بواسطة</th>
            </tr>
          </thead>
          <tbody>
            {(rates ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-mono font-semibold" dir="ltr">
                  {r.base_currency} / {r.quote_currency}
                </td>
                <td className="p-3 font-mono tabular-nums" dir="ltr">
                  {Number(r.rate).toFixed(4)}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(r.effective_at).toLocaleString('ar')}
                </td>
                <td className="p-3 text-xs font-mono text-muted-foreground" dir="ltr">
                  {r.profiles?.email ?? 'system'}
                </td>
              </tr>
            ))}
            {!rates?.length && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground text-sm">
                  لا توجد أسعار صرف مسجّلة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
