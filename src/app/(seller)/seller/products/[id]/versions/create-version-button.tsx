'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateVersionButton({ productId }: { productId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/products/${productId}/versions`, { method: 'POST' });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    router.push(`/seller/products/${productId}/versions/${json.id}`);
  }

  return (
    <div>
      <button onClick={create} disabled={busy} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50">
        {busy ? 'جارٍ...' : '+ إصدار جديد'}
      </button>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}