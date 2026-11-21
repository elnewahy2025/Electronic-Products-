'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

type Category = { id: string; name: string; slug: string; product_count: number };

export function ProductsFilters({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const [minPrice, setMinPrice] = useState(params.get('min') ?? '');
  const [maxPrice, setMaxPrice] = useState(params.get('max') ?? '');

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== '') next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    router.push(`/products?${next.toString()}`);
  }

  const currentCategory = params.get('category') ?? '';
  const currentSort = params.get('sort') ?? 'newest';

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs mb-1 text-muted-foreground">التصنيف</label>
          <select
            value={currentCategory}
            onChange={e => update({ category: e.target.value || undefined })}
            className="w-full border rounded p-2 text-sm bg-background"
          >
            <option value="">كل التصنيفات</option>
            {categories.map(c => (
              <option key={c.id} value={c.slug}>
                {c.name} ({c.product_count})
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[140px]">
          <label className="block text-xs mb-1 text-muted-foreground">الترتيب</label>
          <select
            value={currentSort}
            onChange={e => update({ sort: e.target.value })}
            className="w-full border rounded p-2 text-sm bg-background"
          >
            <option value="newest">الأحدث</option>
            <option value="popular">الأكثر رواجًا</option>
            <option value="rating">الأعلى تقييمًا</option>
            <option value="price_asc">الأرخص أولًا</option>
            <option value="price_desc">الأغلى أولًا</option>
          </select>
        </div>

        <div>
          <label className="block text-xs mb-1 text-muted-foreground">السعر من</label>
          <input
            type="number"
            value={minPrice}
            onChange={e => setMinPrice(e.target.value)}
            onBlur={() => update({ min: minPrice || undefined })}
            placeholder="0"
            className="border rounded p-2 text-sm w-24 bg-background"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 text-muted-foreground">إلى</label>
          <input
            type="number"
            value={maxPrice}
            onChange={e => setMaxPrice(e.target.value)}
            onBlur={() => update({ max: maxPrice || undefined })}
            placeholder="∞"
            className="border rounded p-2 text-sm w-24 bg-background"
          />
        </div>

        {(currentCategory || params.get('min') || params.get('max') || params.get('q')) && (
          <button
            onClick={() => router.push('/products')}
            className="text-sm text-primary"
          >
            مسح الفلاتر
          </button>
        )}
      </div>
    </div>
  );
}