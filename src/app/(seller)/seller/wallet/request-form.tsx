'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Wallet = { id: string; currency: string; balance: number };

const METHODS = [
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'wise', label: 'Wise' },
];

export function RequestPayoutForm({
  wallets,
  minimumAmount,
  minimumCurrency,
}: {
  wallets: Wallet[];
  minimumAmount: number;
  minimumCurrency: string;
}) {
  const [currency, setCurrency] = useState(wallets[0]?.currency ?? 'USD');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const wallet = wallets.find(w => w.currency === currency);
  const amountNum = parseFloat(amount) || 0;
  const meetsMin = currency !== minimumCurrency || amountNum >= minimumAmount;
  const hasBalance = wallet ? amountNum <= wallet.balance : false;
  const valid = amountNum > 0 && meetsMin && hasBalance;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSuccess(false);
    const res = await fetch('/api/seller/payouts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: amountNum, currency, method }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        below_minimum_payout: `الحد الأدنى للسحب ${minimumAmount} ${minimumCurrency}`,
        insufficient_balance: 'الرصيد غير كافٍ',
        seller_not_approved: 'حسابك غير معتمد',
      };
      return setError(map[json.error] ?? json.error ?? 'خطأ');
    }
    setSuccess(true);
    setAmount('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border rounded p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1">العملة</label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="w-full border rounded p-2 text-sm"
          >
            {wallets.map(w => (
              <option key={w.currency} value={w.currency}>
                {w.currency} — {w.balance.toFixed(2)} متاح
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">المبلغ</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full border rounded p-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1">طريقة الاستلام</label>
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="w-full border rounded p-2 text-sm"
        >
          {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {currency === minimumCurrency && (
        <p className="text-xs text-muted-foreground">
          الحد الأدنى للسحب: {minimumAmount} {minimumCurrency}
        </p>
      )}

      {!hasBalance && amountNum > 0 && (
        <p className="text-xs text-red-600">المبلغ يتجاوز الرصيد المتاح</p>
      )}

      {!meetsMin && amountNum > 0 && (
        <p className="text-xs text-red-600">أقل من الحد الأدنى للسحب</p>
      )}

      <button type="submit" disabled={!valid || busy} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50">
        {busy ? 'جارٍ...' : 'إرسال الطلب'}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm">تم إرسال طلب السحب بنجاح. سيراجعه فريق الإدارة قريبًا.</p>}
    </form>
  );
}