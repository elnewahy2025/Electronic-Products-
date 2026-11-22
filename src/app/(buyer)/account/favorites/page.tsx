import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { FavoriteButton } from '@/components/storefront/favorite-button';

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account/favorites');

  const db = await createClient();
  const { data } = await db
    .from('favorites')
    .select(`
      product_id, created_at,
      products(id, title, slug, short_description, price_amount, price_currency, cover_image_url, status)
    `)
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false });

  const items = (data ?? []).filter((row: any) => row.products && row.products.status === 'published');

  return (
    <main className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المفضلة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length === 0
              ? 'لم تحفظ أي منتجات بعد.'
              : `${items.length} منتج محفوظ`}
          </p>
        </div>
        <Link href="/products" className="text-sm text-primary hover:underline">
          تصفح المنتجات ←
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-3">
          <p className="text-muted-foreground text-sm">
            احفظ المنتجات التي تهمك للوصول إليها بسهولة لاحقاً.
          </p>
          <Link
            href="/products"
            className="inline-block rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            استكشف المتجر
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((row: any) => {
            const p = row.products;
            return (
              <article
                key={p.id}
                className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col"
              >
                <Link href={`/products/${p.slug}`} className="block aspect-video bg-muted overflow-hidden">
                  {p.cover_image_url ? (
                    <img
                      src={p.cover_image_url}
                      alt={p.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                      بدون صورة
                    </div>
                  )}
                </Link>
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <Link
                      href={`/products/${p.slug}`}
                      className="font-semibold text-foreground hover:text-primary hover:underline line-clamp-2"
                    >
                      {p.title}
                    </Link>
                    {p.short_description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {p.short_description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/70">
                    <span className="font-mono text-sm font-bold text-primary tabular-nums" dir="ltr">
                      {Number(p.price_amount).toFixed(2)} {p.price_currency}
                    </span>
                    <FavoriteButton
                      productId={p.id}
                      initialFavorited={true}
                      isAuthenticated={true}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
