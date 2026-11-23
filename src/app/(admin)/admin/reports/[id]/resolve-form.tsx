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
    <form onSubmit={submit} className="ui-box space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">اتخاذ قرار</h2>
        <p className="text-xs text-muted-foreground">اختر القرار المناسب وأرفق ملاحظة توضيحية.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            checked={resolution === 'resolved'}
            onChange={() => setResolution('resolved')}
            className="accent-primary"
          />
          تم اتخاذ إجراء
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            checked={resolution === 'dismissed'}
            onChange={() => setResolution('dismissed')}
            className="accent-primary"
          />
          رفض البلاغ
        </label>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="resolution-note" className="block text-xs font-medium text-muted-foreground">
          ملاحظة القرار (إلزامية)
        </label>
        <textarea
          id="resolution-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="ملاحظة القرار (إلزامية)"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          rows={3}
          required
          minLength={3}
        />
      </div>

      <button
        type="submit"
        disabled={busy || note.trim().length < 3}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        حفظ القرار
      </button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
