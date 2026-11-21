import { notFound } from 'next/navigation';
import { getAllCategories, searchStorefront } from '@/lib/server/services/storefront-service';
import { ProductCard } from '@/components/storefront/product-card';
import Link from 'next/link';

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { sort?: string; page?: string };
}) {
  const categories = await getAllCategories();
  const category = categories.find(c => c.slug === params.slug);
  if (!category) notFound();

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const perPage = 24;

  const result = await searchStorefront({
    categorySlug: params.slug,
    sort: (searchParams.sort as any) ?? 'newest',
    limit: perPage,
    offset: (page - 1) * perPage,
  });

  return (
    <main className="container py-8 space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/categories" className="hover:underline">التصنيفات</Link>
        {' / '}
        <span>{category.name}</span>
      </nav>

      <h1 className="text-2xl font-bold">{category.name}</h1>
      <p className="text-sm text-muted-foreground">{result.total} منتج</p>

      {result.items.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">
          لا توجد منتجات في هذا التصنيف بعد.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {result.items.map(p => (
            <ProductCard key={p.id} {...p} />
          ))}
        </div>
      )}
    </main>
  );
}