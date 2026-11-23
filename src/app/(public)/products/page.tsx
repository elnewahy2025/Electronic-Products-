import Link from 'next/link';
import { Suspense } from 'react';
import { getAllCategories, searchStorefront, type SearchParams as SP } from '@/lib/server/services/storefront-service';
import { ProductsFilters } from './products-filters';
import { ProductsGrid } from './products-grid';
import { ProductsSkeleton } from './products-skeleton';
import { Pagination } from '@/components/storefront/pagination';

export default async function ProductsPage(
  props: {
    searchParams: Promise<{
      q?: string;
      category?: string;
      sort?: SP['sort'];
      min?: string;
      max?: string;
      page?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const categories = await getAllCategories();

  return (
    <main className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {searchParams.q ? `نتائج البحث: "${searchParams.q}"` : 'كل المنتجات'}
        </h1>
      </div>

      <ProductsFilters categories={categories} />

      <Suspense
        key={JSON.stringify(searchParams)}
        fallback={<ProductsSkeleton />}
      >
        <ProductsResult searchParams={searchParams} page={page} />
      </Suspense>
    </main>
  );
}

async function ProductsResult({
  searchParams,
  page,
}: {
  searchParams: any;
  page: number;
}) {
  const perPage = 24;
  const result = await searchStorefront({
    query: searchParams.q,
    categorySlug: searchParams.category,
    sort: (searchParams.sort as SP['sort']) ?? 'newest',
    minPrice: searchParams.min ? Number(searchParams.min) : undefined,
    maxPrice: searchParams.max ? Number(searchParams.max) : undefined,
    limit: perPage,
    offset: (page - 1) * perPage,
  });

  const totalPages = Math.ceil(result.total / perPage);

  if (result.items.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>لا توجد منتجات مطابقة.</p>
        <Link href="/products" className="text-primary mt-2 inline-block">مسح الفلاتر</Link>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">{result.total} منتج</p>
      <ProductsGrid products={result.items} />
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
  );
}
