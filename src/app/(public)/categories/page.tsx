import Link from 'next/link';
import { CategoryArtwork } from '@/components/storefront/category-artwork';
import { getAllCategories } from '@/lib/server/services/storefront-service';

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const categories = await getAllCategories();
  const query = (searchParams.q ?? '').trim();

  const filtered = query
    ? categories.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.slug.toLowerCase().includes(query.toLowerCase())
      )
    : categories;

  const totalProducts = categories.reduce((sum, c) => sum + c.product_count, 0);

  // Keep the page useful if subcategories are introduced later: top-level
  // categories become the cards, and any children are shown as compact labels.
  const roots = filtered.filter(
    c => !c.parent_id || !filtered.some(parent => parent.id === c.parent_id)
  );
  const childrenOf = (id: string) => filtered.filter(c => c.parent_id === id);

  return (
    <>
      {/* Brand hero — mirrors the storefront home hero */}
      <section className="bg-brand text-brand-foreground relative overflow-hidden border-b border-white/10">
        <svg
          className="absolute inset-0 h-full w-full opacity-10 pointer-events-none"
          viewBox="0 0 800 180"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <pattern id="ep-categories-grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="currentColor" strokeWidth="0.7" />
            </pattern>
          </defs>
          <rect width="800" height="180" fill="url(#ep-categories-grid)" />
        </svg>

        <div className="container relative py-6 sm:py-8 space-y-3">
          <nav aria-label="مسار التنقل" className="flex items-center gap-1.5 text-[11px] text-[#b4d3c8]">
            <Link href="/" className="hover:text-white">المتجر</Link>
            <span aria-hidden="true">/</span>
            <span>التصنيفات</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl md:text-[26px] font-bold leading-tight">كل التصنيفات</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2.5 py-0.5 text-[11px] text-[#b4d3c8]">
                  <b className="ui-num text-white">{categories.length}</b> تصنيف
                </span>
              </div>
              <p className="text-[#b4d3c8] text-xs sm:text-sm leading-relaxed max-w-2xl">
                تصفّح المواد الرقمية حسب التصنيف — عروض تقديمية، تحضيرات دروس، كتب وملخصات وقوالب جاهزة للتنزيل.
              </p>
            </div>

            <form action="/categories" method="get" className="relative w-full sm:w-64 lg:w-72 shrink-0">
              <label htmlFor="category-search" className="sr-only">ابحث عن تصنيف</label>
              <input
                id="category-search"
                type="search"
                name="q"
                defaultValue={query}
                placeholder="ابحث عن تصنيف..."
                className="w-full rounded-lg bg-card/95 text-foreground placeholder:text-muted-foreground border border-white/15 py-2 pe-3 ps-9 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#e8a317]"
              />
              <button
                type="submit"
                aria-label="بحث"
                className="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </section>

      <main className="container py-6 sm:py-8 pb-14 space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[21px] font-bold text-foreground">
              {query ? `نتائج البحث: "${query}"` : 'تصفّح حسب التصنيف'}
            </h2>
            <p className="text-sm text-muted-foreground">
              <b className="ui-num">{filtered.length}</b> من <b className="ui-num">{categories.length}</b> تصنيف —{' '}
              <b className="ui-num">{totalProducts}</b> منتج متاح
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {query && (
              <Link href="/categories" className="text-sm text-primary hover:underline">
                مسح البحث
              </Link>
            )}
            <Link
              href="/products"
              className="rounded-[9px] border border-border bg-card px-4 py-1.5 text-sm font-semibold text-foreground hover:border-primary transition"
            >
              كل المنتجات
            </Link>
          </div>
        </div>

        {roots.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-border bg-card py-16 text-center text-muted-foreground space-y-2">
            <p>لا توجد تصنيفات مطابقة لبحثك.</p>
            <Link href="/categories" className="text-primary font-semibold hover:underline inline-block">
              عرض كل التصنيفات
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {roots.map((c, i) => {
              const children = childrenOf(c.id);
              return (
                <Link
                  key={c.id}
                  href={`/categories/${c.slug}`}
                  className="group rounded-[14px] border border-border bg-card overflow-hidden hover:border-primary transition-colors flex flex-col"
                >
                  <div className="relative aspect-[16/8] overflow-hidden bg-brand/90">
                    {c.cover_image_url ? (
                      <img
                        src={c.cover_image_url}
                        alt=""
                        width={320}
                        height={160}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <CategoryArtwork name={c.name} slug={c.slug} />
                    )}
                    <span aria-hidden="true" className="absolute top-3 start-3 ui-num text-[11px] rounded-full bg-white/10 px-2 py-0.5 text-brand-foreground/80">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col">
                    <h3 className="font-bold text-[15px] text-foreground group-hover:text-primary transition-colors">
                      {c.name}
                    </h3>

                    {children.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {children.map(child => (
                          <span
                            key={child.id}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {child.name}
                            <b className="ui-num text-foreground">{child.product_count}</b>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto pt-1 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        <b className="ui-num text-foreground">{c.product_count}</b> منتج
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        تصفح
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M19 12H5m7-7-7 7 7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <section className="rounded-[14px] border border-border bg-card p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="font-bold text-sm text-foreground">لم تجد ما تبحث عنه؟</h2>
            <p className="text-[13px] text-muted-foreground">ابحث في كل المنتجات أو تصفّح الأحدث مباشرة.</p>
          </div>
          <Link
            href="/products"
            className="rounded-[9px] bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:opacity-95 transition whitespace-nowrap"
          >
            تصفح كل المنتجات
          </Link>
        </section>
      </main>
    </>
  );
}
