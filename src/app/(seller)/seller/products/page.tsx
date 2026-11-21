import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listSellerProducts } from '@/lib/server/services/seller-product-service';

export default async function SellerProductsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const products = await listSellerProducts(user.id);

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">منتجاتي ({products.length})</h1>
        <Link href="/seller/products/new" className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm">
          + منتج جديد
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="border rounded p-8 text-center text-muted-foreground">
          <p>لا توجد منتجات بعد.</p>
          <Link href="/seller/products/new" className="text-primary mt-2 inline-block">
            أضف أول منتج ←
          </Link>
        </div>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-right p-3">المنتج</th>
                <th className="text-right p-3">السعر</th>
                <th className="text-right p-3">الإصدارات</th>
                <th className="text-right p-3">الحالة</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    <Link href={`/seller/products/${p.id}`} className="font-medium hover:underline">
                      {p.title}
                    </Link>
                    {p.short_description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                        {p.short_description}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-xs">{p.price_amount} {p.price_currency}</td>
                  <td className="p-3 text-xs">{p.versions_count}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      p.status === 'published' ? 'bg-green-100 text-green-800'
                      : p.status === 'draft' ? 'bg-yellow-100 text-yellow-800'
                      : p.status === 'paused' ? 'bg-orange-100 text-orange-800'
                      : p.status === 'suspended' ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                    }`}>{p.status}</span>
                  </td>
                  <td className="p-3">
                    <Link href={`/seller/products/${p.id}/versions`} className="text-primary text-xs">
                      الإصدارات
                    </Link>
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