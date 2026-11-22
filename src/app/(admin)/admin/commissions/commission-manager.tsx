'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  sellers: { profile_id: string; display_name: string }[];
  categories: { id: string; name: string }[];
};

export function CommissionManager({ sellers, categories }: Props) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState(sellers[0]?.profile_id ?? '');
  const [scope, setScope] = useState<'global' | 'category'>('global');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [ratePct, setRatePct] = useState('8');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const rate = Number(ratePct) / 100;
    try {
      const res = await fetch('/api/admin/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_id: sellerId,
          scope,
          reference_id: scope === 'category' ? categoryId : null,
          rate,
          effective_to: effectiveTo ? new Date(effectiveTo).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? 'تعذّر إضافة الاستثناء.' });
      } else {
        setMsg({ ok: true, text: 'تمت إضافة نسبة العمولة المخصصة بنجاح.' });
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
      className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4"
    >
      <h2 className="text-base font-semibold text-foreground">إضافة عمولة مخصصة لبائع</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">البائع</label>
          <select
            value={sellerId}
            onChange={e => setSellerId(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {sellers.map(s => (
              <option key={s.profile_id} value={s.profile_id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">النطاق</label>
          <select
            value={scope}
            onChange={e => setScope(e.target.value as 'global' | 'category')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="global">عام (جميع منتجات البائع)</option>
            <option value="category">تصنيف محدد</option>
          </select>
        </div>

        {scope === 'category' && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground block">التصنيف</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">نسبة العمولة (%)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={ratePct}
            onChange={e => setRatePct(e.target.value)}
            required
            dir="ltr"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono tabular-nums"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">
            تنتهي في (اختياري)
          </label>
          <input
            type="date"
            value={effectiveTo}
            onChange={e => setEffectiveTo(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || sellers.length === 0}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-50"
        >
          {busy ? 'جارٍ الحفظ...' : 'حفظ العمولة المخصصة'}
        </button>
        {msg && (
          <p className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-destructive'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}

export function ExpireCommissionButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function expire() {
    setBusy(true);
    const res = await fetch(`/api/admin/commissions/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={expire}
      disabled={busy}
      className="text-xs text-red-700 dark:text-red-400 hover:underline disabled:opacity-50"
    >
      {busy ? '...' : 'إنهاء الآن'}
    </button>
  );
}
