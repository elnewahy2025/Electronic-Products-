'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProductModerationActions({
  productId,
  currentStatus,
}: {
  productId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [openAction, setOpenAction] = useState<'suspended' | 'rejected' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function applyStatus(status: 'published' | 'suspended' | 'rejected', note?: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/products/${productId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, reason: note }),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(json.error ?? 'تعذر تحديث الحالة');
      return;
    }

    setOpenAction(null);
    setReason('');
    router.refresh();
  }

  if (openAction) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="سبب الإجراء (3 أحرف على الأقل)"
          className="border border-red-200 bg-background rounded-lg px-2.5 py-1.5 text-xs w-52 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
        <button
          type="button"
          disabled={busy || reason.trim().length < 3}
          onClick={() => applyStatus(openAction, reason.trim())}
          className="bg-red-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? '...' : openAction === 'suspended' ? 'تأكيد الإيقاف' : 'تأكيد الرفض'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpenAction(null);
            setReason('');
            setError(null);
          }}
          className="border border-border rounded-lg px-2.5 py-1.5 text-xs hover:bg-muted"
        >
          إلغاء
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {currentStatus !== 'suspended' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpenAction('suspended')}
          className="text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          إيقاف إداري
        </button>
      )}
      {(currentStatus === 'suspended' || currentStatus === 'rejected' || currentStatus === 'paused') && (
        <button
          type="button"
          disabled={busy}
          onClick={() => applyStatus('published', 'reinstated_by_admin')}
          className="text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {busy ? '...' : 'إعادة النشر'}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
