'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BackupActions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function trigger() {
    if (!confirm('بدء نسخة احتياطية يدوية؟')) return;
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/backup/manual', { method: 'POST' });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    router.refresh();
  }

  return (
    <div className="border rounded p-4 space-y-2">
      <button
        onClick={trigger}
        disabled={busy}
        className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {busy ? 'جارٍ البدء...' : 'تشغيل نسخة يدوية الآن'}
      </button>
      <p className="text-xs text-muted-foreground">
        النسخة اليدوية لا تلغي الجدول التلقائي. تُسجّل في سجل التدقيق.
      </p>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}