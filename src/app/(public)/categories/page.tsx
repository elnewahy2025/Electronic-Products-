import Link from 'next/link';
import { getAllCategories } from '@/lib/server/services/storefront-service';

export default async function CategoriesPage() {
  const categories = await getAllCategories();

  return (
    <main className="container py-8 space-y-6">
      <h1 className="text-2xl font-bold">كل التصنيفات</h1>

      {categories.length === 0 ? (
        <p className="text-muted-foreground">لا توجد تصنيفات بعد.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {categories.map(c => (
            <Link
              key={c.id}
              href={`/categories/${c.slug}`}
              className="border rounded-lg p-4 hover:bg-muted/50 transition"
            >
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.product_count} منتج</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}