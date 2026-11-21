import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSellerProduct } from '@/lib/server/services/seller-product-service';
import { listVersions } from '@/lib/server/services/seller-version-service';
import { CreateVersionButton } from './create-version-button';

export default async function VersionsPage({ params }: { params: { id: string } }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();

  const product = await getSellerProduct(user.id, params.id);
  if (!product) notFound();

  const versions = await listVersions(params.id);

  return (
    <main className="p-6 space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/seller/products" className="hover:underline">منتجاتي</Link>
        {' / '}
        <Link href={`/seller/products/${params.id}`} className="hover:underline">{product.title}</Link>
        {' / '}
        <span>الإصدارات</span>
      </nav>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الإصدارات ({versions.length})</h1>
        <CreateVersionButton productId={params.id} />
      </div>

      <p className="text-sm text-muted-foreground border rounded p-3 bg-muted/30">
        كل إصدار يمثل نسخة من ملفات المنتج. المشتري يحصل على الإصدار المنشور وقت الشراء.
        الإصدارات القديمة تبقى متاحة لمن اشتراها.
      </p>

      {versions.length === 0 ? (
        <div className="border rounded p-8 text-center text-muted-foreground">
          <p>لا توجد إصدارات بعد.</p>
          <p className="text-xs mt-2">أنشئ الإصدار الأول ثم اربط به الملفات.</p>
        </div>
      ) : (
        <div className="border rounded divide-y">
          {versions.map(v => (
            <Link
              key={v.id}
              href={`/seller/products/${params.id}/versions/${v.id}`}
              className="block p-4 hover:bg-muted/30"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">الإصدار #{v.version_number}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {v.files_count} ملف
                    {v.published_at && ` — نُشر ${new Date(v.published_at).toLocaleDateString('ar')}`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  v.status === 'published' ? 'bg-green-100 text-green-800'
                  : v.status === 'archived' ? 'bg-gray-100 text-gray-800'
                  : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {v.status === 'published' ? 'منشور' : v.status === 'archived' ? 'مؤرشف' : 'مسودة'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}