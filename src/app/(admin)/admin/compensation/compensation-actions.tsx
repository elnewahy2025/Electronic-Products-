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
    <div className="flex items-center gap-2">
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="السبب"
        className="border rounded p-1 text-xs w-32"
      />
      <button
        onClick={() => decide('approve')}
        disabled={busy || reason.length < 3}
        className="bg-green-600 text-white rounded px-2 py-1 text-xs disabled:opacity-50"
      >
        موافقة
      </button>
      <button
        onClick={() => decide('reject')}
        disabled={busy || reason.length < 3}
        className="bg-red-600 text-white rounded px-2 py-1 text-xs disabled:opacity-50"
      >
        رفض
      </button>
    </div>
  );
}