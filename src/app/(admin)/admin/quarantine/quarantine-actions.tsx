'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function QuarantineActions({
  fileVersionId,
  fileName,
}: {
  fileVersionId: string;
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'release' | 'delete'>('release');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/files/${fileVersionId}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    setOpen(false);
    setReason('');
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex gap-2 text-xs">
        <button onClick={() => { setAction('release'); setOpen(true); }} className="text-green-700 hover:underline">
          إفراج
        </button>
        <button onClick={() => { setAction('delete'); setOpen(true); }} className="text-red-700 hover:underline">
          حذف نهائي
        </button>
      </div>
    );
  }

  return (
    <div className="border rounded p-2 space-y-1 w-56">
      <p className="text-xs font-medium">
        {action === 'release' ? `إفراج عن ${fileName.slice(0, 30)}…` : `حذف نهائي لـ ${fileName.slice(0, 30)}…`}
      </p>
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="السبب (إلزامي)"
        className="border rounded p-1 text-xs w-full"
        minLength={3}
      />
      <div className="flex gap-1">
        <button
          onClick={submit}
          disabled={busy || reason.trim().length < 3}
          className={`text-white rounded px-2 py-0.5 text-xs disabled:opacity-50 ${action === 'release' ? 'bg-green-600' : 'bg-red-600'}`}
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
