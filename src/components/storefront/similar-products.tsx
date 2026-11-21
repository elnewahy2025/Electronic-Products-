import Link from 'next/link';
import { ProductCard } from './product-card';
import type { StorefrontProduct } from '@/lib/server/services/storefront-service';

export function SimilarProducts({
  products,
  title = 'منتجات مشابهة',
}: {
  products: StorefrontProduct[];
  title?: string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <Link href="/products" className="text-sm text-primary">عرض الكل ←</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {products.slice(0, 4).map(p => (
          <ProductCard key={p.id} {...p} />
        ))}
      </div>
    </section>
  );
}
