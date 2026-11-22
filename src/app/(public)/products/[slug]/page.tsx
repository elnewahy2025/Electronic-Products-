import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import {
  getProductRating,
  getProductReviews,
  getMyReviewForProduct,
  canCurrentUserReview,
} from '@/lib/server/services/review-service';
import { searchStorefront } from '@/lib/server/services/storefront-service';
import { ReviewForm } from './review-form';
import { ReportForm } from './report-form';
import { Breadcrumbs } from '@/components/storefront/breadcrumbs';
import { ProductGallery } from '@/components/storefront/product-gallery';
import { SimilarProducts } from '@/components/storefront/similar-products';
import { FavoriteButton } from '@/components/storefront/favorite-button';
import { PurchaseRequestForm } from './purchase-request-form';

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const db = await createClient();

  const { data: product } = await db
    .from('products')
    .select(`
      id, title, slug, short_description, description, price_amount, price_currency,
      status, published_at, seller_id, category_id, cover_image_url,
      product_versions(id, version_number, status)
    `)
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single();

  if (!product) notFound();

  const [seller, settings, category, gallery, rating, reviews, myReview, eligibility] =
    await Promise.all([
      db.from('seller_public_view')
        .select('display_name, bio, avatar_url')
        .eq('profile_id', product.seller_id)
        .single(),
      db.from('general_settings')
        .select('platform_contact_email, platform_contact_phone, platform_name')
        .eq('id', 1)
        .single(),
      product.category_id
        ? db.from('categories').select('name, slug').eq('id', product.category_id).single()
        : Promise.resolve({ data: null }),
      db.from('product_gallery_images')
        .select('url, sort_order')
        .eq('product_id', product.id)
        .order('sort_order', { ascending: true }),
      getProductRating(product.id),
      getProductReviews(product.id),
      getMyReviewForProduct(product.id),
      canCurrentUserReview(product.id),
    ]);

  const dbAuth = await db.auth.getUser();
  let userProfile: { email: string; phone: string | null; full_name: string | null } | null = null;
  let isFavorited = false;
  if (dbAuth.data.user) {
    const [{ data: prof }, { data: fav }] = await Promise.all([
      db.from('profiles')
        .select('email, phone, full_name')
        .eq('id', dbAuth.data.user.id)
        .single(),
      db.from('favorites')
        .select('product_id')
        .eq('buyer_id', dbAuth.data.user.id)
        .eq('product_id', product.id)
        .maybeSingle(),
    ]);
    userProfile = prof;
    isFavorited = Boolean(fav);
  }

  // Build gallery images array
  const galleryImages: string[] = [
    ...(product.cover_image_url ? [product.cover_image_url] : []),
    ...(gallery.data ?? []).map((g: any) => g.url),
  ].filter(Boolean);

  // Similar products
  const similar = product.category_id
    ? await searchStorefront({
        categorySlug: category.data?.slug,
        limit: 8,
        offset: 0,
      })
    : { items: [] as any[] };

  const similarFiltered = similar.items.filter(p => p.id !== product.id).slice(0, 4);

  // Breadcrumbs
  const crumbs = [
    { label: 'الرئيسية', href: '/' },
    { label: 'المنتجات', href: '/products' },
    ...(category.data?.slug
      ? [{ label: category.data!.name, href: `/categories/${category.data!.slug}` }]
      : []),
    { label: product.title },
  ];

  return (
    <main className="container py-8 space-y-10">
      <Breadcrumbs items={crumbs} />

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h1 className="text-3xl font-bold">{product.title}</h1>
            <FavoriteButton
              productId={product.id}
              initialFavorited={isFavorited}
              isAuthenticated={Boolean(dbAuth.data.user)}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            بواسطة <b>{seller.data?.display_name ?? 'بائع'}</b>
          </p>

          {rating.count > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Stars value={rating.average} />
              <span className="text-muted-foreground">
                {rating.average} ({rating.count} تقييم)
              </span>
            </div>
          )}

          <ProductGallery images={galleryImages} title={product.title} />

          <p className="text-lg">{product.short_description}</p>

          {product.description && (
            <div className="prose prose-sm max-w-none">
              <h2 className="font-semibold mb-2">الوصف</h2>
              <p className="whitespace-pre-wrap">{product.description}</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="border rounded-lg p-4 space-y-3">
            <p className="text-2xl font-bold">
              {product.price_amount} {product.price_currency}
            </p>
            <p className="text-xs text-muted-foreground">الدفع يتم خارج المنصة</p>

            {userProfile ? (
              <PurchaseRequestForm
                productId={product.id}
                productTitle={product.title}
                price={product.price_amount}
                currency={product.price_currency}
                defaultEmail={userProfile.email}
                defaultPhone={userProfile.phone ?? ''}
                defaultFullName={userProfile.full_name ?? ''}
                isLoggedIn={true}
              />
            ) : (
              <PurchaseRequestForm
                productId={product.id}
                productTitle={product.title}
                price={product.price_amount}
                currency={product.price_currency}
                isLoggedIn={false}
              />
            )}

            {settings.data?.platform_contact_phone && (
              <p className="text-xs text-center text-muted-foreground">
                أو اتصل: {settings.data.platform_contact_phone}
              </p>
            )}
          </div>

          <ReportForm entityType="product" entityId={product.id} />
        </aside>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">التقييمات ({reviews.length})</h2>

        {eligibility.canReview && <ReviewForm productId={product.id} />}
        {!eligibility.canReview && eligibility.reason === 'already_reviewed' && myReview && (
          <div className="border rounded p-3 bg-muted/30 text-sm">
            <p className="text-xs text-muted-foreground">تقييمك لهذا المنتج:</p>
            <div className="flex items-center gap-2 mt-1">
              <Stars value={myReview.rating} />
              {myReview.body && <span className="text-muted-foreground">{myReview.body}</span>}
            </div>
          </div>
        )}
        {!eligibility.canReview && eligibility.reason === 'not_purchased' && (
          <p className="text-sm text-muted-foreground">
            يمكن للمشترين الموثقين فقط إضافة تقييم.
          </p>
        )}

        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="border rounded p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">مشتري موثّق</span>
                  <Stars value={r.rating} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString('ar')}
                </span>
              </div>
              {r.body && <p className="text-sm whitespace-pre-wrap">{r.body}</p>}
              {(r as any).seller_reply && (
                <div className="bg-muted/40 border-r-2 border-primary rounded p-2 mt-2">
                  <p className="text-xs font-medium text-primary mb-1">رد البائع:</p>
                  <p className="text-sm whitespace-pre-wrap">{(r as any).seller_reply}</p>
                </div>
              )}
            </div>
          ))}
          {reviews.length === 0 && (
            <p className="text-muted-foreground text-sm">لا توجد تقييمات بعد.</p>
          )}
        </div>
      </section>

      {similarFiltered.length > 0 && (
        <SimilarProducts products={similarFiltered} />
      )}
    </main>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= Math.round(value) ? 'text-yellow-500' : 'text-gray-300'}>
          ★
        </span>
      ))}
    </div>
  );
}

function galleryImagesEmpty(coverUrl: string | null, gallery: any[] | null): boolean {
  return !coverUrl && (!gallery || gallery.length === 0);
}
