import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  getMyWallets,
  listMyPayouts,
  listMyTransactions,
} from '@/lib/server/services/seller-wallet-service';
import { RequestPayoutForm } from './request-form';

const PAYOUT_LABELS: Record<string, { label: string; cls: string }> = {
  requested: { label: 'قيد المراجعة', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  approved: { label: 'معتمد', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  rejected: { label: 'مرفوض', cls: 'bg-red-50 text-red-800 border-red-200' },
  paid: { label: 'مدفوع', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};

const TX_LABELS: Record<string, { label: string; cls: string }> = {
  earning: { label: 'عائد مبيعة', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  commission: { label: 'عمولة المنصة', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  payout: { label: 'سحب مستحقات', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  adjustment: { label: 'تعديل إداري', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export default async function WalletPage() {
  const db = await createClient();
  const [wallets, payouts, transactions, { data: payoutSettings }] = await Promise.all([
    getMyWallets(),
    listMyPayouts(),
    listMyTransactions(50),
    db.from('payout_settings').select('minimum_amount, minimum_currency').eq('id', 1).single(),
  ]);

  return (
    <main className="p-6 md:p-8 space-y-8 max-w-5xl">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-5 border-b border-border">
        <div>
          <p className="text-xs font-medium text-primary mb-1">المالية والمستحقات</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            المحفظة والمستحقات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تُضاف أرباحك الصافية تلقائيًا عند اعتماد طلبات الشراء مع تثبيت نسبة العمولة لحظة البيع.
          </p>
        </div>
        <Link href="/seller/orders" className="text-sm font-medium text-primary hover:underline">
          عرض سجل المبيعات ←
        </Link>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold text-base">الأرصدة المتاحة</h2>
        {wallets.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-6 text-muted-foreground text-sm">
            لا توجد أرصدة بعد. ستظهر تلقائيًا بمجرد اعتماد أول عملية شراء لأحد منتجاتك.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wallets.map(w => (
              <div key={w.id} className="bg-white border border-border rounded-2xl p-5 shadow-sm">
                <p className="text-xs text-muted-foreground">الرصيد المتاح ({w.currency})</p>
                <p className="text-2xl font-bold mt-1.5 text-foreground font-mono tabular-nums" dir="ltr">
                  {w.balance.toFixed(2)} {w.currency}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {wallets.length > 0 && (
        <section className="bg-white border border-border rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-base">طلب سحب مستحقات</h2>
          <RequestPayoutForm
            wallets={wallets}
            minimumAmount={Number(payoutSettings?.minimum_amount ?? 100)}
            minimumCurrency={payoutSettings?.minimum_currency ?? 'USD'}
          />
        </section>
      )}

      {/* Financial Transactions Ledger */}
      <section className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-base">سجل الحركات المالية</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{transactions.length} حركة</span>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            لا توجد حركات مالية مسجّلة بعد.
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {transactions.map(t => {
              const meta = TX_LABELS[t.type] ?? {
                label: t.type,
                cls: 'bg-slate-100 text-slate-700 border-slate-200',
              };
              const isPositive = t.amount >= 0;
              return (
                <div key={t.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-md border ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <span
                    dir="ltr"
                    className={`text-sm font-mono font-semibold tabular-nums ${isPositive ? 'text-emerald-700' : 'text-red-700'
                      }`}
                  >
                    {isPositive ? '+' : ''}
                    {t.amount.toFixed(2)} {t.currency}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Payout Requests */}
      <section className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-base">سجل طلبات السحب</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{payouts.length} طلب</span>
        </div>
        {payouts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            لا توجد طلبات سحب بعد.
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {payouts.map(p => {
              const s = PAYOUT_LABELS[p.status] ?? { label: p.status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
              return (
                <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-mono font-semibold tabular-nums" dir="ltr">
                      {p.amount.toFixed(2)} {p.currency}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(p.requested_at).toLocaleDateString('ar-EG')}
                      {p.decided_at && ` — قُيّم ${new Date(p.decided_at).toLocaleDateString('ar-EG')}`}
                    </p>
                    {p.status === 'rejected' && p.reference && (
                      <p className="text-xs text-red-600 mt-1">السبب: {p.reference}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${s.cls}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
