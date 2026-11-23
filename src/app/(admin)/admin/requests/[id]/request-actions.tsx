'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type IssuedCode = { code_id: string; code_prefix: string; plaintext: string };

export function RequestActions({
  requestId,
  totalAmount,
  currency,
}: {
  requestId: string;
  totalAmount: number;
  currency: string;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [attestation, setAttestation] = useState({
    amount: String(totalAmount),
    currency: currency.toUpperCase(),
    reference: '',
    method: 'manual_transfer',
  });
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode[] | null>(null);
  const router = useRouter();

  async function approve() {
    setBusy(true); setError(null);
    try {
      const amount = Number(attestation.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('ATTESTATION_AMOUNT_INVALID');
      if (!attestation.currency || attestation.currency.trim().length !== 3) throw new Error('ATTESTATION_CURRENCY_INVALID');
      if (attestation.reference.trim().length < 3) throw new Error('ATTESTATION_REFERENCE_REQUIRED');

      const res = await fetch(`/api/admin/requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency: attestation.currency.trim().toUpperCase(),
          reference: attestation.reference.trim(),
          method: attestation.method.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      // Fetch plaintext for each code (one-time display)
      const codes: IssuedCode[] = [];
      for (const c of json.codes) {
        const r = await fetch(`/api/admin/codes/${c.code_id}/plaintext`);
        const d = await r.json();
        codes.push({ code_id: c.code_id, code_prefix: c.code_prefix, plaintext: d.plaintext });
      }
      setIssued(codes);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <section className="ui-box space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-foreground">أكواد صادرة (تُعرض مرة واحدة فقط!)</h3>
            <p className="text-xs text-muted-foreground mt-1">انسخها الآن وأرسلها للمشتري قبل مغادرة الصفحة.</p>
          </div>
          <span className="ui-badge ui-badge-amber">يتطلب نسخًا فوريًا</span>
        </div>
        <div className="space-y-2">
          {issued.map(c => (
            <div
              key={c.code_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-2.5"
            >
              <code className="font-mono text-base text-foreground ui-num">{c.plaintext}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(c.plaintext)}
                className="rounded-lg border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
              >
                نسخ
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="ui-box space-y-3">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          الموافقة تُسجَّل كإقرار تسوية يدوي. أدخل المبلغ والعملة والمرجع قبل إصدار الأكواد.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted-foreground">
            المبلغ المستلم
            <input
              value={attestation.amount}
              onChange={e => setAttestation(a => ({ ...a, amount: e.target.value }))}
              inputMode="decimal"
              className="mt-1 w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm ui-num"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            العملة
            <input
              value={attestation.currency}
              onChange={e => setAttestation(a => ({ ...a, currency: e.target.value.toUpperCase() }))}
              maxLength={3}
              className="mt-1 w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm ui-num"
            />
          </label>
        </div>
        <label className="block text-xs font-medium text-muted-foreground">
          مرجع التحويل/الإيصال
          <input
            value={attestation.reference}
            onChange={e => setAttestation(a => ({ ...a, reference: e.target.value }))}
            placeholder="رقم العملية أو مرجع الإيصال"
            className="mt-1 w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          طريقة الدفع (اختياري)
          <input
            value={attestation.method}
            onChange={e => setAttestation(a => ({ ...a, method: e.target.value }))}
            placeholder="manual_transfer"
            className="mt-1 w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={approve}
        disabled={busy || attestation.reference.trim().length < 3}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? 'جارٍ المعالجة...' : 'تسجيل الإقرار والموافقة وإصدار الأكواد'}
      </button>
      <div className="border-t border-border pt-3 space-y-2">
        <label htmlFor="request-reject-reason" className="block text-xs font-medium text-muted-foreground">
          سبب الرفض (إلزامي)
        </label>
        <input
          id="request-reject-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="سبب الرفض (إلزامي)"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm"
        />
        <button
          type="button"
          onClick={reject}
          disabled={busy || reason.length < 3}
          className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          رفض الطلب
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
