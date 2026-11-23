'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type SearchHit = {
  id: string;
  title: string;
  slug: string;
  price_amount: number;
  price_currency: string;
  seller_display_name: string;
};

export function InstantSearch() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced fetch
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/storefront/search?q=${encodeURIComponent(query)}&limit=6`);
        const json = await res.json();
        setHits(json.items ?? []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length > 0) {
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <form onSubmit={submit}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="ابحث عن منتج..."
          aria-label="ابحث عن منتج"
          className="w-full border rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <span className="absolute left-3 top-2.5 text-muted-foreground pointer-events-none">🔍</span>
      </form>

      {open && (query.trim().length >= 2) && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 border rounded-lg bg-background shadow-lg max-h-96 overflow-auto">
          {loading && <p className="p-3 text-sm text-muted-foreground">جارٍ البحث...</p>}
          {!loading && hits.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">لا توجد نتائج</p>
          )}
          {!loading && hits.length > 0 && (
            <>
              {hits.map(h => (
                <Link
                  key={h.id}
                  href={`/products/${h.slug}`}
                  onClick={() => setOpen(false)}
                  className="block p-3 border-b last:border-b-0 hover:bg-muted/50"
                >
                  <p className="font-medium text-sm">{h.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.seller_display_name} — {h.price_amount} {h.price_currency}
                  </p>
                </Link>
              ))}
              <Link
                href={`/search?q=${encodeURIComponent(query.trim())}`}
                onClick={() => setOpen(false)}
                className="block p-3 text-sm text-center text-primary bg-muted/30"
              >
                عرض كل النتائج ↗
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}