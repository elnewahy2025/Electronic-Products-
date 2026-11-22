'use client';

import { useState, useRef } from 'react';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    let remaining = 8 - images.length;
    const added: GalleryImage[] = [];

    for (const file of Array.from(files)) {
      if (remaining <= 0) {
        setError('تم الوصول إلى الحد الأقصى (8 صور للمنتج).');
        break;
      }

      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`/api/seller/products/${productId}/gallery`, {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();

      if (!res.ok) {
        const map: Record<string, string> = {
          gallery_limit_reached: 'وصلت الحد الأقصى (8 صور).',
          image_too_large: 'حجم الصورة يتجاوز الحد الأقصى (5 ميجابايت).',
          invalid_image: 'الملف المرفوع ليس صورة صالحة.',
          unsupported_image_format: 'صيغة الصورة غير مدعومة (JPG/PNG/WebP/AVIF).',
        };
        setError(map[json.error] ?? json.error ?? 'فشل رفع الصورة.');
        break;
      }

      added.push(json);
      remaining--;
    }

    if (added.length > 0) {
      setImages(prev => [...prev, ...added]);
      router.refresh();
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm('حذف هذه الصورة من المعرض والتخزين؟')) return;
    setBusy(true);
    setError(null);
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
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">رفع صور للمعرض</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              يتم ضغط الصور وتحويلها تلقائيًا إلى WebP (بحد أقصى 5 ميجابايت للصورة، وحتى 8 صور).
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground tabular-nums bg-muted px-2.5 py-1 rounded-lg">
            {images.length}/8
          </span>
        </div>

        <label
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
            images.length >= 8 || busy
              ? 'opacity-50 pointer-events-none border-border bg-muted/30'
              : 'border-border hover:border-primary/50 hover:bg-accent/20'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            disabled={busy || images.length >= 8}
            onChange={e => handleFiles(e.target.files)}
            className="hidden"
          />
          <span className="text-sm font-medium text-primary">
            {busy ? 'جارٍ المعالجة والرفع...' : 'اختر صورة أو عدة صور للرفع'}
          </span>
          <span className="text-xs text-muted-foreground mt-1">
            JPG, PNG, WebP, AVIF — تُحفظ مباشرة في Supabase Storage
          </span>
        </label>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {images.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground text-sm">
          لا توجد صور في المعرض بعد.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((img, idx) => (
            <div key={img.id} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="aspect-video bg-muted">
                <img
                  src={img.url}
                  alt={`صورة ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-2.5 flex items-center justify-between gap-1 text-xs border-t border-border/60">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(img.id, -1)}
                    disabled={idx === 0 || busy}
                    className="border border-border rounded-md px-2 py-0.5 hover:bg-muted disabled:opacity-30"
                    title="تقديم"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(img.id, 1)}
                    disabled={idx === images.length - 1 || busy}
                    className="border border-border rounded-md px-2 py-0.5 hover:bg-muted disabled:opacity-30"
                    title="تأخير"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  disabled={busy}
                  className="text-red-600 hover:underline font-medium"
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
