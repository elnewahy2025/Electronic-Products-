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
      <div className="flex gap-1 items-center">
        <button onClick={() => call('approve')} disabled={busy} className="text-xs bg-green-600 text-white rounded px-2 py-0.5 disabled:opacity-50">
          موافقة
        </button>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="سبب الرفض"
          className="border rounded px-1 py-0.5 text-xs w-28"
        />
        <button onClick={() => call('reject', { reason })} disabled={busy || reason.length < 3} className="text-xs bg-red-600 text-white rounded px-2 py-0.5 disabled:opacity-50">
          رفض
        </button>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="flex gap-1 items-center">
        <input
          value={ref}
          onChange={e => setRef(e.target.value)}
          placeholder="مرجع التحويل"
          className="border rounded px-1 py-0.5 text-xs w-28"
        />
        <button onClick={() => call('paid', { reference: ref })} disabled={busy || ref.length < 3} className="text-xs bg-primary text-primary-foreground rounded px-2 py-0.5 disabled:opacity-50">
          تأكيد الدفع
        </button>
      </div>
    );
  }

  return null;
}