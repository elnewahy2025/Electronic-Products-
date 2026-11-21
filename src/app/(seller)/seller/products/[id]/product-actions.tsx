'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProductActions({
  productId,
  status,
  hasPublishedVersion,
}: {
  productId: string;
  status: string;
  hasPublishedVersion: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function call(path: string, method = 'POST') {
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/products/${productId}/${path}`, { method });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? 'خطأ');
    router.refresh();
  }

  async function del() {
    if (!confirm('هل أنت متأكد من حذف المنتج؟ لا يمكن التراجع.')) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/products/${productId}`, { method: 'DELETE' });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    router.push('/seller/products');
    router.refresh();
  }

  return (
    <div className="border rounded p-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === 'draft' && (
          <p className="text-xs text-muted-foreground">
            لن يظهر المنتج للمشترين حتى تنشر إصدارًا.
            {hasPublishedVersion && ' (لديك إصدار منشور بالفعل)'}
          </p>
        )}
        {status === 'published' && (
          <button onClick={() => call('unpublish')} disabled={busy} className="bg-orange-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
            إيقاف النشر
          </button>
        )}
        {(status === 'paused' || status === 'draft') && hasPublishedVersion && (
          <button onClick={() => call('reopen')} disabled={busy} className="bg-green-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
            استئناف النشر
          </button>
        )}
        <button onClick={del} disabled={busy} className="text-red-600 border border-red-200 rounded px-3 py-1.5 text-sm disabled:opacity-50">
          حذف المنتج
        </button>
      </div>
      {status === 'suspended' && (
        <p className="text-xs text-red-600">
          المنتج موقوف من قبل الإدارة. تواصل مع الدعم.
        </p>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}