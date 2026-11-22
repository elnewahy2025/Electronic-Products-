'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  mode: 'create' | 'edit';
  productId?: string;
  initial?: {
    title: string;
    short_description: string | null;
    description: string | null;
    price_amount: number;
    price_currency: string;
    category_id: string | null;
    cover_image_url?: string | null;
  };
  categories: { id: string; name: string }[];
  minPrice: number;
  minPriceCurrency: string;
};

const CURRENCIES = ['USD', 'EGP', 'SAR', 'KWD'];

export function ProductForm({ mode, productId, initial, categories, minPrice, minPriceCurrency }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [shortDescription, setShortDescription] = useState(initial?.short_description ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price_amount?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.price_currency ?? 'USD');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.cover_image_url ?? '');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverInfo, setCoverInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function uploadCover(file: File | null) {
    if (!file) return;
    setUploadingCover(true);
    setError(null);
    setCoverInfo(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'cover');

    const res = await fetch('/api/seller/images/upload', {
      method: 'POST',
      body: fd,
    });
    const json = await res.json();
    setUploadingCover(false);

    if (!res.ok) {
      const map: Record<string, string> = {
        image_too_large: 'حجم صورة الغلاف يتجاوز 5 ميجابايت.',
        invalid_image: 'الملف المرفوع ليس صورة صالحة.',
        unsupported_image_format: 'صيغة غير مدعومة (JPG/PNG/WebP/AVIF).',
      };
      return setError(map[json.error] ?? json.error ?? 'فشل رفع صورة الغلاف.');
    }

    setCoverImageUrl(json.url);
    setCoverInfo(`تم التحسين إلى WebP (${json.width}×${json.height} — ${Math.round(json.sizeBytes / 1024)} KB)`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);

    const payload = {
      title: title.trim(),
      short_description: shortDescription.trim() || null,
      description: description.trim() || null,
      price_amount: parseFloat(price),
      price_currency: currency,
      category_id: categoryId || null,
      cover_image_url: coverImageUrl.trim() || null,
    };

    const url = mode === 'create'
      ? '/api/seller/products'
      : `/api/seller/products/${productId}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) {
      const msgMap: Record<string, string> = {
        below_min_price: `السعر يجب أن يكون ${minPrice} ${minPriceCurrency} على الأقل`,
        title_too_short: 'العنوان قصير جدًا',
        invalid_price: 'سعر غير صالح',
      };
      return setError(msgMap[json.error] ?? json.error ?? 'حدث خطأ');
    }

    if (mode === 'create') {
      router.push(`/seller/products/${json.id}`);
    } else {
      router.push('/seller/products');
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border rounded p-4 space-y-4">
      <div>
        <label className="block text-sm mb-1">العنوان *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={200}
          className="w-full border rounded p-2 text-sm"
          placeholder="مثال: عرض PowerPoint عن الفيزياء"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">وصف قصير</label>
        <input
          value={shortDescription}
          onChange={e => setShortDescription(e.target.value)}
          maxLength={300}
          className="w-full border rounded p-2 text-sm"
          placeholder="جملة واحدة تشرح المنتج"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">الوصف الكامل</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={6}
          maxLength={5000}
          className="w-full border rounded p-2 text-sm"
          placeholder="تفاصيل المنتج..."
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">صورة الغلاف (اختياري)</label>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 border border-border rounded-xl px-4 py-2 text-sm font-medium cursor-pointer hover:bg-muted transition">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={uploadingCover}
              onChange={e => uploadCover(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <span>{uploadingCover ? 'جارٍ المعالجة والرفع...' : coverImageUrl ? 'تغيير صورة الغلاف' : 'رفع صورة غلاف'}</span>
          </label>
          {coverImageUrl && (
            <button
              type="button"
              onClick={() => {
                setCoverImageUrl('');
                setCoverInfo(null);
              }}
              className="text-xs text-red-600 hover:underline"
            >
              إزالة الغلاف
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          تُرفع مباشرة إلى Supabase Storage وتُضغط تلقائيًا بصيغة WebP (الحد الأقصى 5 ميجابايت).
        </p>
        {coverInfo && <p className="text-xs text-emerald-700">{coverInfo}</p>}
        {coverImageUrl && (
          <img
            src={coverImageUrl}
            alt="معاينة الغلاف"
            className="mt-2 max-h-40 rounded-xl border border-border object-cover"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm mb-1">السعر *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={price}
            onChange={e => setPrice(e.target.value)}
            required
            className="w-full border rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">العملة</label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="w-full border rounded p-2 text-sm"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {currency === minPriceCurrency && minPrice > 0 && (
        <p className="text-xs text-muted-foreground">
          الحد الأدنى للسعر: {minPrice} {minPriceCurrency}
        </p>
      )}

      <div>
        <label className="block text-sm mb-1">التصنيف</label>
        <select
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          className="w-full border rounded p-2 text-sm"
        >
          <option value="">بدون تصنيف</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {'  '.repeat(c.depth ?? 0)}{(c.depth ?? 0) > 0 ? '└ ' : ''}{c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50">
          {busy ? 'جارٍ الحفظ...' : (mode === 'create' ? 'إنشاء المنتج' : 'حفظ التغييرات')}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="border rounded px-4 py-2 text-sm"
        >
          إلغاء
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {mode === 'create' && (
        <p className="text-xs text-muted-foreground">
          بعد الإنشاء، ستنتقل لصفحة المنتج لإضافة إصدار وربط الملفات قبل النشر.
        </p>
      )}
    </form>
  );
}