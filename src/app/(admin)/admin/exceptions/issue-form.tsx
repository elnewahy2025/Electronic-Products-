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
    <form onSubmit={submit} className="border rounded p-4 space-y-2 max-w-xl">
      <h2 className="font-semibold">إصدار استثناء يدوي</h2>
      <p className="text-xs text-muted-foreground">
        هذا الإجراء مسجّل في سجل التدقيق ويحتاج صلاحية Super Admin.
      </p>
      <input
        value={codeId}
        onChange={e => setCodeId(e.target.value)}
        placeholder="معرف الكود (UUID)"
        className="w-full border rounded p-2 text-sm font-mono"
        required
      />
      <input
        type="number"
        min="1"
        max="20"
        value={granted}
        onChange={e => setGranted(e.target.value)}
        placeholder="عدد المحاولات الإضافية"
        className="w-full border rounded p-2 text-sm"
        required
      />
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="السبب (إلزامي)"
        className="w-full border rounded p-2 text-sm"
        rows={2}
        required
        minLength={3}
      />
      <button type="submit" disabled={busy} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50">
        إصدار
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}