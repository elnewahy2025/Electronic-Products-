import Link from 'next/link';
import { getTopCategories, getFeaturedProducts, getNewestProducts, searchStorefront } from '@/lib/server/services/storefront-service';
import { ProductCard } from '@/components/storefront/product-card';

export default async function HomePage() {
  const [categories, featured, newest, stats] = await Promise.all([
    getTopCategories(),
    getFeaturedProducts(4),
    getNewestProducts(8),
    searchStorefront({ limit: 1 }),
  ]);

  return (
    <main className="container py-8 space-y-12">
      {/* Hero */}
      <section className="text-center space-y-4 py-8">
        <h1 className="text-3xl md:text-4xl font-bold">
          منتجات رقمية من بائعين موثوقين
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          عروض تقديمية، تحضيرات دروس، فيديوهات، ومواد تعليمية — تصفح وعاين قبل الشراء.
        </p>
        {stats.total > 0 && (
          <p className="text-sm text-muted-foreground">
            {stats.total} منتج متاح الآن
          </p>
        )}
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">التصنيفات</h2>
            <Link href="/categories" className="text-sm text-primary">عرض الكل</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categories.map(c => (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                className="border rounded-lg p-4 hover:bg-muted/50 transition text-center"
              >
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.product_count} منتج</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">الأكثر رواجًا</h2>
            <Link href="/products?sort=popular" className="text-sm text-primary">عرض الكل</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {featured.map(p => (
              <ProductCard key={p.id} {...p} />
            ))}
          </div>
        </section>
      )}

      {/* Newest */}
      {newest.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">أحدث المنتجات</h2>
            <Link href="/products" className="text-sm text-primary">عرض الكل</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {newest.map(p => (
              <ProductCard key={p.id} {...p} />
            ))}
          </div>
        </section>
      )}

      {newest.length === 0 && featured.length === 0 && (
        <section className="text-center py-16 text-muted-foreground">
          <p>لا توجد منتجات منشورة بعد.</p>
          <Link href="/register?as=seller" className="text-primary mt-2 inline-block">
            كن أول بائع →
          </Link>
        </section>
      )}
    </main>
  );
}
