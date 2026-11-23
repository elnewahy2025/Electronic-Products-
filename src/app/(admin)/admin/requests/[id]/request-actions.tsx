'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type IssuedCode = { code_id: string; code_prefix: string; plaintext: string };

export function RequestActions({ requestId }: { requestId: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode[] | null>(null);
  const router = useRouter();

  async function approve() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/approve`, { method: 'POST' });
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
      <button
        type="button"
        onClick={approve}
        disabled={busy}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? 'جارٍ المعالجة...' : 'الموافقة وإصدار الأكواد'}
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
