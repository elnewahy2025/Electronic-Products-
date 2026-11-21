'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

type Product = { id: string; title: string };

const STATUSES = [
  { key: '', label: 'كل الحالات' },
  { key: 'pending', label: 'بانتظار التفعيل' },
  { key: 'active', label: 'تنزيل نشط' },
  { key: 'completed', label: 'مكتمل' },
  { key: 'expired', label: 'منتهي' },
  { key: 'revoked', label: 'ملغى' },
];

export function OrdersFilters({ products }: { products: Product[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    router.push(`/seller/orders?${next.toString()}`);
  }

  function applyDateRange() {
    update({ from: from || undefined, to: to || undefined });
  }

  const hasFilters =
    params.get('product') || params.get('status') || params.get('from') || params.get('to');

  return (
    <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs mb-1 text-muted-foreground">المنتج</label>
          <select
            value={params.get('product') ?? ''}
            onChange={e => update({ product: e.target.value || undefined })}
            className="w-full border rounded p-2 text-sm bg-background"
          >
            <option value="">كل المنتجات</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[160px]">
          <label className="block text-xs mb-1 text-muted-foreground">الحالة</label>
          <select
            value={params.get('status') ?? ''}
            onChange={e => update({ status: e.target.value || undefined })}
            className="w-full border rounded p-2 text-sm bg-background"
          >
            {STATUSES.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs mb-1 text-muted-foreground">من تاريخ</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            onBlur={applyDateRange}
            className="border rounded p-2 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 text-muted-foreground">إلى تاريخ</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            onBlur={applyDateRange}
            className="border rounded p-2 text-sm bg-background"
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => router.push('/seller/orders')}
            className="text-sm text-primary"
          >
            مسح الفلاتر
          </button>
        )}
      </div>
    </div>
  );
}
