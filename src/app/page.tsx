import Link from 'next/link';
import {
  getTopCategories,
  getFeaturedProducts,
  getNewestProducts,
  searchStorefront,
} from '@/lib/server/services/storefront-service';
import { ProductCard } from '@/components/storefront/product-card';
import { HeroRedeemBar } from '@/components/storefront/hero-redeem-bar';
import { SiteHeader } from '@/components/storefront/site-header';

export default async function HomePage() {
  const [categories, featured, newest, stats] = await Promise.all([
    getTopCategories(),
    getFeaturedProducts(4),
    getNewestProducts(8),
    searchStorefront({ limit: 1 }),
  ]);

  return (
    <>
      <SiteHeader />

      {/* Brand-Surface Hero (Preserves platform's digital-products identity) */}
      <section className="bg-brand text-brand-foreground relative overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full opacity-15 pointer-events-none"
          viewBox="0 0 800 320"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <pattern id="ep-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#8ed8c1" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="800" height="320" fill="url(#ep-grid)" />
        </svg>

        <div className="container relative py-14 md:py-16">
          <h1 className="text-3xl md:text-[42px] font-bold leading-snug max-w-2xl">
            منتجات رقمية من بائعين موثوقين
          </h1>
          <p className="mt-3 text-[#b4d3c8] max-w-xl text-[15.5px] leading-relaxed">
            عروض تقديمية، تحضيرات دروس، فيديوهات، ومواد تعليمية — تصفح وعاين قبل الشراء،
            وستصلك رسالة بكود التفعيل بعد مراجعة الإدارة.
          </p>

          <form
            action="/products"
            method="GET"
            className="mt-6 max-w-xl relative"
          >
            <input
              type="search"
              name="q"
              placeholder="ابحث عن منتج رقمي أو تصنيف..."
              className="w-full rounded-xl bg-white text-[#0f1b26] placeholder:text-[#5d6b78] py-3.5 pe-4 ps-12 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-[#e8a317]"
            />
            <button
              type="submit"
              aria-label="بحث"
              className="absolute start-3 top-1/2 -translate-y-1/2 text-[#0f1b26] p-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-4">
            <HeroRedeemBar />
            {stats.total > 0 && (
              <span className="mt-5 text-xs text-[#9ccbbd]">
                <b className="ui-num text-white">{stats.total}</b> منتج منشور وجاهز للتنزيل
              </span>
            )}
          </div>
        </div>
      </section>

      <main className="container py-10 pb-16 space-y-12">
        {/* Featured */}
        {featured.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-[21px] font-bold text-foreground">الأكثر رواجًا</h2>
                <p className="text-sm text-muted-foreground">الأعلى تقييمًا وإقبالًا من المشترين</p>
              </div>
              <Link
                href="/products?sort=popular"
                className="rounded-[9px] border border-border bg-card px-4 py-1.5 text-sm font-semibold text-foreground hover:border-primary transition"
              >
                عرض الكل
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {featured.map(p => (
                <ProductCard key={p.id} {...p} />
              ))}
            </div>
          </section>
        )}

        {/* Newest */}
        {newest.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-[21px] font-bold text-foreground">أحدث المنتجات</h2>
                <p className="text-sm text-muted-foreground">أحدث الملفات والمنتجات المنشورة</p>
              </div>
              <Link
                href="/products"
                className="rounded-[9px] border border-border bg-card px-4 py-1.5 text-sm font-semibold text-foreground hover:border-primary transition"
              >
                عرض كل المنتجات ({stats.total})
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {newest.map(p => (
                <ProductCard key={p.id} {...p} />
              ))}
            </div>
          </section>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <section id="cats" className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-[21px] font-bold text-foreground">التصنيفات</h2>
              <Link href="/categories" className="text-sm font-medium text-primary hover:underline">
                كل التصنيفات
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {categories.map(c => (
                <Link
                  key={c.id}
                  href={`/categories/${c.slug}`}
                  className="rounded-xl border border-border bg-card px-4 py-3.5 flex items-center justify-between hover:border-primary transition-colors"
                >
                  <span className="font-semibold text-sm text-foreground">{c.name}</span>
                  <span className="ui-num text-xs text-muted-foreground">{c.product_count}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* How to buy — 4 numbered steps */}
        <section id="how" className="space-y-4">
          <div>
            <h2 className="text-[21px] font-bold text-foreground">كيف أشتري؟</h2>
            <p className="text-sm text-muted-foreground">
              الدفع يتم بعد مراجعة الإدارة، والتنزيل الآمن بمحاولات محمية وموثّقة
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 rounded-[14px] border border-border bg-card overflow-hidden divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border">
            {[
              { n: 1, title: 'أرسل طلب شراء', desc: 'اختر المنتج وعاين محتواه ثم اترك بيانات التواصل.' },
              { n: 2, title: 'تتم مراجعة الطلب', desc: 'الإدارة تتواصل معك وتؤكد الدفع بأمان.' },
              { n: 3, title: 'يصلك كود تفعيل', desc: 'كود فريد صالح لمدة محددة ومخصص لمنتجك.' },
              { n: 4, title: 'نزّل ملفاتك بأمان', desc: 'لديك محاولات تنزيل محددة، والمحاولة الفاشلة تُعوَّض.' },
            ].map(step => (
              <div key={step.n} className="p-5 space-y-1.5">
                <span className="inline-grid place-items-center w-[26px] h-[26px] rounded-full bg-success text-white font-bold text-xs mb-1 ui-num">
                  {step.n}
                </span>
                <h3 className="font-bold text-sm text-foreground">{step.title}</h3>
                <p className="text-[13.5px] text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {newest.length === 0 && featured.length === 0 && (
          <section className="rounded-[14px] border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
            <p>لا توجد منتجات منشورة بعد.</p>
            <Link href="/register?as=seller" className="text-primary font-semibold mt-2 inline-block hover:underline">
              كن أول بائع ←
            </Link>
          </section>
        )}
      </main>

      <footer className="border-t border-border bg-card py-6 text-xs text-muted-foreground">
        <div className="container flex flex-wrap items-center justify-between gap-2">
          <span>{process.env.NEXT_PUBLIC_APP_NAME ?? 'المنصة'} — منصة بيع المنتجات الرقمية الموثوقة.</span>
          <span>الدفع يتم بعد مراجعة الإدارة واعتماد الطلب.</span>
        </div>
      </footer>
    </>
  );
}
