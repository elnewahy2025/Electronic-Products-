'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ReviewActions({ reviewId }: { reviewId: string }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function doDelete() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-red-600 text-xs">
        حذف
      </button>
    );
  }

  return (
    <div className="border rounded p-2 space-y-1 w-48">
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="السبب (إلزامي)"
        className="border rounded p-1 text-xs w-full"
        required
        minLength={3}
      />
      <div className="flex gap-1">
        <button
          onClick={doDelete}
          disabled={busy || reason.length < 3}
          className="bg-red-600 text-white rounded px-2 py-0.5 text-xs disabled:opacity-50"
        >
          تأكيد
        </button>
        <button onClick={() => setOpen(false)} className="border rounded px-2 py-0.5 text-xs">
          إلغاء
        </button>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}