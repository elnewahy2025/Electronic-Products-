'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PayoutActions({ payoutId, status }: { payoutId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [ref, setRef] = useState('');
  const router = useRouter();

  async function call(path: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    const res = await fetch(`/api/admin/payouts/${payoutId}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (status === 'requested') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          onClick={() => call('approve')}
          disabled={busy}
          className="ui-badge ui-badge-green rounded-lg px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          موافقة
        </button>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="سبب الرفض"
          aria-label="سبب الرفض"
          className="w-28 min-w-0 bg-background border border-border rounded-lg px-2.5 py-1 text-xs"
        />
        <button
          onClick={() => call('reject', { reason })}
          disabled={busy || reason.length < 3}
          className="ui-badge ui-badge-red rounded-lg px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          رفض
        </button>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <input
          value={ref}
          onChange={e => setRef(e.target.value)}
          placeholder="مرجع التحويل"
          aria-label="مرجع التحويل"
          className="w-28 min-w-0 bg-background border border-border rounded-lg px-2.5 py-1 text-xs"
        />
        <button
          onClick={() => call('paid', { reference: ref })}
          disabled={busy || ref.length < 3}
          className="rounded-lg bg-primary text-primary-foreground px-2.5 py-1 text-xs font-medium transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          تأكيد الدفع
        </button>
      </div>
    );
  }

  return null;
}
