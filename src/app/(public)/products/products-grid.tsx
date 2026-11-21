import { ProductCard } from '@/components/storefront/product-card';
import type { StorefrontProduct } from '@/lib/server/services/storefront-service';

export function ProductsGrid({ products }: { products: StorefrontProduct[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map(p => (
        <ProductCard key={p.id} {...p} />
      ))}
    </div>
  );
}
