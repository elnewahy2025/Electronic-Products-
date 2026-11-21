import Link from 'next/link';
import { searchStorefront, getAllCategories, type SearchParams as SP } from '@/lib/server/services/storefront-service';
import { ProductCard } from '@/components/storefront/product-card';
import { ProductsFilters } from './products-filters';
import { Pagination } from '@/components/storefront/pagination';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    category?: string;
    sort?: SP['sort'];
    min?: string;
    max?: string;
    page?: string;
  };
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const perPage = 24;

  const [result, categories] = await Promise.all([
    searchStorefront({
      query: searchParams.q,
      categorySlug: searchParams.category,
      sort: (searchParams.sort as SP['sort']) ?? 'newest',
      minPrice: searchParams.min ? Number(searchParams.min) : undefined,
      maxPrice: searchParams.max ? Number(searchParams.max) : undefined,
      limit: perPage,
      offset: (page - 1) * perPage,
    }),
    getAllCategories(),
  ]);

  const totalPages = Math.ceil(result.total / perPage);

  return (
    <main className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {searchParams.q ? `نتائج البحث: "${searchParams.q}"` : 'كل المنتجات'}
        </h1>
        <p className="text-sm text-muted-foreground">{result.total} منتج</p>
      </div>

      <ProductsFilters categories={categories} />

      {result.items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>لا توجد منتجات مطابقة.</p>
          <Link href="/products" className="text-primary mt-2 inline-block">مسح الفلاتر</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {result.items.map(p => (
              <ProductCard key={p.id} {...p} />
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              basePath="/products"
              query={{
                q: searchParams.q,
                category: searchParams.category,
                sort: searchParams.sort,
                min: searchParams.min,
                max: searchParams.max,
              }}
            />
          )}
        </>
      )}
    </main>
  );
}