'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SellerActions({ sellerId, status }: { sellerId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function call(path: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/sellers/${sellerId}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, ...extra }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? 'خطأ');
    router.refresh();
  }

  return (
    <div className="border rounded p-4 space-y-3">
      {status === 'pending' && (
        <>
          <button onClick={() => call('approve')} disabled={busy} className="bg-green-600 text-white rounded px-4 py-2 disabled:opacity-50">
            الموافقة على البائع
          </button>
          <div className="border-t pt-3 space-y-2">
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="سبب الرفض (إلزامي)"
              className="w-full border rounded p-2 text-sm"
            />
            <button onClick={() => call('reject')} disabled={busy || reason.length < 3} className="bg-red-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
              رفض
            </button>
          </div>
        </>
      )}

      {status === 'approved' && (
        <div className="space-y-2">
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="سبب الإيقاف (إلزامي)"
            className="w-full border rounded p-2 text-sm"
          />
          <button onClick={() => call('suspend')} disabled={busy || reason.length < 3} className="bg-red-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            إيقاف البائع
          </button>
        </div>
      )}

      {status === 'suspended' && (
        <button onClick={() => call('approve')} disabled={busy} className="bg-green-600 text-white rounded px-4 py-2">
          إعادة التفعيل
        </button>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}