import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/auth/permissions';
import { ProductModerationActions } from './product-moderation-actions';

const STATUS_META: Record<string, { label: string; badge: string }> = {
  published: { label: 'منشور', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  draft: { label: 'مسودة', badge: 'bg-muted text-foreground border-border' },
  paused: { label: 'موقوف مؤقتًا', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  suspended: { label: 'موقوف إداريًا', badge: 'bg-red-50 text-red-800 border-red-200' },
  rejected: { label: 'مرفوض', badge: 'bg-red-50 text-red-800 border-red-200' },
  archived: { label: 'مؤرشف', badge: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  deleted: { label: 'محذوف', badge: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const db = await createClient();
  const canModerate = await can('product.suspend');

  let query = db
    .from('products')
    .select(`
      id, title, slug, price_amount, price_currency, status,
      cover_image_url, suspension_reason, rejection_reason,
      created_at, published_at,
      seller_profiles:seller_profiles!products_seller_id_fkey(profile_id, display_name),
      categories(name)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.status) query = query.eq('status', searchParams.status);
  if (searchParams.q?.trim()) query = query.ilike('title', `%${searchParams.q.trim()}%`);

  const { data } = await query;
  const products = (data ?? []) as any[];

  const publishedCount = products.filter(p => p.status === 'published').length;
  const suspendedCount = products.filter(p => p.status === 'suspended' || p.status === 'rejected').length;

  return (
    <main className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <p className="text-xs font-medium text-primary mb-1">الإشراف على المحتوى</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            إدارة المنتجات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            مراجعة جميع منتجات البائعين، التحقق من الأسعار، وتعليق أو إعادة تفعيل المنتجات المخالفة.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs tabular-nums">
          <div className="bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm">
            <span className="text-muted-foreground block">المعروضة</span>
            <span className="text-lg font-bold text-foreground">{products.length}</span>
          </div>
          <div className="bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm">
            <span className="text-muted-foreground block">المنشورة</span>
            <span className="text-lg font-bold text-emerald-700">{publishedCount}</span>
          </div>
          {suspendedCount > 0 && (
            <div className="bg-card border border-red-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-muted-foreground block">موقوفة/مرفوضة</span>
              <span className="text-lg font-bold text-red-700">{suspendedCount}</span>
            </div>
          )}
        </div>
      </header>

      {/* Filters & Search */}
      <section className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link
            href="/admin/products"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !searchParams.status
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/70 text-muted-foreground hover:text-foreground'
            }`}
          >
            الكل
          </Link>
          {(['published', 'draft', 'paused', 'suspended', 'rejected'] as const).map(st => (
            <Link
              key={st}
              href={`/admin/products?status=${st}${searchParams.q ? `&q=${encodeURIComponent(searchParams.q)}` : ''}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                searchParams.status === st
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/70 text-muted-foreground hover:text-foreground'
              }`}
            >
              {STATUS_META[st].label}
            </Link>
          ))}
        </div>

        <form action="/admin/products" method="get" className="flex items-center gap-2">
          {searchParams.status && (
            <input type="hidden" name="status" value={searchParams.status} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="بحث باسم المنتج..."
            className="bg-background border border-border rounded-xl px-3.5 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <button
            type="submit"
            className="bg-muted hover:bg-muted/80 text-foreground rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors"
          >
            بحث
          </button>
        </form>
      </section>

      {/* Products List */}
      <section className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        {products.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            لا توجد منتجات مطابقة للفلاتر الحالية.
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {products.map(p => {
              const meta = STATUS_META[p.status] ?? {
                label: p.status,
                badge: 'bg-muted text-foreground border-border',
              };
              const reason = p.suspension_reason || p.rejection_reason;

              return (
                <div
                  key={p.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-20 h-14 rounded-xl bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
                      {p.cover_image_url ? (
                        <img
                          src={p.cover_image_url}
                          alt={p.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">بلا غلاف</span>
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/products/${p.slug}`}
                          target="_blank"
                          className="text-sm font-semibold text-foreground hover:text-primary hover:underline truncate"
                        >
                          {p.title}
                        </Link>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        <span>
                          البائع:{' '}
                          {p.seller_profiles?.profile_id ? (
                            <Link
                              href={`/admin/sellers/${p.seller_profiles.profile_id}`}
                              className="text-foreground font-medium hover:underline"
                            >
                              {p.seller_profiles.display_name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </span>
                        <span>·</span>
                        <span>التصنيف: {p.categories?.name ?? 'بدون تصنيف'}</span>
                        <span>·</span>
                        <span className="font-mono font-semibold text-foreground tabular-nums" dir="ltr">
                          {Number(p.price_amount).toFixed(2)} {p.price_currency}
                        </span>
                        <span>·</span>
                        <span>{new Date(p.created_at).toLocaleDateString('ar-EG')}</span>
                      </div>

                      {reason && (
                        <p className="text-xs text-red-700 bg-red-50/70 border border-red-100 rounded-lg px-2.5 py-1 inline-block mt-1">
                          السبب: {reason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {p.status === 'published' && (
                      <Link
                        href={`/products/${p.slug}`}
                        target="_blank"
                        className="text-xs font-medium border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
                      >
                        معاينة في المتجر
                      </Link>
                    )}

                    {canModerate && p.status !== 'deleted' && (
                      <ProductModerationActions productId={p.id} currentStatus={p.status} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
