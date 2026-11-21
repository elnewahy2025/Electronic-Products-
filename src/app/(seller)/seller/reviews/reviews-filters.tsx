'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ProductStat } from '@/lib/server/services/seller-review-service';

export function ReviewsFilters({
  perProduct,
  currentProduct,
  currentRating,
  onlyUnreplied,
  onlyDeleted,
}: {
  perProduct: ProductStat[];
  currentProduct?: string;
  currentRating?: string;
  onlyUnreplied: boolean;
  onlyDeleted: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/seller/reviews?${next.toString()}`);
  }

  function clearAll() {
    router.push('/seller/reviews');
  }

  const hasFilters = currentProduct || currentRating || onlyUnreplied || onlyDeleted;

  return (
    <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs mb-1 text-muted-foreground">المنتج</label>
          <select
            value={currentProduct ?? ''}
            onChange={e => update({ product: e.target.value || undefined })}
            className="w-full border rounded p-2 text-sm bg-background"
          >
            <option value="">كل المنتجات</option>
            {perProduct.map(p => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_title} ({p.total_reviews})
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[130px]">
          <label className="block text-xs mb-1 text-muted-foreground">التقييم</label>
          <select
            value={currentRating ?? ''}
            onChange={e => update({ rating: e.target.value || undefined })}
            className="w-full border rounded p-2 text-sm bg-background"
          >
            <option value="">كل التقييمات</option>
            {[5, 4, 3, 2, 1].map(r => (
              <option key={r} value={String(r)}>{r} نجمة</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={onlyUnreplied}
              onChange={e => update({ unreplied: e.target.checked ? '1' : undefined })}
            />
            بدون رد فقط
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={onlyDeleted}
              onChange={e => update({ deleted: e.target.checked ? '1' : undefined })}
            />
            المحذوفة
          </label>
        </div>

        {hasFilters && (
          <button onClick={clearAll} className="text-sm text-primary">
            مسح الفلاتر
          </button>
        )}
      </div>
    </div>
  );
}
