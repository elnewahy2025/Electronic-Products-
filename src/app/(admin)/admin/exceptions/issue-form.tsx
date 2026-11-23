'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function IssueExceptionForm() {
  const [codeId, setCodeId] = useState('');
  const [reason, setReason] = useState('');
  const [granted, setGranted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/admin/exceptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code_id: codeId,
        reason,
        granted_attempts: parseInt(granted, 10),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    setCodeId(''); setReason(''); setGranted('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="ui-box space-y-4">
      <div>
        <h2 className="text-base font-bold text-foreground">إصدار استثناء يدوي</h2>
        <p className="text-xs text-muted-foreground mt-1">
          هذا الإجراء مسجّل في سجل التدقيق ويحتاج صلاحية Super Admin.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="exception-code-id" className="text-xs font-medium text-muted-foreground block">
          معرف الكود (UUID)
        </label>
        <input
          id="exception-code-id"
          value={codeId}
          onChange={e => setCodeId(e.target.value)}
          placeholder="معرف الكود (UUID)"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm font-mono"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="exception-granted" className="text-xs font-medium text-muted-foreground block">
          عدد المحاولات الإضافية
        </label>
        <input
          id="exception-granted"
          type="number"
          min="1"
          max="20"
          value={granted}
          onChange={e => setGranted(e.target.value)}
          placeholder="عدد المحاولات الإضافية"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm ui-num"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="exception-reason" className="text-xs font-medium text-muted-foreground block">
          السبب (إلزامي)
        </label>
        <textarea
          id="exception-reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="السبب (إلزامي)"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm"
          rows={2}
          required
          minLength={3}
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        إصدار
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
