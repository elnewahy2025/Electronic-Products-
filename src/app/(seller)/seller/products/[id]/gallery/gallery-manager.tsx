'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type GalleryImage = { id: string; url: string; sort_order: number };

export function GalleryManager({
  productId,
  initial,
}: {
  productId: string;
  initial: GalleryImage[];
}) {
  const [images, setImages] = useState(initial);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function add() {
    const trimmed = url.trim();
    if (!trimmed || !trimmed.startsWith('http')) {
      return setError('الرابط يجب أن يبدأ بـ http(s)://');
    }
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/products/${productId}/gallery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: trimmed }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        gallery_limit_reached: 'وصلت الحد الأقصى (8 صور).',
        invalid_url: 'رابط غير صالح.',
      };
      return setError(map[json.error] ?? json.error ?? 'خطأ');
    }
    setUrl('');
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('حذف هذه الصورة من المعرض؟')) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/seller/products/${productId}/gallery/${id}`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json();
      return setError(json.error ?? 'خطأ');
    }
    setImages(prev => prev.filter(i => i.id !== id));
    router.refresh();
  }

  async function move(id: string, direction: -1 | 1) {
    const idx = images.findIndex(i => i.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= images.length) return;

    const next = [...images];
    [next[idx], next[target]] = [next[target], next[idx]];
    const reordered = next.map((img, i) => ({ ...img, sort_order: i }));
    setImages(reordered);

    await fetch(`/api/seller/products/${productId}/gallery/reorder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        order: reordered.map(i => ({ id: i.id, sort_order: i.sort_order })),
      }),
    });
  }

  return (
    <div className="space-y-4">
      <div className="border rounded p-4 space-y-2">
        <label className="block text-sm mb-1">إضافة صورة</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            dir="ltr"
            className="flex-1 border rounded p-2 text-sm"
            disabled={images.length >= 8}
          />
          <button
            onClick={add}
            disabled={busy || !url.trim() || images.length >= 8}
            className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            إضافة
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {images.length}/8 صور — الصور تُعرض بترتيبها هنا.
        </p>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>

      {images.length === 0 ? (
        <div className="border rounded p-8 text-center text-muted-foreground">
          لا صور في المعرض بعد.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {images.map((img, idx) => (
            <div key={img.id} className="border rounded overflow-hidden group">
              <div className="aspect-video bg-muted">
                <img
                  src={img.url}
                  alt={`صورة ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-2 flex items-center justify-between gap-1 text-xs">
                <div className="flex gap-1">
                  <button
                    onClick={() => move(img.id, -1)}
                    disabled={idx === 0 || busy}
                    className="border rounded px-1.5 py-0.5 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(img.id, 1)}
                    disabled={idx === images.length - 1 || busy}
                    className="border rounded px-1.5 py-0.5 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
                <button
                  onClick={() => remove(img.id)}
                  disabled={busy}
                  className="text-red-600"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
