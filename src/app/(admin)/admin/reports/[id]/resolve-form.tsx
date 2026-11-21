'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ResolveForm({ reportId }: { reportId: string }) {
  const [resolution, setResolution] = useState<'resolved' | 'dismissed'>('resolved');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolution, note }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border rounded p-4 space-y-2">
      <h2 className="font-semibold">اتخاذ قرار</h2>
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={resolution === 'resolved'}
            onChange={() => setResolution('resolved')}
          />
          تم اتخاذ إجراء
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={resolution === 'dismissed'}
            onChange={() => setResolution('dismissed')}
          />
          رفض البلاغ
        </label>
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="ملاحظة القرار (إلزامية)"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        required
        minLength={3}
      />
      <button type="submit" disabled={busy || note.trim().length < 3} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50">
        حفظ القرار
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}