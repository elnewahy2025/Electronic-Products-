'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ReviewForm({ productId }: { productId: string }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product_id: productId, rating, body }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border rounded p-4 space-y-3 bg-muted/20">
      <h3 className="font-semibold">أضف تقييمك</h3>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            type="button"
            onClick={() => setRating(i)}
            className={`text-2xl ${i <= rating ? 'text-yellow-500' : 'text-gray-300'}`}
          >
            ★
          </button>
        ))}
        <span className="text-sm text-muted-foreground mr-2">({rating}/5)</span>
      </div>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="شاركنا رأيك (اختياري)"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        maxLength={2000}
      />
      <button type="submit" disabled={busy} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50">
        {busy ? 'جارٍ...' : 'نشر التقييم'}
      </button>
      <p className="text-xs text-muted-foreground">
        لا يمكن تعديل أو حذف التقييم بعد النشر.
      </p>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}