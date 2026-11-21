import { createClient } from '@/lib/supabase/server';
import { getMyWallets, listMyPayouts } from '@/lib/server/services/seller-wallet-service';
import { RequestPayoutForm } from './request-form';

const PAYOUT_LABELS: Record<string, { label: string; cls: string }> = {
  requested: { label: 'قيد المراجعة', cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'معتمد', cls: 'bg-blue-100 text-blue-800' },
  rejected: { label: 'مرفوض', cls: 'bg-red-100 text-red-800' },
  paid: { label: 'مدفوع', cls: 'bg-green-100 text-green-800' },
};

export default async function WalletPage() {
  const db = await createClient();
  const [wallets, payouts, { data: payoutSettings }] = await Promise.all([
    getMyWallets(),
    listMyPayouts(),
    db.from('payout_settings').select('minimum_amount, minimum_currency').eq('id', 1).single(),
  ]);

  return (
    <main className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">المحفظة والمستحقات</h1>

      <section>
        <h2 className="font-semibold mb-3">الأرصدة</h2>
        {wallets.length === 0 ? (
          <div className="border rounded p-4 text-muted-foreground text-sm">
            لا توجد أرصدة بعد. ستظهر بعد أول عملية شراء معتمدة.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {wallets.map(w => (
              <div key={w.id} className="border rounded p-4">
                <p className="text-xs text-muted-foreground">الرصيد المتاح</p>
                <p className="text-2xl font-bold mt-1">{w.balance.toFixed(2)} {w.currency}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {wallets.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">طلب سحب مستحقات</h2>
          <RequestPayoutForm
            wallets={wallets}
            minimumAmount={Number(payoutSettings?.minimum_amount ?? 100)}
            minimumCurrency={payoutSettings?.minimum_currency ?? 'USD'}
          />
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-3">سجل الطلبات</h2>
        {payouts.length === 0 ? (
          <div className="border rounded p-6 text-center text-muted-foreground text-sm">
            لا توجد طلبات سحب بعد.
          </div>
        ) : (
          <div className="border rounded divide-y">
            {payouts.map(p => {
              const s = PAYOUT_LABELS[p.status] ?? { label: p.status, cls: 'bg-gray-100' };
              return (
                <div key={p.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{p.amount.toFixed(2)} {p.currency}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.requested_at).toLocaleDateString('ar')}
                      {p.decided_at && ` — قُيّم ${new Date(p.decided_at).toLocaleDateString('ar')}`}
                    </p>
                    {p.status === 'rejected' && p.reference && (
                      <p className="text-xs text-red-600 mt-1">السبب: {p.reference}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}