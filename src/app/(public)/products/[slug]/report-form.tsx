'use client';

import { useState } from 'react';

export function ReportForm({
  entityType,
  entityId,
}: {
  entityType: 'product' | 'review' | 'seller';
  entityId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, reason }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(json.error);
    setMsg('تم إرسال البلاغ');
    setReason('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:underline"
      >
        إبلاغ عن محتوى مخالف
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="border rounded p-3 space-y-2">
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="اشرح سبب البلاغ (5 أحرف على الأقل)"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        required
        minLength={5}
      />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || reason.trim().length < 5} className="bg-red-600 text-white rounded px-3 py-1 text-xs disabled:opacity-50">
          إرسال
        </button>
        <button type="button" onClick={() => setOpen(false)} className="border rounded px-3 py-1 text-xs">
          إلغاء
        </button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </form>
  );
}