'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type FlatCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  depth: number;
  cover_image_url: string | null;
  cover_storage_path: string | null;
};

export function CategoryManager({ initial }: { initial: FlatCategory[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<FlatCategory | null>(null);
  const [deleting, setDeleting] = useState<FlatCategory | null>(null);
  const [orderDraft, setOrderDraft] = useState<FlatCategory[] | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const list = orderDraft ?? initial;

  function moveWithinSiblings(id: string, direction: -1 | 1) {
    setOrderDraft(current => {
      if (!current) return current;
      const item = current.find(c => c.id === id);
      if (!item) return current;
      const siblingIndexes = current
        .map((c, index) => ({ c, index }))
        .filter(({ c }) => c.parent_id === item.parent_id)
        .map(({ index }) => index);
      const position = siblingIndexes.indexOf(current.findIndex(c => c.id === id));
      const targetPosition = position + direction;
      if (position < 0 || targetPosition < 0 || targetPosition >= siblingIndexes.length) return current;
      const next = [...current];
      const from = siblingIndexes[position];
      const to = siblingIndexes[targetPosition];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  async function saveOrder() {
    if (!orderDraft) return;
    setReorderBusy(true);
    setReorderError(null);

    const counters = new Map<string, number>();
    const updated = orderDraft.flatMap(c => {
      const key = c.parent_id ?? '__root__';
      const sortOrder = counters.get(key) ?? 0;
      counters.set(key, sortOrder + 1);
      return sortOrder === c.sort_order ? [] : [{ id: c.id, sort_order: sortOrder }];
    });

    if (updated.length === 0) {
      setOrderDraft(null);
      setReorderBusy(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/categories/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: updated }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'REORDER_FAILED');
      setOrderDraft(null);
      router.refresh();
    } catch (e: any) {
      setReorderError(e?.message ?? 'REORDER_FAILED');
    } finally {
      setReorderBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">التصنيفات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {list.length} تصنيف
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {orderDraft ? (
            <>
              <button
                onClick={saveOrder}
                disabled={reorderBusy}
                className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                {reorderBusy ? '...' : 'حفظ الترتيب'}
              </button>
              <button
                onClick={() => { setOrderDraft(null); setReorderError(null); }}
                disabled={reorderBusy}
                className="border rounded px-4 py-2 text-sm"
              >
                إلغاء
              </button>
            </>
          ) : (
            <button
              onClick={() => { setOrderDraft([...initial]); setReorderError(null); }}
              className="border rounded px-4 py-2 text-sm"
            >
              ترتيب جماعي
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            disabled={Boolean(orderDraft)}
            className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            + تصنيف جديد
          </button>
        </div>
      </div>

      {reorderError && <p className="text-sm text-red-600">{reorderError}</p>}

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">الاسم</th>
              <th className="text-right p-3">الرابط</th>
              <th className="text-right p-3">المنتجات</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">الترتيب</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  لا توجد تصنيفات بعد. أضف أول تصنيف.
                </td>
              </tr>
            )}
            {list.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-3">
                  <div style={{ paddingRight: `${c.depth * 20}px` }} className="flex items-center gap-2">
                    {c.depth > 0 && <span className="text-muted-foreground">└─</span>}
                    {c.cover_image_url && (
                      <img
                        src={c.cover_image_url}
                        alt=""
                        width={40}
                        height={24}
                        className="h-6 w-10 shrink-0 rounded border object-cover"
                      />
                    )}
                    <span className="font-medium">{c.name}</span>
                  </div>
                </td>
                <td className="p-3 text-xs font-mono text-muted-foreground">{c.slug}</td>
                <td className="p-3 text-xs">{c.product_count}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    c.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {c.is_active ? 'مفعّل' : 'معطّل'}
                  </span>
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {orderDraft ? siblingPosition(list, c).index + 1 : c.sort_order}
                </td>
                <td className="p-3">
                  {orderDraft ? (
                    <div className="flex gap-2">
                      {(() => {
                        const sibling = siblingPosition(list, c);
                        return (
                          <>
                            <button
                              onClick={() => moveWithinSiblings(c.id, -1)}
                              disabled={reorderBusy || sibling.index <= 0}
                              aria-label={`نقل ${c.name} إلى أعلى`}
                              className="border rounded px-2 py-1 text-xs disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveWithinSiblings(c.id, 1)}
                              disabled={reorderBusy || sibling.index === sibling.count - 1}
                              aria-label={`نقل ${c.name} إلى أسفل`}
                              className="border rounded px-2 py-1 text-xs disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(c)}
                        className="text-primary text-xs"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => setDeleting(c)}
                        className="text-red-600 text-xs"
                      >
                        حذف
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CategoryDialog
          mode="create"
          categories={list}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); router.refresh(); }}
        />
      )}

      {editing && (
        <CategoryDialog
          mode="edit"
          categories={list}
          editing={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); router.refresh(); }}
        />
      )}

      {deleting && (
        <DeleteDialog
          category={deleting}
          categories={list.filter(c => c.id !== deleting.id && !isDescendant(list, deleting.id, c.id))}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function siblingPosition(all: FlatCategory[], category: FlatCategory): { index: number; count: number } {
  const ids = all.filter(c => c.parent_id === category.parent_id).map(c => c.id);
  return { index: ids.indexOf(category.id), count: ids.length };
}

function isDescendant(all: FlatCategory[], ancestorId: string, candidateId: string): boolean {
  let current = all.find(c => c.id === candidateId);
  let depth = 0;
  while (current?.parent_id && depth < 100) {
    if (current.parent_id === ancestorId) return true;
    current = all.find(c => c.id === current!.parent_id);
    depth++;
  }
  return false;
}

// ─── Create / Edit Dialog ─────────────────────────────────

function CategoryDialog({
  mode,
  categories,
  editing,
  onClose,
  onDone,
}: {
  mode: 'create' | 'edit';
  categories: FlatCategory[];
  editing?: FlatCategory;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [slug, setSlug] = useState(editing?.slug ?? '');
  const [parentId, setParentId] = useState(editing?.parent_id ?? '');
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(editing?.sort_order ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(editing?.cover_image_url ?? null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const router = useRouter();

  // Exclude self + descendants from parent options (for edit)
  const parentOptions = useMemo(() => {
    if (mode === 'create' || !editing) return categories;
    return categories.filter(c => c.id !== editing.id && !isDescendant(categories, editing.id, c.id));
  }, [categories, editing, mode]);

  async function uploadCover(file: File) {
    setCoverBusy(true); setCoverError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/admin/categories/${editing!.id}/cover`, {
        method: 'POST',
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'UPLOAD_FAILED');
      setCoverUrl(json.url);
      router.refresh();
    } catch (e: any) {
      setCoverError(e?.message ?? 'UPLOAD_FAILED');
    } finally {
      setCoverBusy(false);
    }
  }

  async function removeCover() {
    setCoverBusy(true); setCoverError(null);
    try {
      const res = await fetch(`/api/admin/categories/${editing!.id}/cover`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'REMOVE_FAILED');
      setCoverUrl(null);
      router.refresh();
    } catch (e: any) {
      setCoverError(e?.message ?? 'REMOVE_FAILED');
    } finally {
      setCoverBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      parent_id: parentId || null,
      is_active: isActive,
      sort_order: parseInt(sortOrder, 10) || 0,
    };
    if (mode === 'edit' && slug.trim() && slug.trim() !== editing?.slug) {
      payload.slug = slug.trim();
    }

    const url = mode === 'create'
      ? '/api/admin/categories'
      : `/api/admin/categories/${editing!.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) {
      const map: Record<string, string> = {
        name_too_short: 'الاسم قصير جدًا',
        name_too_long: 'الاسم طويل جدًا',
        slug_conflict: 'الرابط مستخدم بالفعل',
        category_cycle_detected: 'لا يمكن جعل التصنيف تابعًا لنفسه أو لأحد أبنائه',
        parent_not_found: 'التصنيف الأب غير موجود',
      };
      return setError(map[json.error] ?? json.error ?? 'حدث خطأ');
    }

    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-lg p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold">
          {mode === 'create' ? 'تصنيف جديد' : `تعديل: ${editing?.name}`}
        </h2>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs mb-1">الاسم *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              autoFocus
              className="w-full border rounded p-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs mb-1">الرابط (slug)</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="يُولّد تلقائيًا إذا تُرك فارغًا"
              dir="ltr"
              className="w-full border rounded p-2 text-sm font-mono"
            />
          </div>

          <div>
            <label htmlFor={mode === 'edit' ? 'category-cover-file' : undefined} className="block text-xs mb-1">صورة التصنيف (اختيارية)</label>
            <div className="flex items-start gap-3 rounded-lg border p-3 bg-muted/30">
              <div className="grid h-16 w-28 shrink-0 place-items-center overflow-hidden rounded-md border bg-brand text-[11px] text-brand-foreground/80">
                {coverUrl ? (
                  <img src={coverUrl} alt="" width={112} height={64} className="h-full w-full object-cover" />
                ) : (
                  'رسم تلقائي'
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  تظهر الصورة أعلى بطاقة التصنيف. بدون رفع صورة، سيُختار رسم مناسب لموضوع التصنيف تلقائيًا.
                </p>
                {mode === 'edit' ? (
                  <>
                    <input
                      id="category-cover-file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      disabled={coverBusy}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void uploadCover(file);
                      }}
                      className="block w-full text-xs"
                    />
                    {coverUrl && (
                      <button
                        type="button"
                        onClick={() => void removeCover()}
                        disabled={coverBusy}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        إزالة الصورة
                      </button>
                    )}
                    {coverBusy && <p className="text-xs" role="status">جارٍ تحديث الصورة...</p>}
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">تُضاف الصورة بعد إنشاء التصنيف.</p>
                )}
                {coverError && <p className="text-xs text-red-600" role="alert">{coverError}</p>}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1">التصنيف الأب</label>
            <select
              value={parentId}
              onChange={e => setParentId(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            >
              <option value="">بدون أب (تصنيف رئيسي)</option>
              {parentOptions.map(c => (
                <option key={c.id} value={c.id}>
                  {'  '.repeat(c.depth)}{c.depth > 0 ? '└ ' : ''}{c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1">الترتيب</label>
              <input
                type="number"
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value)}
                min="0"
                className="w-full border rounded p-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                />
                مفعّل
              </label>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="border rounded px-4 py-2 text-sm"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={busy || name.trim().length < 2}
              className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy ? '...' : (mode === 'create' ? 'إنشاء' : 'حفظ')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Dialog ────────────────────────────────────────

function DeleteDialog({
  category,
  categories,
  onClose,
  onDone,
}: {
  category: FlatCategory;
  categories: FlatCategory[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'block' | 'reassign'>('block');
  const [fallbackId, setFallbackId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDependents = category.product_count > 0;

  async function submit() {
    setBusy(true); setError(null);

    const res = await fetch(`/api/admin/categories/${category.id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode,
        fallback_category_id: mode === 'reassign' ? (fallbackId || null) : null,
      }),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) {
      const map: Record<string, string> = {
        category_has_dependents: 'التصنيف مرتبط بمنتجات أو تصنيفات فرعية. اختر إعادة التعيين أو احذف التبعيات أولًا.',
        invalid_fallback: 'التصنيف البديل غير صالح',
        fallback_not_found: 'التصنيف البديل غير موجود',
        fallback_inside_subtree: 'التصنيف البديل لا يمكن أن يكون داخل التصنيف المحذوف',
      };
      return setError(map[json.error] ?? json.error ?? 'حدث خطأ');
    }

    const msg = `تم الحذف.`;
    if (json.reassigned_products > 0) {
      alert(`${msg} أُعيد تعيين ${json.reassigned_products} منتج.`);
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-lg p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-red-700">حذف التصنيف</h2>
        <p className="text-sm">
          هل تريد حذف «<b>{category.name}</b>»؟
          {category.product_count > 0 && (
            <span className="text-red-600"> ({category.product_count} منتج مرتبط)</span>
          )}
        </p>

        {hasDependents && (
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={mode === 'block'}
                onChange={() => setMode('block')}
                className="mt-0.5"
              />
              <span>منع الحذف (سيفشل بسبب المنتجات المرتبطة)</span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={mode === 'reassign'}
                onChange={() => setMode('reassign')}
                className="mt-0.5"
              />
              <span>إعادة تعيين المنتجات والتصنيفات الفرعية إلى تصنيف بديل</span>
            </label>

            {mode === 'reassign' && (
              <select
                value={fallbackId}
                onChange={e => setFallbackId(e.target.value)}
                className="w-full border rounded p-2 text-sm mt-1"
              >
                <option value="">بدون تصنيف (تفكيك الارتباط)</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {'  '.repeat(c.depth)}{c.depth > 0 ? '└ ' : ''}{c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {!hasDependents && (
          <p className="text-xs text-muted-foreground">
            التصنيف فارغ، سيُحذف مباشرة.
          </p>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="border rounded px-4 py-2 text-sm"
          >
            إلغاء
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="bg-red-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy ? '...' : 'تأكيد الحذف'}
          </button>
        </div>
      </div>
    </div>
  );
}