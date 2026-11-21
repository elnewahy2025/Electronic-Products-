import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { getProductRating, getProductReviews, getMyReviewForProduct, canCurrentUserReview } from '@/lib/server/services/review-service';
import { ReviewForm } from './review-form';
import { ReportForm } from './report-form';
import { PurchaseRequestForm } from './purchase-request-form';

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const db = await createClient();

  const { data: product } = await db
    .from('products')
    .select(`
      id, title, slug, short_description, description, price_amount, price_currency,
      status, published_at, seller_id,
      product_versions!inner(id, version_number, status, file_previews(id, preview_type, status))
    `)
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single();

  if (!product) notFound();

  const { data: seller } = await db
    .from('seller_public_view')
    .select('display_name, bio, avatar_url')
    .eq('profile_id', product.seller_id)
    .single();

  const dbAuth = await db.auth.getUser();
  let userProfile: { email: string; phone: string | null; full_name: string | null } | null = null;
  if (dbAuth.data.user) {
    const { data: prof } = await db
      .from('profiles')
      .select('email, phone, full_name')
      .eq('id', dbAuth.data.user.id)
      .single();
    userProfile = prof;
  }

  const [rating, reviews, myReview, eligibility] = await Promise.all([
    getProductRating(product.id),
    getProductReviews(product.id),
    getMyReviewForProduct(product.id),
    canCurrentUserReview(product.id),
  ]);

  const preview = (product.product_versions as any)?.[0]?.file_previews?.[0];
  const previewUrl = preview?.status === 'ready'
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${preview.id}`
    : null;

  return (
    <main className="container max-w-4xl py-8 space-y-8">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <h1 className="text-3xl font-bold">{product.title}</h1>
          <p className="text-sm text-muted-foreground">
            بواسطة <b>{seller?.display_name ?? 'بائع'}</b>
          </p>
          {rating.count > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Stars value={rating.average} />
              <span className="text-muted-foreground">
                {rating.average} ({rating.count} تقييم)
              </span>
            </div>
          )}
          <p className="text-lg">{product.short_description}</p>
          {previewUrl && (
            <div className="border rounded overflow-hidden bg-muted aspect-video flex items-center justify-center">
              {preview?.preview_type === 'video' ? (
                <video src={previewUrl} controls className="max-h-full" />
              ) : (
                <img src={previewUrl} alt="معاينة" className="max-h-full object-contain" />
              )}
            </div>
          )}
          {product.description && (
            <div className="prose prose-sm max-w-none">
              <h2 className="font-semibold mb-2">الوصف</h2>
              <p className="whitespace-pre-wrap">{product.description}</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="border rounded p-4 space-y-3">
            <div>
              <p className="text-2xl font-bold">
                {product.price_amount} {product.price_currency}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                الدفع يتم خارج المنصة
              </p>
            </div>
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
          </div>

          <ReportForm entityType="product" entityId={product.id} />
        </aside>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">التقييمات ({reviews.length})</h2>

        {eligibility.canReview && (
          <ReviewForm productId={product.id} />
        )}
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
            <div key={r.id} className="border rounded p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">مشتري موثّق</span>
                  <Stars value={r.rating} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString('ar')}
                </span>
              </div>
              {r.body && <p className="text-sm whitespace-pre-wrap">{r.body}</p>}
            </div>
          ))}
          {!reviews.length && (
            <p className="text-muted-foreground text-sm">لا توجد تقييمات بعد.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= Math.round(value) ? 'text-yellow-500' : 'text-gray-300'}>★</span>
      ))}
    </div>
  );
}
