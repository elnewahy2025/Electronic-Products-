'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SessionActions({
  sessionId, status, hasDelivery,
}: { sessionId: string; status: string; hasDelivery: boolean }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function call(path: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/downloads/${sessionId}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, ...extra }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? 'خطأ');
    router.refresh();
  }

  const canExtend = ['active', 'compensation_active'].includes(status);
  const canRevoke = !hasDelivery;
  const canCompensate = ['expired', 'expired_partial', 'exhausted'].includes(status);

  return (
    <div className="border rounded p-4 space-y-3">
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="السبب (إلزامي)"
        className="w-full border rounded p-2 text-sm"
      />

      {canExtend && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={hours}
            onChange={e => setHours(e.target.value)}
            placeholder="ساعات إضافية"
            min="1"
            max="168"
            className="border rounded p-2 text-sm w-32"
          />
          <button
            onClick={() => call('extend', { extra_hours: parseInt(hours, 10) })}
            disabled={busy || !hours || parseInt(hours, 10) <= 0}
            className="bg-blue-600 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            تمديد
          </button>
        </div>
      )}

      {canCompensate && (
        <button
          onClick={() => call('compensate')}
          disabled={busy || reason.length < 3}
          className="bg-green-600 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          فتح جلسة تعويضية (لا تستهلك محاولة)
        </button>
      )}

      {canRevoke && (
        <button
          onClick={() => call('revoke')}
          disabled={busy || reason.length < 3}
          className="bg-red-600 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          إلغاء الجلسة (قبل بدء التسليم فقط)
        </button>
      )}

      {hasDelivery && (
        <p className="text-xs text-red-600">
          بدأ التسليم في هذه الجلسة — لا يمكن إلغاؤها من أي دور.
        </p>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}