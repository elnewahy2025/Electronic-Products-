'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Eye, CheckCircle2, Rocket } from 'lucide-react';
import { useToast } from '@/components/shared/toast-provider';
import { DrivePickerButton } from '@/components/seller/drive-picker-button';

type SellerFileOption = {
  file_version_id: string;
  name: string;
  extension: string | null;
  size_bytes: number;
  scan_status: string;
  is_linked: boolean;
};

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
  categories: { id: string; name: string; depth?: number }[];
  minPrice: number;
  minPriceCurrency: string;
  availableFiles?: SellerFileOption[];
};

const CURRENCIES = ['USD', 'EGP', 'SAR', 'KWD'];

function suggestTitleFromFile(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function suggestCategoryId(
  extension: string | null,
  categories: { id: string; name: string }[],
): string | null {
  const ext = (extension ?? '').toLowerCase();
  const hints: Record<string, string[]> = {
    pptx: ['عروض', 'تقديم', 'بوربوينت', 'powerpoint'],
    ppt: ['عروض', 'تقديم', 'بوربوينت'],
    docx: ['تحضير', 'دروس', 'مذكرات', 'كتب', 'ملخص'],
    doc: ['تحضير', 'دروس', 'مذكرات', 'كتب'],
    pdf: ['ملخص', 'كتب', 'مذكرات', 'دليل', 'أوراق'],
    xlsx: ['جداول', 'محاسب', 'إكسل', 'excel', 'قوالب'],
    xls: ['جداول', 'محاسب', 'إكسل'],
    mp4: ['فيديو', 'دورات', 'شروح'],
    png: ['تصميم', 'إنفوجرافيك', 'قوالب', 'صور'],
  };
  const keys = hints[ext] ?? [];
  for (const key of keys) {
    const found = categories.find(c => c.name.toLowerCase().includes(key));
    if (found) return found.id;
  }
  return null;
}

export function ProductForm({
  mode,
  productId,
  initial,
  categories,
  minPrice,
  minPriceCurrency,
  availableFiles = [],
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [shortDescription, setShortDescription] = useState(initial?.short_description ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price_amount?.toString() ?? (minPrice > 0 ? String(minPrice) : '10'));
  const [currency, setCurrency] = useState(initial?.price_currency ?? minPriceCurrency ?? 'USD');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.cover_image_url ?? '');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverInfo, setCoverInfo] = useState<string | null>(null);
  const [autoPreview, setAutoPreview] = useState<{
    dataUrl: string;
    variant: number;
    width: number;
    height: number;
    sizeBytes: number;
    sourceLabel?: string;
    isFirstPage?: boolean;
    watermarked?: boolean;
  } | null>(null);
  const [watermarkCover, setWatermarkCover] = useState(true);
  const [extractingPage, setExtractingPage] = useState(false);
  const [generatingAuto, setGeneratingAuto] = useState(false);
  const [approvingAuto, setApprovingAuto] = useState(false);
  const [busyMode, setBusyMode] = useState<'draft' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  function handleToggleFile(file: SellerFileOption, checked: boolean) {
    setSelectedFileIds(prev => {
      const next = checked
        ? [...prev, file.file_version_id]
        : prev.filter(id => id !== file.file_version_id);

      // Smart Auto-Fill when picking the first file
      if (checked && prev.length === 0) {
        if (!title.trim()) {
          const suggested = suggestTitleFromFile(file.name);
          if (suggested.length >= 3) setTitle(suggested);
        }
        if (!categoryId) {
          const suggestedCat = suggestCategoryId(file.extension, categories);
          if (suggestedCat) setCategoryId(suggestedCat);
        }
      }
      return next;
    });
  }

  async function extractFirstPageCover(watermarkOverride?: boolean) {
    const useWatermark = watermarkOverride ?? watermarkCover;
    setExtractingPage(true);
    setError(null);
    try {
      const res = await fetch('/api/seller/images/auto-cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'extract_first_page',
          product_id: productId ?? null,
          file_version_id: selectedFileIds[0] ?? null,
          apply_watermark: useWatermark,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const map: Record<string, string> = {
          NO_UPLOADED_FILE_FOR_COVER: 'اختر ملفاً أو استورده من Google Drive أولاً لاستخراج صفحته الأولى كغلاف.',
          DOCUMENT_THUMBNAIL_UNAVAILABLE: 'لم يجهّز Google Drive صورة مصغّرة لهذا الملف بعد. انتظر بضع ثوانٍ وحاول مجدداً.',
          DRIVE_NOT_LINKED: 'حساب Google Drive غير مرتبط.',
        };
        const msg = map[json.error] ?? json.error ?? 'تعذّر استخراج الصفحة الأولى من الملف.';
        setError(msg);
        toast.error(msg);
        return;
      }
      setAutoPreview({
        dataUrl: json.previewDataUrl,
        variant: 0,
        width: json.width,
        height: json.height,
        sizeBytes: json.sizeBytes,
        sourceLabel: `الصفحة الأولى من «${json.sourceFileName}»`,
        isFirstPage: true,
        watermarked: Boolean(json.watermarked),
      });
      toast.info('تم تجهيز معاينة الغلاف — راجعها ثم اضغط «اعتماد هذا الغلاف».');
    } catch {
      setError('تعذّر الاتصال بالخادم أثناء استخراج الصفحة الأولى.');
    } finally {
      setExtractingPage(false);
    }
  }

  async function requestAutoCoverPreview(nextVariant?: number) {
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) {
      setError('اكتب عنوان المنتج أولاً (3 أحرف على الأقل) لتوليد غلاف تلقائي.');
      return;
    }
    setGeneratingAuto(true);
    setError(null);
    const catName = categories.find(c => c.id === categoryId)?.name ?? null;
    const variant = nextVariant ?? (autoPreview ? (autoPreview.variant + 1) % 4 : 0);

    try {
      const res = await fetch('/api/seller/images/auto-cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: cleanTitle,
          short_description: shortDescription.trim() || null,
          description: description.trim() || null,
          category_name: catName,
          variant,
          action: 'preview',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'تعذّر توليد معاينة الغلاف.');
        return;
      }
      setAutoPreview({
        dataUrl: json.previewDataUrl,
        variant: json.variant,
        width: json.width,
        height: json.height,
        sizeBytes: json.sizeBytes,
      });
    } finally {
      setGeneratingAuto(false);
    }
  }

  async function approveAutoCover() {
    if (!autoPreview) return;
    setApprovingAuto(true);
    setError(null);

    try {
      const res = await fetch('/api/seller/images/auto-cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preview_data_url: autoPreview.dataUrl,
          action: 'approve',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'فشل اعتماد ورفع الغلاف.');
        return;
      }
      setCoverImageUrl(json.url);
      setCoverInfo(`تم اعتماد ورفع الغلاف (${json.width}×${json.height} — ${Math.round(json.sizeBytes / 1024)} KB)`);
      setAutoPreview(null);
      toast.success('تم اعتماد صورة الغلاف بنجاح.');
    } finally {
      setApprovingAuto(false);
    }
  }

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
      const msg = map[json.error] ?? json.error ?? 'فشل رفع صورة الغلاف.';
      toast.error(msg);
      return setError(msg);
    }

    setCoverImageUrl(json.url);
    setCoverInfo(`تم التحسين إلى WebP (${json.width}×${json.height} — ${Math.round(json.sizeBytes / 1024)} KB)`);
    toast.success('تم رفع صورة الغلاف بنجاح.');
  }

  async function saveProduct(publishNow: boolean) {
    setBusyMode(publishNow ? 'publish' : 'draft');
    setError(null);

    const payload = {
      title: title.trim(),
      short_description: shortDescription.trim() || null,
      description: description.trim() || null,
      price_amount: parseFloat(price),
      price_currency: currency,
      category_id: categoryId || null,
      cover_image_url: coverImageUrl.trim() || null,
      ...(mode === 'create' && selectedFileIds.length > 0
        ? { file_version_ids: selectedFileIds, publish_now: publishNow }
        : {}),
    };

    const url = mode === 'create'
      ? '/api/seller/products'
      : `/api/seller/products/${productId}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        const msgMap: Record<string, string> = {
          below_min_price: `السعر يجب أن يكون ${minPrice} ${minPriceCurrency} على الأقل`,
          title_too_short: 'العنوان قصير جدًا',
          invalid_price: 'سعر غير صالح',
        };
        const msg = msgMap[json.error] ?? json.error ?? 'حدث خطأ أثناء الحفظ.';
        setError(msg);
        toast.error(msg);
        return;
      }

      if (mode === 'create') {
        if (json.published) {
          toast.success('تم إنشاء المنتج ونشره فوراً في المتجر!');
          router.push('/seller/products');
        } else {
          toast.success('تم حفظ المنتج كمسودة بنجاح.');
          router.push(`/seller/products/${json.id}`);
        }
      } else {
        toast.success('تم حفظ التغييرات بنجاح.');
        router.push('/seller/products');
      }
      router.refresh();
    } finally {
      setBusyMode(null);
    }
  }

  const busy = busyMode !== null;
  const selectedCategoryName = categories.find(c => c.id === categoryId)?.name ?? null;
  const previewCover = autoPreview?.dataUrl || coverImageUrl || null;
  const selectedFiles = availableFiles.filter(f => selectedFileIds.includes(f.file_version_id));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={e => {
          e.preventDefault();
          void saveProduct(mode === 'create' && selectedFileIds.length > 0);
        }}
        className="xl:col-span-8 ui-box space-y-5"
      >
        {mode === 'create' && (
          <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.07] p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <label className="block text-sm font-bold">1. اختر ملفات المنتج (تعبئة ذكية تلقائية)</label>
                <p className="text-xs text-muted-foreground">
                  اختيار ملفك الجاهز يقترح العنوان والتصنيف تلقائياً ويمكّنك من النشر بضغطة واحدة.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <DrivePickerButton
                  label="استيراد من مجلد Store"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                  onError={msg => {
                    setError(msg);
                    toast.error(msg);
                  }}
                  onImported={items => {
                    const ok = items.filter(i => i.status === 'imported' || i.status === 'already_imported').length;
                    if (ok > 0) {
                      toast.success(`تم استيراد ${ok} ملف من Google Drive — جارٍ تحديث القائمة...`);
                      router.refresh();
                    }
                  }}
                />
                <Link
                  href="/seller/upload"
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
                >
                  رفع من جهازك
                </Link>
              </div>
            </div>

            {availableFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                لا توجد ملفات في مكتبتك بعد. استورد من مجلد Store بالأعلى أو{' '}
                <Link href="/seller/upload" className="text-primary underline">
                  ارفع ملفاً من جهازك
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pt-1">
                {availableFiles.map(f => {
                  const isReady = f.scan_status === 'ready';
                  const checked = selectedFileIds.includes(f.file_version_id);
                  return (
                    <label
                      key={f.file_version_id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition ${
                        isReady
                          ? checked
                            ? 'border-emerald-600 bg-emerald-500/10 cursor-pointer'
                            : 'border-border bg-card hover:bg-muted/60 cursor-pointer'
                          : 'border-border bg-muted/40 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          disabled={!isReady}
                          checked={checked}
                          onChange={e => handleToggleFile(f, e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-emerald-600 shrink-0"
                        />
                        <span className="font-medium truncate">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground ui-num">
                          {(f.size_bytes / 1024).toFixed(0)} KB · {f.extension ?? 'file'}
                        </span>
                        {isReady ? (
                          <span className="ui-badge ui-badge-green">جاهز</span>
                        ) : (
                          <span className="ui-badge ui-badge-amber">قيد التجهيز</span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">العنوان *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                minLength={3}
                maxLength={200}
                className="w-full border border-border rounded-xl p-2.5 text-sm"
                placeholder="مثال: عرض PowerPoint تفاعلي عن الفيزياء"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">التصنيف</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full border border-border rounded-xl p-2.5 text-sm"
              >
                <option value="">بدون تصنيف</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {'  '.repeat(c.depth ?? 0)}{(c.depth ?? 0) > 0 ? '└ ' : ''}{c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">وصف قصير</label>
            <input
              value={shortDescription}
              onChange={e => setShortDescription(e.target.value)}
              maxLength={300}
              className="w-full border border-border rounded-xl p-2.5 text-sm"
              placeholder="جملة واضحة تشرح قيمة المنتج للمشتري"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">الوصف الكامل</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              maxLength={5000}
              className="w-full border border-border rounded-xl p-2.5 text-sm"
              placeholder="تفاصيل المحتوى، عدد الصفحات أو الشرائح، ولمن يناسب هذا المنتج..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">السعر *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                required
                className="w-full border border-border rounded-xl p-2.5 text-sm ui-num"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">العملة</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full border border-border rounded-xl p-2.5 text-sm"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {currency === minPriceCurrency && minPrice > 0 && (
            <p className="text-xs text-muted-foreground">
              الحد الأدنى للسعر: <span className="ui-num">{minPrice} {minPriceCurrency}</span>
            </p>
          )}
        </div>

        <div className="space-y-2.5 pt-2 border-t border-border">
          <label className="block text-sm font-semibold">صورة الغلاف (اختياري — تُستخدم معاينة الملف تلقائياً إن تُركت فارغة)</label>
          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="inline-flex items-center gap-2 border border-border rounded-xl px-3.5 py-2 text-xs font-medium cursor-pointer hover:bg-muted transition">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={uploadingCover}
                onChange={e => uploadCover(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <span>{uploadingCover ? 'جارٍ الرفع...' : coverImageUrl ? 'تغيير صورة الغلاف' : 'رفع صورة غلاف'}</span>
            </label>
            <button
              type="button"
              onClick={() => extractFirstPageCover()}
              disabled={extractingPage || generatingAuto || uploadingCover || approvingAuto}
              className="inline-flex items-center gap-1.5 border border-primary/40 bg-accent text-accent-foreground rounded-xl px-3.5 py-2 text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{extractingPage ? 'جارٍ الاستخراج...' : 'استخراج الصفحة الأولى من الملف كغلاف'}</span>
            </button>
            <button
              type="button"
              onClick={() => requestAutoCoverPreview()}
              disabled={generatingAuto || extractingPage || uploadingCover || approvingAuto}
              className="inline-flex items-center gap-1.5 border border-border bg-card text-foreground rounded-xl px-3.5 py-2 text-xs font-medium hover:bg-muted transition disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{generatingAuto ? 'جارٍ التوليد...' : 'توليد غلاف بالذكاء الاصطناعي'}</span>
            </button>
            {coverImageUrl && (
              <button
                type="button"
                onClick={() => {
                  setCoverImageUrl('');
                  setCoverInfo(null);
                }}
                className="text-xs text-destructive hover:underline"
              >
                إزالة الغلاف
              </button>
            )}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={watermarkCover}
              disabled={extractingPage || approvingAuto}
              onChange={e => {
                const next = e.target.checked;
                setWatermarkCover(next);
                if (autoPreview?.isFirstPage) {
                  void extractFirstPageCover(next);
                }
              }}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span>إضافة العلامة المائية للمنصة على الصفحة الأولى المستخرجة</span>
          </label>

          {autoPreview && (
            <div className="rounded-xl border border-warning bg-warning-soft/50 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-foreground">
                    {autoPreview.sourceLabel
                      ? `معاينة ${autoPreview.sourceLabel} — بانتظار اعتمادك`
                      : 'معاينة الغلاف المقترح — بانتظار اعتمادك'}
                  </p>
                  {autoPreview.isFirstPage && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        autoPreview.watermarked
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {autoPreview.watermarked ? 'مختوم بالعلامة المائية' : 'بدون علامة مائية'}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground ui-num">
                  {autoPreview.width}×{autoPreview.height} · {Math.round(autoPreview.sizeBytes / 1024)} KB
                </span>
              </div>
              <img
                src={autoPreview.dataUrl}
                alt="معاينة الغلاف التلقائي"
                className="max-h-48 rounded-xl border border-border object-cover"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={approveAutoCover}
                  disabled={approvingAuto}
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-semibold hover:opacity-95 disabled:opacity-50"
                >
                  {approvingAuto ? 'جارٍ الاعتماد...' : 'اعتماد هذا الغلاف'}
                </button>
                {!autoPreview.isFirstPage && (
                  <button
                    type="button"
                    onClick={() => requestAutoCoverPreview((autoPreview.variant + 1) % 4)}
                    disabled={generatingAuto || approvingAuto}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    تجربة تصميم آخر
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAutoPreview(null)}
                  disabled={approvingAuto}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  رفض وإلغاء
                </button>
              </div>
            </div>
          )}

          {coverInfo && <p className="text-xs text-emerald-700 dark:text-emerald-300">{coverInfo}</p>}
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2.5 flex-wrap pt-2 border-t border-border">
          {mode === 'create' ? (
            <>
              <button
                type="submit"
                disabled={busy || selectedFileIds.length === 0}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-95 transition disabled:opacity-50"
                title={selectedFileIds.length === 0 ? 'اختر ملفاً واحداً على الأقل للنشر الفوري' : undefined}
              >
                <Rocket className="h-4 w-4" />
                <span>{busyMode === 'publish' ? 'جارٍ النشر...' : 'نشر المنتج فوراً في المتجر'}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveProduct(false)}
                className="border border-border bg-card rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition disabled:opacity-50"
              >
                {busyMode === 'draft' ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-95 transition disabled:opacity-50"
            >
              {busy ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-2"
          >
            إلغاء
          </button>
        </div>
      </form>

      {/* Left Column: Live Storefront Card Preview */}
      <aside className="xl:col-span-4 xl:sticky xl:top-20 space-y-3">
        <div className="ui-box space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-muted-foreground">معاينة حية كما يراها المشتري</h2>
            <span className="ui-badge ui-badge-blue">معاينة فورية</span>
          </div>

          <div className="rounded-[14px] border border-border bg-card overflow-hidden">
            <div className="aspect-[16/10] bg-brand flex items-center justify-center overflow-hidden">
              {previewCover ? (
                <img
                  src={previewCover}
                  alt={title || 'معاينة الغلاف'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm font-medium text-brand-foreground/75">
                  {selectedFileIds.length > 0
                    ? 'ستُستخدم معاينة الملف تلقائياً كغلاف'
                    : 'صورة غلاف المنتج'}
                </span>
              )}
            </div>
            <div className="p-4 space-y-2">
              {selectedCategoryName && (
                <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {selectedCategoryName}
                </span>
              )}
              <h3 className="font-bold text-base leading-snug line-clamp-2">
                {title.trim() || 'عنوان منتجك الرقمي سيظهر هنا'}
              </h3>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {shortDescription.trim() || 'الوصف القصير يشرح فائدة المنتج للمشتري بوضوح.'}
              </p>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-base font-bold ui-num">
                  {Number(price) > 0 ? Number(price).toFixed(2) : '0.00'} {currency}
                </span>
                <span className="text-xs text-primary font-semibold">معاينة ←</span>
              </div>
            </div>
          </div>

          {mode === 'create' && (
            <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>ملخص الجاهزية للنشر ({selectedFiles.length} ملف)</span>
              </div>
              {selectedFiles.length === 0 ? (
                <p className="text-muted-foreground">
                  اختر ملفاً واحداً على الأقل لتفعيل زر «نشر المنتج فوراً في المتجر».
                </p>
              ) : (
                <ul className="space-y-1 text-muted-foreground">
                  {selectedFiles.map(f => (
                    <li key={f.file_version_id} className="truncate">
                      • {f.name} <span className="ui-num">({(f.size_bytes / 1024).toFixed(0)} KB)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
