'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ExchangeRateForm() {
  const router = useRouter();
  const [base, setBase] = useState('USD');
  const [quote, setQuote] = useState('SAR');
  const [rate, setRate] = useState('3.75');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/exchange-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_currency: base,
          quote_currency: quote,
          rate: Number(rate),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? 'تعذّر حفظ سعر الصرف.' });
      } else {
        setMsg({ ok: true, text: 'تم تسجيل سعر الصرف الجديد.' });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: 'تعذّر الاتصال بالخادم.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="ui-box space-y-4"
    >
      <h2 className="text-base font-bold text-foreground">تسجيل سعر صرف جديد</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">العملة الأساسية</label>
          <input
            value={base}
            onChange={e => setBase(e.target.value.toUpperCase())}
            maxLength={3}
            required
            dir="ltr"
            className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm font-mono uppercase"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">العملة المقابلة</label>
          <input
            value={quote}
            onChange={e => setQuote(e.target.value.toUpperCase())}
            maxLength={3}
            required
            dir="ltr"
            className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm font-mono uppercase"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">سعر الصرف</label>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={rate}
            onChange={e => setRate(e.target.value)}
            required
            dir="ltr"
            className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm ui-num"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'جارٍ الحفظ...' : 'إضافة السعر'}
        </button>
        {msg && (
          <p className={`text-sm ${msg.ok ? 'text-success' : 'text-destructive'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
