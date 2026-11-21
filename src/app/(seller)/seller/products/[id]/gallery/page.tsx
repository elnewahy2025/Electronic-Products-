import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSellerProduct } from '@/lib/server/services/seller-product-service';
import { GalleryManager } from './gallery-manager';

export default async function GalleryPage({ params }: { params: { id: string } }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();

  const product = await getSellerProduct(user.id, params.id);
  if (!product) notFound();

  const { data: images } = await db
    .from('product_gallery_images')
    .select('id, url, sort_order')
    .eq('product_id', params.id)
    .order('sort_order', { ascending: true });

  return (
    <main className="p-6 space-y-6 max-w-3xl">
      <nav className="text-sm text-muted-foreground">
        <Link href="/seller/products" className="hover:underline">منتجاتي</Link>
        {' / '}
        <Link href={`/seller/products/${params.id}`} className="hover:underline">{product.title}</Link>
        {' / '}
        <span>المعرض</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold">معرض الصور</h1>
        <p className="text-sm text-muted-foreground mt-1">
          أضف حتى 8 صور إضافية لعرضها تحت الصورة الرئيسية.
        </p>
      </div>

      <GalleryManager productId={params.id} initial={images ?? []} />
    </main>
  );
}
