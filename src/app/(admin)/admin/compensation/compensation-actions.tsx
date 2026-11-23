'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CompensationActions({ requestId }: { requestId: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const router = useRouter();

  async function decide(action: 'approve' | 'reject') {
    setBusy(true);
    const res = await fetch(`/api/admin/compensation/${requestId}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="السبب"
        aria-label="سبب قرار التعويض"
        className="w-full sm:w-auto bg-background border border-border rounded-lg px-2.5 py-1 text-xs"
      />
      <button
        type="button"
        onClick={() => decide('approve')}
        disabled={busy || reason.length < 3}
        className="rounded-lg bg-success-soft px-2.5 py-1 text-xs font-medium text-success transition hover:opacity-90 disabled:opacity-50"
      >
        موافقة
      </button>
      <button
        type="button"
        onClick={() => decide('reject')}
        disabled={busy || reason.length < 3}
        className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        رفض
      </button>
    </div>
  );
}
