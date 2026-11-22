import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { listSellerProducts } from '@/lib/server/services/seller-product-service';
import { ProductStatusBadge } from '@/components/shared/product-status-badge';
import { CopyProductLinkButton } from '@/components/seller/copy-product-link-button';

export default async function SellerProductsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const products = await listSellerProducts(user.id);

  return (
    <main className="w-full space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">منتجاتي ({products.length})</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            إدارة منتجاتك الرقمية ومعاينتها ومشاركة روابطها مباشرة.
          </p>
        </div>
        <Link href="/seller/products/new" className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-95 transition">
          + منتج جديد
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="ui-box text-center text-muted-foreground py-10">
          <p>لا توجد منتجات بعد.</p>
          <Link href="/seller/products/new" className="text-primary font-semibold mt-2 inline-block hover:underline">
            أضف أول منتج ←
          </Link>
        </div>
      ) : (
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="text-right p-3 font-semibold">المنتج</th>
                <th className="text-right p-3 font-semibold">السعر</th>
                <th className="text-right p-3 font-semibold">الإصدارات</th>
                <th className="text-right p-3 font-semibold">الحالة</th>
                <th className="text-left p-3 font-semibold">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/20 transition">
                  <td className="p-3">
                    <Link href={`/seller/products/${p.id}`} className="font-semibold hover:text-primary transition">
                      {p.title}
                    </Link>
                    {p.short_description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                        {p.short_description}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-xs font-medium ui-num">{p.price_amount} {p.price_currency}</td>
                  <td className="p-3 text-xs ui-num">{p.versions_count}</td>
                  <td className="p-3">
                    <ProductStatusBadge status={p.status} />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {p.status === 'published' && (
                        <>
                          <Link
                            href={`/products/${encodeURIComponent(p.slug)}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted transition"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>معاينة</span>
                          </Link>
                          <CopyProductLinkButton slug={p.slug} />
                        </>
                      )}
                      <Link
                        href={`/seller/products/${p.id}`}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted transition"
                      >
                        تعديل
                      </Link>
                      <Link
                        href={`/seller/products/${p.id}/versions`}
                        className="rounded-lg bg-accent text-accent-foreground px-2.5 py-1 text-xs font-medium hover:opacity-90 transition"
                      >
                        الإصدارات
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}