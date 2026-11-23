import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FileText, HardDrive, ShieldCheck, Layers } from 'lucide-react';
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

export default async function ProductPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const db = await createClient();
  let slug = params.slug;
  try {
    slug = decodeURIComponent(params.slug);
  } catch {
    // keep raw slug if malformed percent-encoding
  }

  const { data: product } = await db
    .from('products')
    .select(`
      id, title, slug, short_description, description, price_amount, price_currency,
      status, published_at, seller_id, category_id, cover_image_url,
      product_versions(id, version_number, status)
    `)
    .eq('slug', slug)
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

  // Fetch public file specs (extension, count, total size) for the published version
  const publishedVer = ((product as any).product_versions ?? []).find(
    (v: any) => v.status === 'published',
  );
  let fileSpecs: { count: number; totalBytes: number; extensions: string[] } = {
    count: 0,
    totalBytes: 0,
    extensions: [],
  };
  if (publishedVer?.id) {
    const admin = createAdminClient();
    const { data: verFiles } = await admin
      .from('product_version_files')
      .select('file_versions!inner(size_bytes, extension)')
      .eq('product_version_id', publishedVer.id);

    const rows = (verFiles ?? []).map((r: any) => r.file_versions).filter(Boolean);
    fileSpecs = {
      count: rows.length,
      totalBytes: rows.reduce((acc: number, r: any) => acc + Number(r.size_bytes ?? 0), 0),
      extensions: Array.from(
        new Set(rows.map((r: any) => String(r.extension ?? '').toUpperCase()).filter(Boolean)),
      ),
    };
  }

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

          {fileSpecs.count > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">نوع الملف</p>
                  <p className="text-xs font-bold ui-num">{fileSpecs.extensions.join(' · ') || 'رقمي'}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">عدد الملفات</p>
                  <p className="text-xs font-bold ui-num">{fileSpecs.count} ملف</p>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                <HardDrive className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">الحجم الإجمالي</p>
                  <p className="text-xs font-bold ui-num">
                    {fileSpecs.totalBytes >= 1024 * 1024
                      ? `${(fileSpecs.totalBytes / 1024 / 1024).toFixed(2)} MB`
                      : `${Math.max(1, Math.round(fileSpecs.totalBytes / 1024))} KB`}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground">الحماية والتسليم</p>
                  <p className="text-xs font-bold">مفحوص · كود فوري</p>
                </div>
              </div>
            </div>
          )}

          <p className="text-lg">{product.short_description}</p>

          {product.description && (
            <div className="prose prose-sm max-w-none">
              <h2 className="font-semibold mb-2">الوصف</h2>
              <p className="whitespace-pre-wrap">{product.description}</p>
            </div>
          )}

          <section className="space-y-4 pt-6 border-t border-border">
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
            <div className="pt-4">
              <SimilarProducts products={similarFiltered} />
            </div>
          )}
        </div>

        <aside className="space-y-4 md:sticky md:top-20 md:self-start">
          <div className="ui-box space-y-4">
            <div>
              <p className="text-2xl font-bold ui-num">
                {product.price_amount} {product.price_currency}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                الدفع يتم خارج المنصة — تسليم فوري بكود تنزيل آمن
              </p>
            </div>

            <ol className="rounded-xl bg-muted/40 border border-border p-3 space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                <span>أرسل طلب الشراء بالأسفل</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                <span>أتمم الدفع عبر وسيلة التواصل المعتمدة</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                <span>استلم كود التنزيل الفوري (3 محاولات نظيفة بدون علامة مائية)</span>
              </li>
            </ol>

            {dbAuth.data.user?.id === product.seller_id ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-xs space-y-2.5">
                <p className="font-semibold text-foreground">هذا منتجك الخاص (أنت البائع)</p>
                <p className="text-muted-foreground">
                  لا يمكن شراء منتجك الخاص. يمكنك تعديل بيانات المنتج أو إدارة ملفاته مباشرة:
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/seller/products/${product.id}`}
                    className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-semibold hover:opacity-95 transition"
                  >
                    تعديل المنتج
                  </Link>
                  <Link
                    href={`/seller/products/${product.id}/versions`}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 font-medium hover:bg-muted transition"
                  >
                    إدارة الإصدارات
                  </Link>
                </div>
              </div>
            ) : userProfile ? (
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
